// Earnin usage statistics — the single source of truth for "how much am I
// leaning on Earnin?", shared by the Earnin tab and the Debt Payoff Calculator
// so the two can never quote different numbers.
//
// WHY A TRAILING WINDOW, NOT A LIFETIME AVERAGE
// Usage changed shape completely over the logged history — roughly $20-35/wk
// through 2022-2024, then $148/wk in 2025 and $297/wk across 2026. A lifetime
// average lands near $91/wk, which is ~5x lighter than the current reality and
// would badly understate how much gig income it takes to retire the habit. So
// anything that makes a decision off this figure reads a trailing window.

import { daysSince } from './format';

// The backfill's synthetic opening-balance row (migration 048) stands in for
// advances drawn before the export began. It's needed for the running balance
// to reconcile, but it is NOT a real draw — counting it would inflate totals
// and stretch the "tracked since" span back past the first genuine advance.
export const OPENING_BALANCE_KEY = 'monarch:opening-balance';

// The window every downstream consumer uses. 90 days ≈ 6.5 pay cycles: recent
// enough to track where usage actually is, long enough that one heavy fortnight
// (or a vacation) doesn't swing the answer.
export const RELIANCE_WINDOW_DAYS = 90;

// Windows offered in the Earnin tab's selector. `null` = all recorded history.
export const USAGE_WINDOWS = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 180, label: '180 days' },
  { days: null, label: 'All time' },
];

const WEEKS_PER_MONTH = 52 / 12;

/** Real advances only — drops repayments and the synthetic opening balance. */
export function realAdvances(rows = []) {
  return rows.filter((r) => r.kind === 'advance' && r.import_key !== OPENING_BALANCE_KEY);
}

/** Total advanced in [toDaysAgo, fromDaysAgo) days before today. */
export function advancedWithin(rows, fromDaysAgo, toDaysAgo = 0) {
  return realAdvances(rows).reduce((sum, r) => {
    const ago = daysSince(r.txn_date);
    return ago != null && ago >= toDaysAgo && ago < fromDaysAgo ? sum + (r.amount ?? 0) : sum;
  }, 0);
}

/**
 * Usage over a window. `windowDays === null` means all recorded history, in
 * which case the span runs from the first real advance to today.
 *
 * Returns { total, perWeek, perMonth, spanDays, prevTotal, delta, hasPrev }.
 * `delta` compares the window against the equivalent window before it, so the
 * same shape works whichever window is selected (there's no prior period to
 * compare against for all-time, hence `hasPrev`).
 */
export function usageStats(rows = [], windowDays = RELIANCE_WINDOW_DAYS) {
  const advances = realAdvances(rows);
  const firstISO = advances.reduce(
    (min, r) => (r.txn_date && (!min || r.txn_date < min) ? r.txn_date : min), null,
  );
  // Inclusive of today, so a single same-day advance reads as 1 day, not 0.
  const historyDays = firstISO ? Math.max(1, (daysSince(firstISO) ?? 0) + 1) : 0;

  if (!historyDays) {
    return { total: 0, perWeek: 0, perMonth: 0, spanDays: 0, prevTotal: 0, delta: 0, hasPrev: false };
  }

  // Never average over more days than actually exist, or a young log reads
  // artificially light (a 90-day window over 3 weeks of data would divide by 90).
  const spanDays = windowDays == null ? historyDays : Math.min(windowDays, historyDays);
  const total = windowDays == null
    ? advances.reduce((s, r) => s + (r.amount ?? 0), 0)
    : advancedWithin(rows, windowDays);

  const perWeek = total / (spanDays / 7);
  const prevTotal = windowDays == null ? 0 : advancedWithin(rows, windowDays * 2, windowDays);
  return {
    total,
    perWeek,
    perMonth: perWeek * WEEKS_PER_MONTH,
    spanDays,
    prevTotal,
    delta: total - prevTotal,
    // Only meaningful once the log reaches back far enough to cover both windows.
    hasPrev: windowDays != null && historyDays > windowDays,
  };
}

/**
 * The canonical weekly reliance figure — what the Debt Payoff Calculator (and
 * anything else deciding off real usage) reads. Always the trailing 90 days,
 * regardless of what window the Earnin tab happens to be displaying.
 */
export function relianceWeekly(rows = []) {
  return usageStats(rows, RELIANCE_WINDOW_DAYS).perWeek;
}
