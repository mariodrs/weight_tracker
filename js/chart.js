// ── Chart Instance ────────────────────────────────────────────────
let chartInstance = null;

function getChartColors() {
  const light = document.documentElement.getAttribute('data-theme') === 'light';
  return {
    proj:       light ? '#5a9e00' : '#c8f560',
    pace:       light ? '#e07000' : '#ff9f40',
    actual:     '#5c9eff',
    msReached:  light ? '#5a9e00' : '#c8f560',
    msUpcoming: 'rgba(110,110,110,0.55)',
    msBrdDone:  light ? '#3d6e00' : '#8fb830',
    msBrdUp:    'rgba(110,110,110,0.75)',
    grid:       light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)',
    tick:       light ? '#bbb' : '#3a3a3a',
    tip_bg:     light ? '#fff'  : '#181818',
    tip_bd:     light ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.07)',
    tip_t:      light ? '#888'  : '#555',
    tip_b:      light ? '#1a1a1a' : '#f2efe9',
  };
}

function buildChart() {
  const milestones = generateMilestones();

  if (state.msChecked.length !== milestones.length) {
    state.msChecked = new Array(milestones.length).fill(false);
    persist();
  }

  const totalDays = daysBetween(state.cfg.startDate, state.cfg.deadline);
  const step      = Math.max(1, Math.round(totalDays / 20));
  const labels    = [];
  const projData  = [];
  const swKg      = state.cfg.startWeight;
  const r         = ratePerDay();

  for (let d = 0; d <= totalDays; d += step) {
    const dt = new Date(parseD(state.cfg.startDate));
    dt.setDate(dt.getDate() + d);
    labels.push(fmtDateShort(dt.toISOString().slice(0, 10)));
    projData.push(Math.round(kgToDisplay(swKg - r * d) * 10) / 10);
  }
  labels.push(fmtDateShort(state.cfg.deadline));
  projData.push(Math.round(kgToDisplay(swKg - r * totalDays) * 10) / 10);

  // Actual logged data — all entries for drawing the line (including future milestones)
  const sorted = [...state.weightLog].sort((a, b) => a.date.localeCompare(b.date));
  let actualData = [];
  if (sorted.length > 0) {
    actualData = sorted.map(e => ({
      x: daysBetween(state.cfg.startDate, e.date) / step,
      y: Math.round(kgToDisplay(e.weight) * 10) / 10,
    }));
  } else {
    actualData = [{ x: 0, y: kgToDisplay(swKg) }];
  }

  // Pace projection line — regression rate extrapolated from latest entry to deadline
  const today = todayStr();
  const sortedToToday = sorted.filter(e => e.date <= today);
  let paceData = [];
  const actualRate = actualRatePerDay();
  if (actualRate !== null && sortedToToday.length >= 2) {
    const latest         = sortedToToday[sortedToToday.length - 1];
    const latestX        = daysBetween(state.cfg.startDate, latest.date) / step;
    const latestY        = Math.round(kgToDisplay(latest.weight) * 10) / 10;
    const daysToDeadline = daysBetween(latest.date, state.cfg.deadline);
    const endY           = Math.round(kgToDisplay(latest.weight - actualRate * daysToDeadline) * 10) / 10;
    paceData = [
      { x: latestX, y: latestY },
      { x: totalDays / step, y: endY },
    ];
  }

  // Milestones
  const msData = milestones.map(m => ({
    x: daysBetween(state.cfg.startDate, m.dateStr) / step,
    y: Math.round(kgToDisplay(m.w) * 10) / 10,
  }));

  const clr   = getChartColors();
  const msBg  = milestones.map((_, i) => state.msChecked[i] ? clr.msReached  : clr.msUpcoming);
  const msBrd = milestones.map((_, i) => state.msChecked[i] ? clr.msBrdDone  : clr.msBrdUp);

  const allY = [
    ...projData,
    ...actualData.map(p => p.y),
    ...paceData.map(p => p.y),
    ...milestones.map(m => kgToDisplay(m.w)),
  ];
  const minY = Math.floor(Math.min(...allY) - 2);
  const maxY = Math.ceil(Math.max(...allY) + 2);

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(document.getElementById('main-chart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Projection',
          data: projData,
          borderColor: clr.proj,
          borderWidth: 1.5,
          borderDash: [5, 4],
          pointRadius: 0,
          tension: 0.3,
          backgroundColor: 'transparent',
          order: 4,
        },
        {
          label: 'Your pace',
          data: paceData,
          type: 'scatter',
          parsing: false,
          borderColor: clr.pace,
          backgroundColor: 'transparent',
          showLine: true,
          borderWidth: 1.5,
          borderDash: [3, 3],
          pointRadius: 0,
          tension: 0,
          order: 3,
        },
        {
          label: 'Actual',
          data: actualData,
          type: 'scatter',
          parsing: false,
          borderColor: clr.actual,
          backgroundColor: 'transparent',
          showLine: true,
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: clr.actual,
          tension: 0.3,
          order: 2,
        },
        {
          label: 'Milestones',
          data: msData,
          type: 'scatter',
          parsing: false,
          pointRadius: 6,
          pointHoverRadius: 9,
          pointBackgroundColor: msBg,
          pointBorderColor: msBrd,
          pointBorderWidth: 1.5,
          showLine: false,
          borderWidth: 0,
          borderColor: 'transparent',
          backgroundColor: 'transparent',
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: clr.tip_bg,
          borderColor: clr.tip_bd,
          borderWidth: 1,
          titleColor: clr.tip_t,
          bodyColor: clr.tip_b,
          titleFont: { family: 'JetBrains Mono', size: 10 },
          bodyFont: { family: 'JetBrains Mono', size: 12 },
          callbacks: {
            title: () => '',
            label: ctx => {
              const wl = weightLabel();
              if (ctx.dataset.label === 'Milestones') {
                const m    = milestones[ctx.dataIndex];
                const tick = state.msChecked[ctx.dataIndex] ? '✓ ' : '';
                return tick + m.label + ' · ' + fmtDateShort(m.dateStr);
              }
              if (ctx.dataset.label === 'Your pace') return 'your pace: ' + ctx.parsed.y + ' ' + wl;
              if (ctx.dataset.label === 'Actual')    return 'actual: '    + ctx.parsed.y + ' ' + wl;
              return 'target: ' + ctx.parsed.y + ' ' + wl;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: clr.grid },
          ticks: { color: clr.tick, font: { family: 'JetBrains Mono', size: 10 }, maxRotation: 45, maxTicksLimit: 9 },
        },
        y: {
          min: minY,
          max: maxY,
          grid: { color: clr.grid },
          ticks: { color: clr.tick, font: { family: 'JetBrains Mono', size: 10 }, callback: v => v + ' ' + weightLabel() },
        },
      },
      onClick: (evt) => {
        const pts = chartInstance.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false);
        if (!pts.length) return;
        const pt = pts[0];
        // Find by label name so dataset index doesn't need to be hardcoded
        const dsLabel = chartInstance.data.datasets[pt.datasetIndex]?.label;
        if (dsLabel !== 'Milestones') return;

        const i  = pt.index;
        const ms = generateMilestones();
        const m  = ms[i];
        if (!m) return;

        const nowChecked = !state.msChecked[i];
        state.msChecked[i] = nowChecked;

        if (nowChecked) {
          state.weightLog = state.weightLog.filter(
            e => !(e.fromMilestone && Math.abs(e.weight - m.w) < 0.001)
          );
          state.weightLog.push({ date: m.dateStr, weight: m.w, fromMilestone: true });
          state.weightLog.sort((a, b) => a.date.localeCompare(b.date));
        } else {
          state.weightLog = state.weightLog.filter(
            e => !(e.fromMilestone && Math.abs(e.weight - m.w) < 0.001)
          );
          ensureStartEntry();
        }

        persist();
        buildChart();
        renderMilestones();
        renderLog();
        updateStats();
      },
    },
  });
}
