// Pure helpers for the Runway tab — normalize every obligation source into one
// shape, window them by due date, and split the "Debt/Loan" bucket out from
// everything else. Kept out of the component so it's plain data in / data out.

import { daysUntil, todayISO, monthlyOf } from './format';

// Type buckets. Debt/Loan is totaled on its own; everything else (Bill,
// subscriptions, One-Time, ad-hoc) rolls into the "bills" total.
export const isDebtType = (t) => t === 'Debt/Loan';

// A stable key for an item across the derived list and the deck state table.
export const itemKey = (kind, id) => `${kind}:${id}`;

// Fold the four source tables into one normalized item list. Each item carries
// enough to render a row, move it On Deck, and advance its due date.
export function normalizeSources({ bills = [], debts = [], digital = [], manual = [] }) {
  const out = [];
  for (const b of bills) {
    out.push({
      source_kind: 'bill', source_id: b.id, name: b.name,
      // Monthly equivalent (matches the "Mon." column on the Bills tab), not
      // the raw per-frequency amount — a quarterly bill shouldn't show its
      // full quarterly charge as if it were due every occurrence here.
      amount: monthlyOf(b.amount, b.frequency), type: 'Bill',
      dueISO: b.next_due_date, frequency: b.frequency,
    });
  }
  for (const d of debts) {
    out.push({
      source_kind: 'debt', source_id: d.id, name: d.purchase,
      amount: d.normal_payment ?? 0, type: 'Debt/Loan',
      dueISO: d.next_due_date, frequency: 'Monthly',
      // Carry the lender so the Runway/On-Deck lists can show "who" at a glance
      // (easy to forget which of several debts belongs to which lender).
      lender: d.lender || null,
      // Carry the debt's own pending flag so the On Deck list can mirror it (the
      // debt row is the source of truth for debt pending — see deckItems).
      pending_withdrawal: !!d.pending_withdrawal,
    });
  }
  for (const s of digital) {
    if (s.active === false) continue;   // inactive subs don't create obligations
    out.push({
      source_kind: 'digital', source_id: s.id, name: s.name,
      amount: s.amount ?? 0, type: 'Digital Sub.',
      dueISO: s.next_due_date, frequency: s.frequency,
    });
  }
  for (const m of manual) {
    out.push({
      source_kind: 'manual', source_id: m.id, name: m.name,
      amount: m.amount ?? 0, type: m.bill_type || 'One-Time',
      // No separate frequency field on manual items — fall back to the type so
      // "One-Time" never offers an advance and the rest roll forward monthly.
      dueISO: m.next_due_date, frequency: m.frequency || m.bill_type || 'One-Time',
    });
  }
  return out.map((it) => ({ ...it, key: itemKey(it.source_kind, it.source_id), days: daysUntil(it.dueISO) }));
}

// Items with a due date landing on/before `windowDays` from today (overdue
// included — they're the most pressing). Sorted soonest-first.
export function withinWindow(items, windowDays) {
  return items
    .filter((it) => it.dueISO && it.days != null && it.days <= windowDays)
    .sort((a, b) => a.days - b.days);
}

// Upcoming = in-window items that are NOT currently on deck.
export function upcomingItems(items, windowDays, deckSet) {
  return withinWindow(items, windowDays).filter((it) => !deckSet.has(it.key));
}

// Resolve deck rows to their live source item (dropping any whose source is
// gone). Each result keeps the deck row id + pending flag for editing.
export function deckItems(deckRows, items) {
  const byKey = new Map(items.map((it) => [it.key, it]));
  const out = [];
  for (const row of deckRows) {
    const it = byKey.get(itemKey(row.source_kind, row.source_id));
    // Debts take their pending flag from the debt row (the shared source of
    // truth, so the Debts tab and On Deck stay mirrored); everything else uses
    // the per-occurrence flag stored on the deck row.
    if (it) {
      const pending = it.source_kind === 'debt' ? !!it.pending_withdrawal : !!row.pending_withdrawal;
      out.push({ ...it, deckId: row.id, pending_withdrawal: pending });
    }
  }
  return out.sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
}

// Bill / Debt totals for a set of items (used for the "next N days" headline).
export function bucketTotals(items) {
  let debt = 0, bills = 0;
  for (const it of items) {
    if (isDebtType(it.type)) debt += it.amount ?? 0;
    else bills += it.amount ?? 0;
  }
  return { debt, bills, total: debt + bills };
}

// Next occurrence of a due date given a frequency. Monthly is the default
// (debts, and anything without a frequency). One-Time returns null — it doesn't
// recur, so the caller should clear/remove it instead.
export function advanceDate(iso, frequency) {
  if (!iso) return null;
  const f = String(frequency || 'monthly').toLowerCase();
  if (f.includes('one') || f.includes('once')) return null;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y) return null;
  const dt = new Date(y, m - 1, d);
  if (f.includes('bi') && f.includes('week')) dt.setDate(dt.getDate() + 14);
  else if (f.includes('week')) dt.setDate(dt.getDate() + 7);
  else if (f.includes('quarter')) dt.setMonth(dt.getMonth() + 3);
  else if (f.includes('semi')) dt.setMonth(dt.getMonth() + 6);
  else if (f.includes('annual') || f.includes('year')) dt.setFullYear(dt.getFullYear() + 1);
  else if (f.includes('dai')) dt.setDate(dt.getDate() + 1);
  else dt.setMonth(dt.getMonth() + 1);   // monthly default
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

// The source table name for a given item kind (for advancing / deleting).
export const TABLE_FOR = {
  bill: 'fin_bills', debt: 'fin_debts',
  digital: 'fin_digital_subscriptions', manual: 'fin_runway_manual',
};

// Which column holds the due date on each source table (all the same today,
// but named here so the intent is explicit).
export const DUE_COL_FOR = {
  bill: 'next_due_date', debt: 'next_due_date',
  digital: 'next_due_date', manual: 'next_due_date',
};

export { todayISO };
