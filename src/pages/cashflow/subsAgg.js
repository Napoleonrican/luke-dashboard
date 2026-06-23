// Pure aggregation helpers for the Subscriptions page — kept out of the
// component file so everything here is plain data in / data out (and lint stays
// happy about component-only exports).

import { monthlyOf } from './format';

// Monthly equivalent of a digital sub (amount + frequency, like the workbook).
export const monthlyDigital = (s) => monthlyOf(s.amount, s.frequency);

// Monthly equivalent of a consumable sub (DB generates monthly_estimate; fall
// back to a local compute if it's missing on a freshly-added row).
export const monthlyConsumable = (s) =>
  s.monthly_estimate ?? ((s.cost_per_order ?? 0) * 30.44) / Math.max(1, s.order_frequency_days ?? 30);

// ── Consumable derived figures (mirror the workbook) ──────────────────────────
// We store frequency in days; the workbook shows/edits it in weeks.
export const weeksOf = (s) => (s.order_frequency_days ?? 0) / 7;
// Cost per unit = Amt. ÷ Count.
export const costPerType = (s) => (s.count ? (s.cost_per_order ?? 0) / s.count : null);
// Orders per year = 52 ÷ frequency-in-weeks.
export const ordersPerYear = (s) => {
  const w = weeksOf(s);
  return w ? 52 / w : null;
};
// Cost/Year = Amt. × Orders/Yr.
export const costPerYear = (s) => {
  const o = ordersPerYear(s);
  return o == null ? null : (s.cost_per_order ?? 0) * o;
};

const CAT = (c) => (c && String(c).trim()) || 'Uncategorized';

// Active-only monthly spend grouped by category, across both tables.
// Returns [{ category, total }] sorted high → low.
export function categoryBreakdown(digital, consumable) {
  const map = new Map();
  const add = (cat, amt) => map.set(CAT(cat), (map.get(CAT(cat)) ?? 0) + amt);
  digital.filter((s) => s.active).forEach((s) => add(s.category, monthlyDigital(s)));
  consumable.filter((s) => s.active).forEach((s) => add(s.category, monthlyConsumable(s)));
  return [...map.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

// Snapshot payload for "Snapshot this month" — totals, counts, by-category map,
// and the active item set (enough to diff two periods later).
export function buildSnapshot(digital, consumable) {
  const dActive = digital.filter((s) => s.active);
  const cActive = consumable.filter((s) => s.active);
  const digital_total = dActive.reduce((t, s) => t + monthlyDigital(s), 0);
  const consumable_total = cActive.reduce((t, s) => t + monthlyConsumable(s), 0);

  const by_category = {};
  for (const { category, total } of categoryBreakdown(digital, consumable)) by_category[category] = total;

  const items = [
    ...dActive.map((s) => ({ name: s.name, kind: 'digital', category: CAT(s.category), monthly: monthlyDigital(s) })),
    ...cActive.map((s) => ({ name: s.name, kind: 'consumable', category: CAT(s.category), monthly: monthlyConsumable(s) })),
  ];

  const now = new Date();
  const label = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  return {
    label,
    digital_total,
    consumable_total,
    digital_count: dActive.length,
    consumable_count: cActive.length,
    by_category,
    items,
  };
}

// Diff the current active set against a prior snapshot's items.
// Returns { added, removed, changed, totalDelta } for the summary's
// "change since last snapshot" view.
export function diffSnapshots(current, snapshot) {
  if (!snapshot) return null;
  const key = (i) => `${i.kind}:${i.name}`;
  const prev = new Map((snapshot.items ?? []).map((i) => [key(i), i]));
  const curr = new Map((current.items ?? []).map((i) => [key(i), i]));

  const added = [...curr.values()].filter((i) => !prev.has(key(i)));
  const removed = [...prev.values()].filter((i) => !curr.has(key(i)));
  const changed = [...curr.values()]
    .filter((i) => prev.has(key(i)) && Math.abs((prev.get(key(i)).monthly ?? 0) - (i.monthly ?? 0)) > 0.005)
    .map((i) => ({ ...i, from: prev.get(key(i)).monthly, to: i.monthly }));

  const currTotal = current.digital_total + current.consumable_total;
  const prevTotal = (snapshot.digital_total ?? 0) + (snapshot.consumable_total ?? 0);
  return { added, removed, changed, totalDelta: currTotal - prevTotal };
}
