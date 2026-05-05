// ── Theme ─────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = theme === 'dark' ? '☀' : '☾';
}
function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme(state.theme);
  localStorage.setItem('wt_theme_v1', state.theme);
  buildChart();
}

// ── Unit Toggle ───────────────────────────────────────────────────
function setWeightUnit(u) {
  state.weightUnit = u;
  persist();
  document.querySelectorAll('.wu-btn').forEach(b => b.classList.toggle('active', b.dataset.u === u));
  const lbl = document.getElementById('log-w-label');
  if (lbl) lbl.textContent = 'log weight (' + u + ')';
  updateStats();
  buildChart();
  renderMilestones();
  renderLog();
  syncCalcInputsFromCfg();
  renderCalcResults();
}

function setHeightUnit(u) {
  state.heightUnit = u;
  persist();
  document.querySelectorAll('.hu-btn').forEach(b => b.classList.toggle('active', b.dataset.u === u));
  const ftin = u === 'ftin';
  ['calc-ht-cm-row','m-ht-cm-row'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = ftin ? 'none' : ''; });
  ['calc-ht-ftin-row','m-ht-ftin-row'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = ftin ? '' : 'none'; });
  syncCalcInputsFromCfg();
  renderCalcResults();
}

// ── Stats + Pace Banner ───────────────────────────────────────────
function updateStats() {
  const cwKg  = latestWeight();
  const swKg  = state.cfg.startWeight;
  const gwKg  = state.cfg.goalWeight;
  const lost  = Math.round((swKg - cwKg) * 10) / 10;
  const togo  = Math.round((cwKg - gwKg) * 10) / 10;
  const total = swKg - gwKg;
  const pct   = total !== 0 ? Math.max(0, Math.min(100, Math.round((Math.abs(lost) / Math.abs(total)) * 100))) : 0;
  const dLeft = Math.max(0, daysBetween(todayStr(), state.cfg.deadline));
  const wl    = weightLabel();
  const d     = v => kgToDisplay(v);

  document.getElementById('st-start').innerHTML = d(swKg) + `<span>${wl}</span>`;
  document.getElementById('st-cur').innerHTML   = d(cwKg) + `<span>${wl}</span>`;
  document.getElementById('st-lost').innerHTML  = Math.abs(d(lost)) + `<span>${wl}</span>`;
  document.getElementById('st-togo').innerHTML  = Math.max(0, d(togo)) + `<span>${wl}</span>`;
  document.getElementById('st-days').innerHTML  = dLeft + '<span style="font-size:.7rem;color:var(--muted)"> d</span>';

  document.getElementById('prog-fill').style.width = pct + '%';
  document.getElementById('pg-pct').textContent    = pct + '% complete';
  document.getElementById('pg-start').textContent  = d(swKg) + ' ' + wl;
  document.getElementById('pg-goal').textContent   = d(gwKg) + ' ' + wl;

  // Pace banner
  const pace    = paceStatus();
  const banner  = document.getElementById('pace-banner');
  const paceMsg = document.getElementById('pace-msg');
  if (banner && paceMsg && pace !== null) {
    const absD  = Math.abs(Math.round(d(pace) * 10) / 10);
    const ahead = pace > 0;
    const projEnd = actualProjectedAtDeadline();
    let msg = '';
    if (absD < 0.2) {
      msg = 'Right on track — keep it up.';
      banner.className = 'pace-banner pace-on';
    } else if (ahead) {
      msg = `You're ${absD} ${wl} ahead of target.`;
      if (projEnd !== null) msg += ` At this rate you'll hit ${Math.round(d(projEnd) * 10) / 10} ${wl} by deadline.`;
      banner.className = 'pace-banner pace-ahead';
    } else {
      msg = `You're ${absD} ${wl} behind target.`;
      if (projEnd !== null) msg += ` At this rate you'll hit ${Math.round(d(projEnd) * 10) / 10} ${wl} by deadline.`;
      banner.className = 'pace-banner pace-behind';
    }
    paceMsg.textContent = msg;
    banner.style.display = '';
  } else if (banner) {
    banner.style.display = 'none';
  }

  renderCalcResults();
}

// ── Milestones ────────────────────────────────────────────────────
function renderMilestones() {
  const milestones = generateMilestones();
  const list       = document.getElementById('ms-list');
  const pill       = document.getElementById('ms-pill');
  list.innerHTML   = '';

  if (state.msChecked.length !== milestones.length) {
    state.msChecked = new Array(milestones.length).fill(false);
    persist();
  }

  const reached = state.msChecked.filter(Boolean).length;
  if (pill) pill.textContent = reached + ' / ' + milestones.length;

  milestones.forEach((m, i) => {
    const done = state.msChecked[i] || false;
    const row  = document.createElement('div');
    row.className = 'ms-row' + (done ? ' done' : '') + (m.isGoal ? ' is-goal' : '');
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.innerHTML = `
      <div class="ms-circle">
        <svg class="ms-check" width="10" height="10" viewBox="0 0 10 10">
          <polyline points="1.5,5 4,7.5 8.5,2.5" fill="none" stroke="#080808" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="ms-label">${m.label}</div>
      <div class="ms-date">by ${fmtDateShort(m.dateStr)}</div>
      <span class="ms-badge">${done ? 'reached' : m.isGoal ? 'goal' : 'upcoming'}</span>`;

    const toggle = () => {
      // Re-derive milestones fresh to avoid stale closure issues
      const freshMilestones = generateMilestones();
      const freshM = freshMilestones[i];
      if (!freshM) return;

      const nowChecked = !state.msChecked[i];
      state.msChecked[i] = nowChecked;

      if (nowChecked) {
        // Remove any existing milestone entry for this weight first
        state.weightLog = state.weightLog.filter(
          e => !(e.fromMilestone && Math.abs(e.weight - freshM.w) < 0.001)
        );
        // Write entry at the milestone's projected date
        state.weightLog.push({ date: freshM.dateStr, weight: freshM.w, fromMilestone: true });
        state.weightLog.sort((a, b) => a.date.localeCompare(b.date));
      } else {
        // Remove by weight value, not date (dates can collide between milestones)
        state.weightLog = state.weightLog.filter(
          e => !(e.fromMilestone && Math.abs(e.weight - freshM.w) < 0.001)
        );
        ensureStartEntry();
      }

      persist();
      buildChart();
      renderMilestones();
      renderLog();
      updateStats();
    };

    row.addEventListener('click', toggle);
    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    list.appendChild(row);
  });
}

// ── Accordion ─────────────────────────────────────────────────────
function initAccordion() {
  const acc    = document.getElementById('ms-accordion');
  const header = document.getElementById('ms-accordion-header');
  if (!acc || !header) return;

  // Apply saved state
  if (state.accordionOpen) acc.classList.add('open');
  else acc.classList.remove('open');

  const fresh = header.cloneNode(true);
  header.parentNode.replaceChild(fresh, header);
  fresh.addEventListener('click', () => {
    acc.classList.toggle('open');
    state.accordionOpen = acc.classList.contains('open');
    persist();
  });
}

// ── Calorie Calculator ────────────────────────────────────────────
function syncCalcInputsFromCfg() {
  const c = state.cfg;
  if (!c) return;
  const age = document.getElementById('calc-age');
  const gen = document.getElementById('calc-gender');
  const act = document.getElementById('calc-activity');
  if (age) age.value = c.age || '';
  if (gen) gen.value = c.gender || '';
  if (act) act.value = c.activityLevel || '';
  if (c.heightCm) {
    if (state.heightUnit === 'cm') {
      const el = document.getElementById('calc-ht-cm');
      if (el) el.value = Math.round(c.heightCm);
    } else {
      const conv = cmToDisplay(c.heightCm);
      const ft   = document.getElementById('calc-ht-ft');
      const ins  = document.getElementById('calc-ht-in');
      if (ft)  ft.value  = conv.ft;
      if (ins) ins.value = conv.ins;
    }
  }
}

function renderCalcResults() {
  const results = document.getElementById('calc-results');
  if (!results) return;
  const data = calcNutrition();
  if (!data) {
    results.innerHTML = '<div class="calc-placeholder">Fill in your age, height, gender &amp; activity level to see calorie targets.</div>';
    return;
  }
  results.innerHTML = `
    <div class="calc-result-row"><span class="calc-result-label">BMR</span><span class="calc-result-val">${data.bmr} kcal</span></div>
    <div class="calc-result-row"><span class="calc-result-label">TDEE (with activity)</span><span class="calc-result-val">${data.tdee} kcal</span></div>
    <div class="calc-result-row"><span class="calc-result-label">Target daily calories</span><span class="calc-result-val accent">${data.targetCals} kcal</span></div>
    <div class="calc-result-row"><span class="calc-result-label">Daily deficit</span><span class="calc-result-val blue">${data.deficit} kcal</span></div>
    <div class="calc-result-row">
      <span class="calc-result-label">Projected loss / week</span>
      <span class="calc-result-val">${data.projPerWeek} ${data.wl}</span>
    </div>
    <div class="calc-result-row"><span class="calc-result-label">Days to deadline</span><span class="calc-result-val">${data.daysLeft}</span></div>
    <p class="calc-note">Target calories based on hitting your goal by your deadline. Min 1,200 kcal. Aim for ~2g protein per kg bodyweight to preserve muscle.</p>`;
}

// ── Weight Log (with inline edit) ─────────────────────────────────
function renderLog() {
  const body = document.getElementById('log-body');
  body.innerHTML = '';
  const wl = weightLabel();

  if (state.weightLog.length === 0) {
    body.innerHTML = '<tr class="empty-row"><td colspan="5">no entries yet</td></tr>';
    return;
  }

  const sorted = [...state.weightLog].sort((a, b) => b.date.localeCompare(a.date));

  sorted.forEach((e, i) => {
    const prev    = sorted[i + 1];
    const chgKg   = prev ? Math.round((e.weight - prev.weight) * 100) / 100 : null;
    const chgDisp = chgKg !== null ? Math.round(kgToDisplay(Math.abs(chgKg)) * 10) / 10 : null;
    const cs      = chgKg !== null ? (chgKg < 0 ? 'td-pos' : 'td-neg') : '';
    const chgStr  = chgDisp !== null ? (chgKg < 0 ? '−' : '+') + chgDisp + ' ' + wl : '—';
    const isMilestone = e.fromMilestone === true;

    const isEditing = state.editingDate === e.date;
    const tr = document.createElement('tr');
    if (isMilestone) tr.classList.add('milestone-log-row');

    if (isEditing && !isMilestone) {
      tr.innerHTML = `
        <td>${fmtDate(e.date)}</td>
        <td><input class="log-inline-input" type="number" id="edit-val" value="${kgToDisplay(e.weight)}" step="0.1" min="30" max="700" style="width:80px"></td>
        <td>${chgStr}</td>
        <td><button class="edit-save-btn" data-date="${e.date}">save</button><button class="edit-cancel-btn">cancel</button></td>
        <td></td>`;
    } else if (isMilestone) {
      tr.innerHTML = `
        <td>${fmtDate(e.date)}</td>
        <td>${kgToDisplay(e.weight)} ${wl}</td>
        <td class="${cs}">${chgStr}</td>
        <td><span class="ms-log-tag">milestone ✓</span></td>
        <td></td>`;
    } else {
      tr.innerHTML = `
        <td>${fmtDate(e.date)}</td>
        <td>${kgToDisplay(e.weight)} ${wl}</td>
        <td class="${cs}">${chgStr}</td>
        <td><button class="edit-btn" data-date="${e.date}" aria-label="Edit">✎</button></td>
        <td><button class="del-btn" data-date="${e.date}" aria-label="Delete">×</button></td>`;
    }
    body.appendChild(tr);
  });

  // Bind events
  body.querySelectorAll('.del-btn').forEach(btn =>
    btn.addEventListener('click', () => delLog(btn.dataset.date)));

  body.querySelectorAll('.edit-btn').forEach(btn =>
    btn.addEventListener('click', () => { state.editingDate = btn.dataset.date; renderLog(); }));

  body.querySelectorAll('.edit-save-btn').forEach(btn =>
    btn.addEventListener('click', () => saveEditLog(btn.dataset.date)));

  body.querySelectorAll('.edit-cancel-btn').forEach(btn =>
    btn.addEventListener('click', () => { state.editingDate = null; renderLog(); }));

  // Focus inline input
  const inp = document.getElementById('edit-val');
  if (inp) { inp.focus(); inp.select(); }
  inp && inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveEditLog(state.editingDate);
    if (e.key === 'Escape') { state.editingDate = null; renderLog(); }
  });
}

function saveEditLog(date) {
  const inp = document.getElementById('edit-val');
  if (!inp) return;
  const raw = parseFloat(inp.value);
  if (isNaN(raw) || raw <= 0) return;
  const wKg = displayToKg(raw);
  state.weightLog = state.weightLog.map(e => e.date === date ? { ...e, weight: wKg } : e);
  state.editingDate = null;
  persist();
  buildChart();
  renderLog();
  updateStats();
}

function logWeight() {
  const wInput = document.getElementById('log-w');
  const dInput = document.getElementById('log-d');
  const rawVal = parseFloat(wInput.value);
  const d      = dInput.value || todayStr();
  if (isNaN(rawVal) || rawVal <= 0) { wInput.focus(); return; }

  const wKg = displayToKg(rawVal);

  // If there's a milestone entry for this date, replace it and uncheck the milestone
  const existingMilestone = state.weightLog.find(e => e.date === d && e.fromMilestone);
  if (existingMilestone) {
    const milestones = generateMilestones();
    const msIdx = milestones.findIndex(m => m.dateStr === d);
    if (msIdx >= 0) state.msChecked[msIdx] = false;
  }

  state.weightLog = state.weightLog.filter(e => e.date !== d);
  state.weightLog.push({ date: d, weight: wKg }); // no fromMilestone flag = manual
  state.weightLog.sort((a, b) => a.date.localeCompare(b.date));
  ensureStartEntry();
  persist();

  wInput.value = '';
  const fb = document.getElementById('log-fb');
  fb.classList.add('show');
  setTimeout(() => fb.classList.remove('show'), 2000);

  buildChart();
  renderMilestones();
  renderLog();
  updateStats();
}

function delLog(date) {
  // Don't allow deleting the start entry — it's the anchor
  if (date === state.cfg.startDate) return;
  if (state.editingDate === date) state.editingDate = null;
  state.weightLog = state.weightLog.filter(e => e.date !== date);
  ensureStartEntry();
  persist();
  buildChart();
  renderLog();
  updateStats();
}

// ── Tabs ──────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      fresh.classList.add('active');
      document.getElementById('tab-' + fresh.dataset.tab).classList.add('active');
    });
  });
}

// ── Setup ─────────────────────────────────────────────────────────
function setupDone() {
  const cwRaw = parseFloat(document.getElementById('s-cw').value);
  const gwRaw = parseFloat(document.getElementById('s-gw').value);
  const sd    = document.getElementById('s-sd').value;
  const dl    = document.getElementById('s-dl').value;

  if (isNaN(cwRaw) || isNaN(gwRaw) || !sd || !dl) {
    alert('Please fill in all fields.');
    return;
  }
  if (Math.abs(cwRaw - gwRaw) < 0.1) { alert('Starting and goal weight cannot be the same.'); return; }

  const swKg = displayToKg(cwRaw);
  const gwKg = displayToKg(gwRaw);

  state.cfg = {
    startWeight: swKg, goalWeight: gwKg,
    startDate: sd, deadline: dl,
    age: '', gender: '', heightCm: '', activityLevel: '',
  };
  state.msChecked = [];
  state.weightLog = [];
  ensureStartEntry();
  persist();
  showApp();
}

function showApp() {
  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('app').style.display          = 'block';
  document.getElementById('log-d').value                = todayStr();

  // Always guarantee start entry exists
  ensureStartEntry();
  persist();

  document.querySelectorAll('.wu-btn').forEach(b => b.classList.toggle('active', b.dataset.u === state.weightUnit));
  document.querySelectorAll('.hu-btn').forEach(b => b.classList.toggle('active', b.dataset.u === state.heightUnit));
  setHeightUnit(state.heightUnit);

  const lbl = document.getElementById('log-w-label');
  if (lbl) lbl.textContent = 'log weight (' + state.weightUnit + ')';

  initTabs();
  initAccordion();
  updateStats();
  buildChart();
  renderMilestones();
  renderLog();
  syncCalcInputsFromCfg();
  renderCalcResults();
}

// ── Settings Modal ────────────────────────────────────────────────
function openModal() {
  if (!state.cfg) return;
  const c = state.cfg;
  document.getElementById('m-sw').value       = kgToDisplay(c.startWeight);
  document.getElementById('m-gw').value       = kgToDisplay(c.goalWeight);
  document.getElementById('m-sd').value       = c.startDate;
  document.getElementById('m-dl').value       = c.deadline;
  document.getElementById('m-age').value      = c.age || '';
  document.getElementById('m-gender').value   = c.gender || '';
  document.getElementById('m-activity').value = c.activityLevel || '';
  if (c.heightCm) {
    if (state.heightUnit === 'cm') {
      document.getElementById('m-ht-cm').value = Math.round(c.heightCm);
    } else {
      const conv = cmToDisplay(c.heightCm);
      document.getElementById('m-ht-ft').value = conv.ft;
      document.getElementById('m-ht-in').value = conv.ins;
    }
  }
  document.getElementById('m-ht-cm-row').style.display   = state.heightUnit === 'cm'   ? '' : 'none';
  document.getElementById('m-ht-ftin-row').style.display = state.heightUnit === 'ftin' ? '' : 'none';
  document.getElementById('modal').classList.add('open');
}

function closeModal() { document.getElementById('modal').classList.remove('open'); }

function saveModal() {
  const swRaw = parseFloat(document.getElementById('m-sw').value);
  const gwRaw = parseFloat(document.getElementById('m-gw').value);
  const sd    = document.getElementById('m-sd').value;
  const dl    = document.getElementById('m-dl').value;
  if (isNaN(swRaw) || isNaN(gwRaw) || !sd || !dl) return;

  let hCm = state.cfg.heightCm || '';
  if (state.heightUnit === 'cm') {
    const v = document.getElementById('m-ht-cm').value;
    if (v) hCm = parseFloat(v);
  } else {
    const ft = document.getElementById('m-ht-ft').value;
    const i  = document.getElementById('m-ht-in').value;
    if (ft || i) hCm = displayToCm(ft, i);
  }

  state.cfg = {
    ...state.cfg,
    startWeight:   displayToKg(swRaw),
    goalWeight:    displayToKg(gwRaw),
    startDate:     sd,
    deadline:      dl,
    age:           document.getElementById('m-age').value,
    gender:        document.getElementById('m-gender').value,
    activityLevel: document.getElementById('m-activity').value,
    heightCm:      hCm,
  };
  state.msChecked = [];
  // Remove all milestone-sourced log entries since milestones will regenerate
  state.weightLog = state.weightLog.filter(e => !e.fromMilestone);
  ensureStartEntry();
  persist();
  closeModal();
  updateStats();
  buildChart();
  renderMilestones();
  syncCalcInputsFromCfg();
  renderCalcResults();
}

// ── Confirm Reset ─────────────────────────────────────────────────
function resetAll()        { document.getElementById('confirm-modal').classList.add('open'); }
function closeConfirmModal() { document.getElementById('confirm-modal').classList.remove('open'); }
function confirmReset()    { Object.values(KEYS).forEach(k => localStorage.removeItem(k)); location.reload(); }
