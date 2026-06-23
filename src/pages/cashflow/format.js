// Shared formatting + derivation helpers for the Cashflow module.

export const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n ?? 0);

export const fmtDec = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);

// 0.18 → "18%"
export const fmtPct = (n) => (n == null ? '—' : `${(n * 100).toFixed(0)}%`);

// '2026-06-10' → '6/10/26' (compact, like the workbook). Date-only, no TZ drift.
export function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y) return '—';
  return `${m}/${d}/${String(y).slice(2)}`;
}

// Today's date as 'YYYY-MM-DD' in local time (for date inputs + day math).
export function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Whole days from today to an ISO date (negative = overdue / in the past).
export function daysUntil(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y) return null;
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - t0) / 86400000);
}

export const daysSince = (iso) => {
  const d = daysUntil(iso);
  return d == null ? null : -d;
};

// Per-frequency amount → monthly equivalent ("Mon."), matching the workbook.
const FREQ_TO_MONTHLY = {
  annually: 1 / 12,
  yearly: 1 / 12,
  'semi-annually': 1 / 6,
  semiannually: 1 / 6,
  quarterly: 1 / 3,
  monthly: 1,
  'bi-weekly': 26 / 12,
  biweekly: 26 / 12,
  weekly: 52 / 12,
  daily: 30.44,
};

export function monthlyOf(amount, frequency) {
  const factor = FREQ_TO_MONTHLY[String(frequency || 'monthly').toLowerCase()] ?? 1;
  return (amount ?? 0) * factor;
}

export const FREQUENCIES = ['Monthly', 'Annually', 'Bi-Weekly', 'Weekly', 'Quarterly', 'Semi-Annually', 'Daily'];

// ── Conditional-formatting heat colors (dark-theme friendly) ──────────────────

// hue 0=red → 120=green, returned as readable text + faint background.
function heat(hue) {
  return { color: `hsl(${hue} 75% 62%)`, background: `hsl(${hue} 70% 45% / 0.15)` };
}

// Days to next payment: ≤7 red, ~14 yellow, ≥30 green; overdue = deep red.
export function daysToColor(days) {
  if (days == null) return null;
  if (days < 0) return { color: 'hsl(0 85% 70%)', background: 'hsl(0 80% 45% / 0.22)' };
  const clamped = Math.max(7, Math.min(30, days));
  const t = (clamped - 7) / (30 - 7);     // 0 at 7d → 1 at 30d
  return heat(t * 120);
}

// "Updated" recency: >90d stale (red), ~30–90 yellow, ≤today green.
export function updatedColor(iso) {
  const since = daysSince(iso);
  if (since == null) return null;
  const clamped = Math.max(0, Math.min(90, since));
  const t = clamped / 90;                  // 0 today → 1 at 90d
  return heat(120 * (1 - t));
}

// APR: lower is better. ≤10% green → ~20% yellow → ≥30% red. (fraction in, 0.30)
export function aprColor(apr) {
  if (apr == null) return null;
  const clamped = Math.max(0.10, Math.min(0.30, apr));
  const t = (clamped - 0.10) / 0.20;       // 0 at 10% → 1 at 30%
  return heat(120 * (1 - t));
}

// Payments remaining: fewer = closer to payoff (green) → many (red).
// ≤6 green → ~24 yellow → ≥48 red.
export function paymentsRemainingColor(n) {
  if (n == null) return null;
  const clamped = Math.max(0, Math.min(48, n));
  const t = clamped / 48;
  return heat(120 * (1 - t));
}

// Expected payoff date: sooner = green → later = red. Past/very soon = green.
// today → green, ~3 years out → red.
export function payoffColor(iso) {
  const days = daysUntil(iso);
  if (days == null) return null;
  if (days <= 0) return heat(120);
  const clamped = Math.min(1095, days);     // cap at ~3 years
  const t = clamped / 1095;
  return heat(120 * (1 - t));
}

// Relative heat across a column's range: lowest = green, highest = red.
// Used for "Cost Per Type" where the scale is data-dependent (a few cents to
// many dollars), mirroring the workbook's green→red color scale.
export function scaleColor(value, min, max) {
  if (value == null || max == null || min == null || max === min) return null;
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return heat(120 * (1 - t));
}

// Highlight values above an average (e.g. Cost/Year over the mean). Above = red
// tint; at/below = no emphasis.
export function aboveAvgColor(value, avg) {
  if (value == null || avg == null) return null;
  if (value > avg) return { color: 'hsl(0 85% 70%)', background: 'hsl(0 80% 45% / 0.18)' };
  return null;
}

// ── Debt amortization (mirrors the workbook's NPER-based formulas) ─────────────

// Excel NPER(rate, -pmt, pv): number of monthly periods to pay `pv` off at
// `pmt`/month and monthly `rate`. Returns null when it never amortizes (payment
// doesn't cover interest) — matching the workbook's IFERROR("").
export function nper(rate, pmt, pv) {
  if (!pmt || pmt <= 0 || !pv || pv <= 0) return null;
  if (!rate) return pv / pmt;                 // 0% APR → simple division
  const denom = pmt - pv * rate;              // payment left after interest
  if (denom <= 0) return null;                // never pays down
  return Math.log(pmt / denom) / Math.log(1 + rate);
}

// Payments Remaining:
//   =IF(CreditType<>"BNPL", NPER(APR/12,-NormalPayment,Balance),
//                           ROUNDUP(Balance/NormalPayment,0))
export function paymentsRemaining(debt) {
  const pmt = debt.normal_payment;
  const bal = debt.balance;
  if (!pmt || pmt <= 0 || !bal || bal <= 0) return null;
  if (debt.credit_type === 'BNPL') return Math.ceil(bal / pmt);
  return nper((debt.apr ?? 0) / 12, pmt, bal);
}

// Expected Payoff Date:
//   =IFERROR(MIN(LastDate, NPER(APR/12,-NormalPayment,Balance)*30 + TODAY()), "")
export function expectedPayoffDate(debt) {
  const n = nper((debt.apr ?? 0) / 12, debt.normal_payment, debt.balance);
  if (n == null) return debt.last_date || null;
  const d = new Date();
  d.setDate(d.getDate() + Math.round(n * 30));
  const p = (x) => String(x).padStart(2, '0');
  const candidate = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  // MIN(last_date, candidate): the earlier of the two when last_date is set.
  return debt.last_date && debt.last_date < candidate ? debt.last_date : candidate;
}
