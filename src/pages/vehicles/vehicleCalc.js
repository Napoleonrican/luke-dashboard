// vehicleCalc.js — pure derived math for the Vehicles module (no React), in
// the style of cashflow/waterfallCalc.js. Everything here is a function of its
// arguments so it's trivially unit-testable against real workbook rows.

// Fallback used only when there's not enough fuel-log history to compute a
// real miles/day figure (e.g. a brand-new vehicle with 0–1 fill-ups logged).
export const DEFAULT_MILES_PER_DAY = 40;

// ── date helpers (local-time, string-based — avoids TZ drift) ────────────────

function parseISO(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y) return null;
  return new Date(y, m - 1, d);
}

function toISO(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function asDate(v) {
  if (v instanceof Date) return v;
  return parseISO(v);
}

function daysBetween(a, b) {
  const da = asDate(a), db = asDate(b);
  if (!da || !db) return null;
  return Math.round((db - da) / 86400000);
}

function addMonths(iso, months) {
  const d = parseISO(iso);
  if (!d || months == null) return null;
  const out = new Date(d.getFullYear(), d.getMonth() + months, d.getDate());
  return toISO(out);
}

function addDays(iso, days) {
  const d = asDate(iso);
  if (!d || days == null) return null;
  const out = new Date(d);
  out.setDate(out.getDate() + Math.round(days));
  return toISO(out);
}

const sortAsc = (logs) => [...logs].sort((a, b) => asDate(a.fill_date) - asDate(b.fill_date));

// ── fuelStats ─────────────────────────────────────────────────────────────────
// Returns `logs` sorted chronologically (ascending), each augmented with:
//   miles           — odometer delta from the previous fill (null for the
//                      first fill in the series, since there's no prior point)
//   mpg             — miles / gallons; null for partial fills, since a
//                      partial-tank fill-up doesn't represent a full range
//   pricePerGallon  — total_cost / gallons
//   pricePerMile    — total_cost / miles
// Guards against bad odometer entries (typos, resets, out-of-order same-day
// fills) poisoning MPG/cost aggregates and blowing out chart axes — a single
// bad delta or a near-zero gallons reading can produce a per-fill MPG or
// $/gallon in the thousands, which then dominates any month/year it lands in.
const MAX_PLAUSIBLE_MILES = 2000;   // no realistic single fill-to-fill gap exceeds this
const MIN_RELIABLE_GALLONS = 0.5;   // below this, $/gallon is noise, not signal

export function fuelStats(logs) {
  const sorted = sortAsc(logs || []);
  let prevOdo = null;
  return sorted.map((log) => {
    const rawMiles = prevOdo == null ? null : log.odometer - prevOdo;
    const miles = rawMiles != null && rawMiles > 0 && rawMiles <= MAX_PLAUSIBLE_MILES ? rawMiles : null;
    prevOdo = log.odometer;
    const gallons = log.gallons || 0;
    const pricePerGallon = gallons >= MIN_RELIABLE_GALLONS ? log.total_cost / gallons : null;
    const mpg = !log.partial_fill && miles != null && gallons > 0 ? miles / gallons : null;
    const pricePerMile = miles > 0 ? log.total_cost / miles : null;
    return { ...log, miles, mpg, pricePerGallon, pricePerMile };
  });
}

// ── milesPerDay ────────────────────────────────────────────────────────────────
// Odometer span ÷ day span over the fills within the trailing `window` days of
// the latest fill (falls back to the whole history if fewer than two fills
// land in that window). Falls back to `override` (typically
// vehicle.miles_per_day_override), then DEFAULT_MILES_PER_DAY, when there's
// not enough history to compute a real rate.
export function milesPerDay(logs, { window = 90, override } = {}) {
  const sorted = sortAsc(logs || []);
  if (sorted.length < 2) return override ?? DEFAULT_MILES_PER_DAY;

  const latest = sorted[sorted.length - 1];
  const cutoff = addDays(latest.fill_date, -window);
  let recent = sorted.filter((l) => String(l.fill_date).slice(0, 10) >= cutoff);
  if (recent.length < 2) recent = sorted;

  const first = recent[0];
  const last = recent[recent.length - 1];
  const days = daysBetween(first.fill_date, last.fill_date);
  if (!days || days <= 0) return override ?? DEFAULT_MILES_PER_DAY;
  const miles = last.odometer - first.odometer;
  return miles / days;
}

// ── estimatedOdometer ────────────────────────────────────────────────────────
// Latest fill's odometer + milesPerDay × days elapsed since that fill. This is
// the anchor the Upcoming tab's due/ETA math is built on.
export function estimatedOdometer(logs, today = new Date(), opts = {}) {
  const sorted = sortAsc(logs || []);
  if (!sorted.length) return null;
  const latest = sorted[sorted.length - 1];
  const mpd = milesPerDay(sorted, opts);
  const days = Math.max(0, daysBetween(latest.fill_date, today) ?? 0);
  return latest.odometer + mpd * days;
}

// ── serviceDue ─────────────────────────────────────────────────────────────────
// milesDue = last_odometer + interval_miles; timeDue = last_completed_date +
// interval_months. eta is the projected date the mileage threshold is crossed
// (falls back to timeDue when there's no mileage interval). status is
// 'overdue' | 'soon' | 'ok' — whichever of miles/time is furthest along wins.
const SOON_MILES = 500;
const SOON_DAYS = 30;

export function serviceDue(planRow, { estOdo, milesPerDay: mpd = DEFAULT_MILES_PER_DAY, today = new Date() } = {}) {
  const milesDue = planRow.last_odometer != null && planRow.interval_miles != null
    ? planRow.last_odometer + planRow.interval_miles
    : null;
  const timeDue = planRow.last_completed_date != null && planRow.interval_months != null
    ? addMonths(planRow.last_completed_date, planRow.interval_months)
    : null;

  const milesRemaining = milesDue != null && estOdo != null ? milesDue - estOdo : null;
  const daysToMiles = milesRemaining != null && mpd > 0 ? milesRemaining / mpd : null;
  const daysRemainingTime = timeDue != null ? daysBetween(today, timeDue) : null;

  // ETA: whichever constraint is hit first (soonest date), same idea as the
  // workbook's Service Due — a service is due the moment EITHER the mileage
  // or the time interval is crossed.
  let eta = null;
  if (daysToMiles != null) eta = addDays(today, daysToMiles);
  if (timeDue != null && (eta == null || timeDue < eta)) eta = timeDue;

  const worstDays = [daysToMiles, daysRemainingTime].filter((d) => d != null);
  const minDays = worstDays.length ? Math.min(...worstDays) : null;

  let status = 'ok';
  if (minDays != null) {
    if (minDays <= 0) status = 'overdue';
    else if (minDays <= SOON_DAYS || (milesRemaining != null && milesRemaining <= SOON_MILES)) status = 'soon';
  }

  return { milesDue, timeDue, eta, status, milesRemaining, daysRemaining: minDays };
}

// ── costPerYear ────────────────────────────────────────────────────────────────
// Annualizes a plan row's avg_cost using whichever interval it has (matches
// the workbook's Cost Per Year column, which is avg cost × times-per-year).
// A months interval is exact; a miles-only interval needs milesPerDay to
// convert "every N miles" into "N times a year".
export function costPerYear(planRow, mpd = DEFAULT_MILES_PER_DAY) {
  if (planRow.avg_cost == null) return null;
  let timesPerYear = null;
  if (planRow.interval_months) timesPerYear = 12 / planRow.interval_months;
  else if (planRow.interval_miles && mpd > 0) timesPerYear = (mpd * 365) / planRow.interval_miles;
  return timesPerYear != null ? planRow.avg_cost * timesPerYear : null;
}

// ── lastServiceFromLog ────────────────────────────────────────────────────────
// The Upcoming tab's "last done" should reflect real Service Log entries, not
// a separate "mark completed" click — so a service is considered done as of
// the most recent visit whose line items include a matching service_type.
// Returns { date, odometer } for the newest match, or null if the service has
// never been logged (the plan row's own last_completed_date/last_odometer —
// e.g. from the initial workbook import — is the caller's fallback then).
export function lastServiceFromLog(serviceName, visits, itemsByVisitId) {
  const name = (serviceName || '').trim().toLowerCase();
  if (!name) return null;
  let best = null;
  for (const v of visits || []) {
    const items = itemsByVisitId[v.id] || [];
    const matches = items.some((it) => (it.service_type || '').trim().toLowerCase() === name);
    if (!matches) continue;
    if (!best || v.service_date > best.date) best = { date: v.service_date, odometer: v.odometer };
  }
  return best;
}

// ── rollups ────────────────────────────────────────────────────────────────────
// Per-month / per-year / per-week aggregates for the Insights tab: miles,
// gallons, cost, MPG, $/gal, $/mile (fuel), plus maintenance cost per year
// and per mile, and total cost of ownership per mile (fuel + maintenance).
function monthKey(iso) { return String(iso).slice(0, 7); }          // '2026-07'
function yearKey(iso) { return String(iso).slice(0, 4); }            // '2026'
function weekKey(iso) {
  const d = asDate(iso);
  if (!d) return null;
  // Week starting Sunday, labeled by that Sunday's ISO date.
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - d.getDay());
  return toISO(sunday);
}

function aggregateBy(stats, keyFn) {
  const map = new Map();
  for (const s of stats) {
    const key = keyFn(s.fill_date);
    if (!key) continue;
    if (!map.has(key)) map.set(key, { key, miles: 0, gallons: 0, cost: 0, reliableGallons: 0, reliableCost: 0 });
    const g = map.get(key);
    // `cost`/`gallons` are the raw totals (what actually got spent/pumped —
    // used for the fuel-cost and gallons charts). `reliable*` excludes fills
    // whose gallons reading is too small to trust for a $/gal or MPG ratio
    // (see MIN_RELIABLE_GALLONS on fuelStats) so one bad reading can't blow
    // out an entire month's average.
    if (s.miles > 0) g.miles += s.miles;
    g.gallons += s.gallons || 0;
    g.cost += s.total_cost || 0;
    if ((s.gallons || 0) >= MIN_RELIABLE_GALLONS) {
      g.reliableGallons += s.gallons;
      g.reliableCost += s.total_cost || 0;
    }
  }
  return [...map.values()]
    .map((g) => ({
      ...g,
      mpg: g.reliableGallons > 0 ? g.miles / g.reliableGallons : null,
      pricePerGallon: g.reliableGallons > 0 ? g.reliableCost / g.reliableGallons : null,
      pricePerMile: g.miles > 0 ? g.cost / g.miles : null,
    }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

function aggregateMaintenanceByYear(visits) {
  const map = new Map();
  for (const v of visits || []) {
    const key = yearKey(v.service_date);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + (v.total_cost || 0));
  }
  return [...map.entries()].map(([key, cost]) => ({ key, cost })).sort((a, b) => (a.key < b.key ? -1 : 1));
}

export function rollups(fuelLogs, visits = []) {
  const stats = fuelStats(fuelLogs);
  const byMonth = aggregateBy(stats, monthKey);
  const byYear = aggregateBy(stats, yearKey);
  const byWeek = aggregateBy(stats, weekKey);
  const maintenanceByYear = aggregateMaintenanceByYear(visits);

  const totalMiles = stats.reduce((s, l) => s + (l.miles > 0 ? l.miles : 0), 0);
  const totalGallons = stats.reduce((s, l) => s + (l.gallons || 0), 0);
  const fuelCostTotal = stats.reduce((s, l) => s + (l.total_cost || 0), 0);
  const maintCostTotal = (visits || []).reduce((s, v) => s + (v.total_cost || 0), 0);

  const lifetimeMPG = totalGallons > 0 ? totalMiles / totalGallons : null;
  const lifetimePricePerGallon = totalGallons > 0 ? fuelCostTotal / totalGallons : null;
  const fuelCostPerMile = totalMiles > 0 ? fuelCostTotal / totalMiles : null;
  const maintCostPerMile = totalMiles > 0 ? maintCostTotal / totalMiles : null;
  const totalCostPerMile = totalMiles > 0 ? (fuelCostTotal + maintCostTotal) / totalMiles : null;

  return {
    byMonth, byYear, byWeek, maintenanceByYear,
    totalMiles, totalGallons, fuelCostTotal, maintCostTotal,
    lifetimeMPG, lifetimePricePerGallon, fuelCostPerMile, maintCostPerMile, totalCostPerMile,
  };
}
