// ── Storage Keys ─────────────────────────────────────────────────
const KEYS = {
  cfg:          'wt_cfg_v6',
  log:          'wt_log_v6',
  ms:           'wt_ms_v6',
  theme:        'wt_theme_v1',
  units:        'wt_units_v1',
  accordionOpen:'wt_accordion_v1',
};

// ── State ─────────────────────────────────────────────────────────
const state = {
  cfg:          null,
  weightLog:    [],
  msChecked:    [],
  theme:        'dark',
  weightUnit:   'kg',
  heightUnit:   'cm',
  accordionOpen: true,
  editingDate:  null,   // date string being inline-edited
};

// ── Unit Conversions ──────────────────────────────────────────────
const KG_TO_LBS = 2.20462;
const LBS_TO_KG = 1 / KG_TO_LBS;
const CM_TO_IN  = 0.393701;

function kgToDisplay(kg) {
  if (state.weightUnit === 'lbs') return Math.round(kg * KG_TO_LBS * 10) / 10;
  return Math.round(kg * 10) / 10;
}
function displayToKg(val) {
  if (state.weightUnit === 'lbs') return Math.round(val * LBS_TO_KG * 100) / 100;
  return parseFloat(val);
}
function cmToDisplay(cm) {
  if (state.heightUnit === 'ftin') {
    const totalIn = cm * CM_TO_IN;
    return { ft: Math.floor(totalIn / 12), ins: Math.round(totalIn % 12) };
  }
  return Math.round(cm);
}
function displayToCm(val, ins) {
  if (state.heightUnit === 'ftin') {
    return Math.round(((parseFloat(val) || 0) * 12 + (parseFloat(ins) || 0)) / CM_TO_IN);
  }
  return parseFloat(val);
}
function weightLabel() { return state.weightUnit === 'lbs' ? 'lbs' : 'kg'; }

// ── Persist & Load ────────────────────────────────────────────────
function persist() {
  localStorage.setItem(KEYS.cfg,          JSON.stringify(state.cfg));
  localStorage.setItem(KEYS.log,          JSON.stringify(state.weightLog));
  localStorage.setItem(KEYS.ms,           JSON.stringify(state.msChecked));
  localStorage.setItem(KEYS.theme,        state.theme);
  localStorage.setItem(KEYS.units,        JSON.stringify({ weightUnit: state.weightUnit, heightUnit: state.heightUnit }));
  localStorage.setItem(KEYS.accordionOpen,state.accordionOpen ? '1' : '0');
}

function loadFromStorage() {
  state.cfg          = JSON.parse(localStorage.getItem(KEYS.cfg)  || 'null');
  state.weightLog    = JSON.parse(localStorage.getItem(KEYS.log)  || '[]');
  state.msChecked    = JSON.parse(localStorage.getItem(KEYS.ms)   || '[]');
  state.theme        = localStorage.getItem(KEYS.theme) || 'dark';
  state.accordionOpen= localStorage.getItem(KEYS.accordionOpen) !== '0'; // default open
  const u = JSON.parse(localStorage.getItem(KEYS.units) || 'null');
  if (u) { state.weightUnit = u.weightUnit || 'kg'; state.heightUnit = u.heightUnit || 'cm'; }
}

// ── Date Helpers ──────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10); }
function parseD(s)  { return new Date(s + 'T00:00:00'); }
function daysBetween(a, b) { return Math.round((parseD(b) - parseD(a)) / 86400000); }
function fmtDate(s) {
  return parseD(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}
function fmtDateShort(s) {
  return parseD(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ── Derived Data ──────────────────────────────────────────────────

// Ensure the start date weight entry always exists in the log
function ensureStartEntry() {
  const hasStart = state.weightLog.some(e => e.date === state.cfg.startDate);
  if (!hasStart) {
    state.weightLog.push({ date: state.cfg.startDate, weight: state.cfg.startWeight });
    state.weightLog.sort((a, b) => a.date.localeCompare(b.date));
  }
}

function latestWeight() {
  const today  = todayStr();
  const sorted = [...state.weightLog]
    .filter(e => e.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length > 0) return sorted[sorted.length - 1].weight;
  return state.cfg.startWeight;
}

function ratePerDay() {
  const d = daysBetween(state.cfg.startDate, state.cfg.deadline);
  return d > 0 ? (state.cfg.startWeight - state.cfg.goalWeight) / d : 0;
}

// Actual rate using linear regression across all entries up to today
// More robust than last-two-points which is too volatile
function actualRatePerDay() {
  const today  = todayStr();
  const sorted = [...state.weightLog]
    .filter(e => e.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return null;

  // Convert to (day_number, weight) pairs relative to start
  const points = sorted.map(e => ({
    x: daysBetween(state.cfg.startDate, e.date),
    y: e.weight,
  }));

  // Simple linear regression: y = mx + b, we want slope m (kg/day)
  const n     = points.length;
  const sumX  = points.reduce((s, p) => s + p.x, 0);
  const sumY  = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 0.001) return null;

  const slope = (n * sumXY - sumX * sumY) / denom; // kg per day (negative = losing)
  return -slope; // return as positive = losing weight
}

// Where you'll end up at deadline based on regression rate, projected from latest entry
function actualProjectedAtDeadline() {
  const rate = actualRatePerDay();
  if (rate === null) return null;
  const today  = todayStr();
  const sorted = [...state.weightLog]
    .filter(e => e.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return null;
  const latest   = sorted[sorted.length - 1];
  const daysLeft = daysBetween(latest.date, state.cfg.deadline);
  return latest.weight - rate * daysLeft;
}

// Are you ahead or behind? Returns kg (positive = ahead, negative = behind)
function paceStatus() {
  const today = todayStr();

  // All entries up to today
  const entriesUpToToday = state.weightLog.filter(e => e.date <= today);
  if (entriesUpToToday.length === 0) return null;

  // Need at least one entry beyond start date to be meaningful
  const beyondStart = entriesUpToToday.filter(e => e.date > state.cfg.startDate);
  if (beyondStart.length === 0) return null;

  // Get the most recent entry up to today
  const sorted = [...entriesUpToToday].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];

  // Compare that entry's weight against where the target line was on that same date
  const dElapsed = daysBetween(state.cfg.startDate, latest.date);
  if (dElapsed <= 0) return null;

  const targetAtDate = state.cfg.startWeight - ratePerDay() * dElapsed;
  return targetAtDate - latest.weight; // positive = ahead
}

function generateMilestones() {
  const sw = state.cfg.startWeight;
  const gw = state.cfg.goalWeight;
  const r  = ratePerDay();
  if (r === 0 || Math.abs(sw - gw) < 0.5) return [];

  const lo = Math.min(sw, gw);
  const hi = Math.max(sw, gw);
  const ms = [];

  for (let w = Math.ceil(lo); w <= Math.floor(hi); w++) {
    if (Math.abs(w - sw) < 0.01) continue;
    const days    = (sw - w) / r;
    const dt      = new Date(parseD(state.cfg.startDate));
    dt.setDate(dt.getDate() + Math.round(days));
    const dateStr = dt.toISOString().slice(0, 10);
    const isGoal  = Math.abs(w - gw) < 0.5;
    const dispW   = Math.round(kgToDisplay(w) * 10) / 10;
    ms.push({
      w,
      label: isGoal ? `Goal — ${dispW} ${weightLabel()}` : `${dispW} ${weightLabel()}`,
      dateStr,
      isGoal,
    });
  }
  if (sw > gw) ms.reverse();
  return ms;
}

// ── BMR / TDEE ────────────────────────────────────────────────────
function calcNutrition() {
  const c = state.cfg;
  if (!c || !c.age || !c.gender || !c.heightCm || !c.activityLevel) return null;

  const wKg = latestWeight();
  const hCm = parseFloat(c.heightCm);
  const a   = parseInt(c.age);

  let bmr = c.gender === 'male'
    ? 10 * wKg + 6.25 * hCm - 5 * a + 5
    : 10 * wKg + 6.25 * hCm - 5 * a - 161;

  const mults = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
  const tdee  = Math.round(bmr * (mults[c.activityLevel] || 1.375));
  bmr = Math.round(bmr);

  const daysLeft      = Math.max(1, daysBetween(todayStr(), c.deadline));
  const kgToLose      = Math.max(0, latestWeight() - c.goalWeight);
  const kcalNeeded    = Math.round((kgToLose * 7700) / daysLeft);
  const targetCals    = Math.max(1200, tdee - kcalNeeded);
  const actualDeficit = tdee - targetCals;
  const wl            = weightLabel();
  const projPerWeek   = Math.round(kgToDisplay(actualDeficit * 7 / 7700) * 10) / 10;

  return { bmr, tdee, targetCals: Math.round(targetCals), deficit: actualDeficit, projPerWeek, daysLeft, wl };
}

// ── CSV Export ────────────────────────────────────────────────────
function exportCSV() {
  if (state.weightLog.length === 0) return;
  const wl     = weightLabel();
  const sorted = [...state.weightLog].sort((a, b) => a.date.localeCompare(b.date));
  const rows   = [['Date', `Weight (${wl})`]];
  sorted.forEach(e => rows.push([e.date, kgToDisplay(e.weight)]));
  const csv  = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'weight-log.csv';
  a.click();
  URL.revokeObjectURL(url);
}
