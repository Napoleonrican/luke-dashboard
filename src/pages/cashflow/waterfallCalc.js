// Pure allocation engine for the Cash Waterfall. Pours this week's incoming
// money (paycheck + side-gig) through an ordered set of steps grouped into
// tiers — mirroring the workbook's Waterfall sheet — and rolls the result up
// by destination account ("move this much into each account this week").
//
// Tiers, in pour order:
//   gate      — must-fund, in order; each takes min(remaining, need).
//   surplus   — % slices of whatever survived the gates (the "surplus pool").
//   absorber  — target-based, in order; take min(remaining, need) until dry.
//   remainder — a single catch-all that sweeps whatever's left.

export const DEFAULT_STEPS = [
  { id: '0a', label: 'Uber Pro Card — Backup Balance Repayment',      account: 'Uber Pro Card',               tier: 'gate',      need: 43 },
  { id: '0b', label: 'Bill Pay — Earnin Repayment Coverage',          account: 'Bill Pay Checking',           tier: 'gate',      need: 986 },
  { id: '1',  label: 'Weekly Essentials (Fuel + Groceries)',          account: 'Bill Pay Checking',           tier: 'gate',      auto: 'essentials' },
  { id: '2',  label: 'Bill Pay — Immediate Bills (7-Day Runway)',     account: 'Bill Pay Checking',           tier: 'gate',      auto: 'bills7' },
  { id: '3',  label: 'Debt Pay — Debt / Loan Radar (7-Day)',          account: 'Debt Pay Checking',           tier: 'gate',      auto: 'debts7' },
  { id: '4',  label: 'Bill Pay — Floor Build (Core Stability)',       account: 'Bill Pay Checking',           tier: 'gate',      need: 750 },
  { id: '5a', label: 'Debt Cleanup — Next tiny BNPL payoff',          account: 'Debt Pay Checking',           tier: 'surplus',   pct: 15 },
  { id: '5b', label: 'House Savings',                                 account: 'Primary Savings',             tier: 'surplus',   pct: 25 },
  { id: '5c', label: 'Debt Cleanup — Avalanche',                      account: 'Debt Pay Checking',           tier: 'surplus',   pct: 20 },
  { id: '6',  label: 'Operating Buffer (Side-Gig + Uber Pro)',        account: 'Operating Checking',          tier: 'absorber',  need: 204 },
  { id: '7',  label: 'Credit Union Relationship Fund',               account: 'Credit Union Checking',       tier: 'absorber',  need: 25 },
  { id: '8a', label: 'CX-5 — Primary Vehicle Catch-Up & Maintenance', account: 'Vehicle Maintenance Savings', tier: 'absorber',  need: 1612 },
  { id: '8b', label: 'Ongoing Vehicle Maintenance (CX-5)',            account: 'Vehicle Maintenance Savings', tier: 'absorber',  need: 109 },
  { id: '8c', label: 'Versa Revival',                                account: 'Vehicle Maintenance Savings', tier: 'absorber',  need: 0 },
  { id: '9',  label: 'Emergency Fund (Stage 1)',                     account: 'Primary Savings',             tier: 'absorber',  need: 3000 },
  { id: 'nw', label: 'Needs & Wants — Item Purchase / Extra to Avalanche', account: 'Operating Checking',     tier: 'remainder' },
];

export const TIER_META = {
  gate:      { label: 'Stability & Timing (Hard Gates)', note: 'Always fire first — protect timing and core runway.' },
  surplus:   { label: 'Surplus Slices',                  note: 'Fixed % of whatever survives the gates.' },
  absorber:  { label: 'Absorbers (Target-Based)',        note: 'Take what remains, in order, until each target is met.' },
  remainder: { label: 'Sweep',                            note: 'Whatever is still left over.' },
};
export const TIER_ORDER = ['gate', 'surplus', 'absorber', 'remainder'];

// The dollar target of a step for this run. Auto steps read live figures from
// ctx; everything else uses its (editable) need.
export function needOf(step, ctx) {
  if (step.auto === 'essentials') return (ctx.fuelWeekly || 0) + (ctx.grocWeekly || 0);
  if (step.auto === 'bills7') return ctx.bills7 || 0;
  if (step.auto === 'debts7') return ctx.debts7 || 0;
  return step.need || 0;
}

// Pour `pool` through the steps. Returns { rows, leftover } where each row
// carries its need, allocation, and the running balance left after it — so the
// UI can mirror the workbook's Need / Allocate / Next-Step columns exactly.
export function allocate(steps, pool, ctx) {
  let remaining = Math.max(0, pool || 0);
  const rows = [];

  // Surplus base = what's left once every hard gate is funded.
  let surplusBase = null;

  for (const s of steps) {
    if (s.tier === 'surplus' && surplusBase == null) {
      // First surplus step: freeze the base off the post-gate remainder.
      surplusBase = remaining;
    }
    let want;
    if (s.tier === 'surplus') want = surplusBase * ((s.pct || 0) / 100);
    else if (s.tier === 'remainder') want = remaining;
    else want = needOf(s, ctx);

    const allocated = Math.max(0, Math.min(remaining, want));
    remaining = +(remaining - allocated).toFixed(2);
    rows.push({ step: s, need: want, allocated, remainingAfter: remaining });
  }
  return { rows, leftover: remaining };
}

// Roll allocations up by destination account: [{ account, total, steps[] }],
// biggest first, keeping only the steps that actually received money.
export function byAccount(rows) {
  const map = new Map();
  for (const { step, allocated } of rows) {
    if (!map.has(step.account)) map.set(step.account, { account: step.account, total: 0, steps: [] });
    const g = map.get(step.account);
    g.total += allocated;
    if (allocated > 0.005) g.steps.push({ id: step.id, label: step.label, amount: allocated });
  }
  return [...map.values()].filter((g) => g.total > 0.005).sort((a, b) => b.total - a.total);
}

// Merge saved per-step overrides ({ id: { need?, pct? } }) onto the template.
export function applyOverrides(over = {}) {
  return DEFAULT_STEPS.map((s) => (over[s.id] ? { ...s, ...over[s.id] } : s));
}
