// Pure allocation engine for the Cash Waterfall. Pours this week's incoming
// money (paycheck + side-gig) through an ordered set of steps grouped into
// tiers — mirroring the workbook's Waterfall sheet exactly — and rolls the
// result up by destination account ("move this much into each account this
// week"). Every Need is a formula against live data (account balances, the
// Inputs config, 7-day bill/debt totals, on-deck amounts) — nothing here is a
// free-typed dollar override, matching how the original workbook works: you
// edit the *inputs* (Inputs sheet, account balances), never the Need column
// itself. The two exceptions the workbook itself hard-codes directly in the
// table are kept editable in place: the surplus-slice percentages (5a/5b/5c)
// and the flat Credit Union need (7).
//
// Tiers, in pour order:
//   gate      — must-fund, in order; each takes min(remaining, need).
//   surplus   — % slices of whatever survived the gates (the "surplus pool").
//   absorber  — target-based, in order; take min(remaining, need) until dry.
//   remainder — a single catch-all that sweeps whatever's left.

export const DEFAULT_STEPS = [
  { id: '0a', label: 'Uber Pro Card — Backup Balance Repayment',      account: 'Uber Pro Card',      tier: 'gate', auto: 'uberBackup' },
  { id: '0b', label: 'Bill Pay — Earnin Repayment + On-Deck Bills',    account: 'Bill Pay Checking',  tier: 'gate', auto: 'earninCoverage' },
  { id: '1',  label: 'Weekly Essentials (Fuel + Groceries)',          account: 'Operating Checking', tier: 'gate', auto: 'essentials' },
  { id: '2',  label: 'Bill Pay — Immediate Bills (7-Day Runway)',     account: 'Bill Pay Checking',  tier: 'gate', auto: 'bills7' },
  { id: '3',  label: 'Debt Pay — Debt / Loan Radar (7-Day)',          account: 'Debt Pay Checking',  tier: 'gate', auto: 'debtRadar7' },
  { id: '4',  label: 'Bill Pay — Floor Build (Core Stability)',       account: 'Bill Pay Checking',  tier: 'gate', auto: 'floorBuild' },
  { id: '5a', label: 'Debt Cleanup — Next tiny BNPL payoff',          account: 'Debt Pay Checking',  tier: 'surplus', pct: 15 },
  { id: '5b', label: 'House Savings',                                 account: 'Primary Savings',    tier: 'surplus', pct: 25, gate: 'emergencyFundFull' },
  { id: '5c', label: 'Debt Cleanup — Avalanche',                      account: 'Debt Pay Checking',  tier: 'surplus', pct: 20 },
  { id: '6',  label: 'Operating Buffer (Side-Gig + Uber Pro)',        account: 'Operating Checking', tier: 'absorber', auto: 'operatingBuffer' },
  { id: '7',  label: 'Credit Union Relationship Fund',                account: 'Credit Union Checking', tier: 'absorber', need: 25 },
  { id: '8a', label: 'CX-5 — Primary Vehicle Catch-Up & Maintenance', account: 'Vehicle Maintenance Savings', tier: 'absorber', auto: 'cx5' },
  { id: '8b', label: 'Ongoing Vehicle Maintenance (CX-5)',            account: 'Vehicle Maintenance Savings', tier: 'absorber', auto: 'vehicleOngoing' },
  { id: '8c', label: 'Versa Revival',                                account: 'Vehicle Maintenance Savings', tier: 'absorber', auto: 'versa' },
  { id: '9',  label: 'Emergency Fund (Stage 1)',                     account: 'Primary Savings',    tier: 'absorber', auto: 'emergencyFund' },
  { id: 'nw', label: 'Needs & Wants — Item Purchase / Extra to Avalanche', account: 'Operating Checking', tier: 'remainder' },
];

export const TIER_META = {
  gate:      { label: 'Stability & Timing (Hard Gates)', note: 'Always fire first — protect timing and core runway.' },
  surplus:   { label: 'Surplus Slices',                  note: 'Fixed % of whatever survives the gates.' },
  absorber:  { label: 'Absorbers (Target-Based)',        note: 'Take what remains, in order, until each target is met.' },
  remainder: { label: 'Sweep',                            note: 'Whatever is still left over.' },
};
export const TIER_ORDER = ['gate', 'surplus', 'absorber', 'remainder'];

// Config values behind the "live" needs, mirroring the workbook's Inputs
// sheet (fixed targets) plus two manually-tracked "currently owed" figures
// that live in the workbook's Current Balances block (Uber Pro Backup Owed)
// or as a plain helper cell (Earnin_Debit) rather than the Need column itself.
// These are the only numbers a person edits — never the table.
export const DEFAULT_INPUTS = {
  uberBackupOwed:       96,     // Inputs!B22 — how much is currently owed back to Uber Pro
  earninOwed:           0,      // Earnin_Debit — total currently owed back to Earnin
  debtBuffer:           0,      // "Debt Payment Acct Buffer" helper cell (J10), usually 0
  totalFixedBills:      1573,   // Inputs!B2 — monthly fixed bills total
  operatingBufferStage1: 250,   // Inputs!B16
  vehicleMaintTarget:   109,    // Inputs!B24
  outstandingCX5:       1613,   // Inputs!B25
  outstandingVersa:     2678,   // Inputs!B26
  emergencyFundGoal:    3000,   // Inputs!B27
  fuelWeeklyBase:       70,     // Inputs!B19 — full-week fuel need before the day-of-week taper
  grocWeeklyBase:       200,    // Inputs!B20 — full-week groceries need before the taper
};

const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const mround = (n, m) => (m ? Math.round(n / m) * m : n);

// Excel WEEKDAY(TODAY(), 2): Monday=1 … Sunday=7.
function isoWeekday(d = new Date()) {
  const wd = d.getDay();
  return wd === 0 ? 7 : wd;
}

// D18: full need on Monday, tapering to ~0 by Sunday (rounded to the nearest 5).
export function fuelWeeklyDynamic(base, d = new Date()) {
  const wd = isoWeekday(d);
  const raw = wd === 1 ? base : base * (1 - wd / 7);
  return mround(Math.max(0, raw), 5);
}

// D19: half the weekly need, front-loaded on Saturday and spread thin the rest.
export function grocWeeklyDynamic(base, d = new Date()) {
  const wd = isoWeekday(d);
  return wd === 6 ? base * 0.5 : (base * 0.5) / 6;
}

// The dollar Need of a step for this run. `ctx` carries everything a formula
// might reference: `bal(name)` for a live account balance, `inputs` for the
// config above, the 7-day bill/debt totals (already excluding on-deck items,
// same as the workbook's Combined_Bills_Due "On Table Above? = FALSE" filter),
// on-deck sums by type, and the digital+consumable subscription floor.
// `allocatedById` lets Step 4 reference Step 2's actual allocation, the one
// place the workbook chains one step's result into another's Need formula.
export function needOf(step, ctx, allocatedById = {}) {
  const { bal, inputs } = ctx;
  switch (step.auto) {
    case 'uberBackup':
      return Math.max(0, inputs.uberBackupOwed - bal('Uber Pro Card'));
    case 'earninCoverage':
      return Math.max(0, (inputs.earninOwed + ctx.onDeckBillSum) - bal('Bill Pay Checking'));
    case 'essentials':
      return Math.max(0, (ctx.fuelWeekly + ctx.grocWeekly) - (bal('Operating Checking') + bal('Uber Pro Card')));
    case 'bills7': {
      const billPay = bal('Bill Pay Checking');
      return billPay < inputs.earninOwed
        ? ctx.bills7 + ctx.subsFloor
        : Math.max(0, inputs.earninOwed + ctx.bills7 + ctx.subsFloor - billPay);
    }
    case 'debtRadar7':
      return Math.max(0, (ctx.debts7 + ctx.onDeckDebtSum + inputs.debtBuffer) - bal('Debt/Loan Checking'));
    case 'floorBuild': {
      const step2Alloc = allocatedById['2'] || 0;
      return mround(Math.max(0, inputs.totalFixedBills - (bal('Bill Pay Checking') + step2Alloc)), 10);
    }
    case 'operatingBuffer': {
      const uberSurplus = Math.min(Math.max(0, bal('Uber Pro Card') - inputs.uberBackupOwed), inputs.operatingBufferStage1);
      return Math.max(0, inputs.operatingBufferStage1 - bal('Operating Checking') - uberSurplus);
    }
    case 'cx5':
      return Math.max(0, inputs.outstandingCX5 - bal('Vehicle Maintenance Savings'));
    case 'vehicleOngoing':
      return Math.max(0, inputs.vehicleMaintTarget);
    case 'versa': {
      const cx5Remaining = inputs.outstandingCX5 - bal('Vehicle Maintenance Savings');
      return cx5Remaining > 0 ? 0 : Math.max(0, inputs.outstandingVersa - bal('Vehicle Maintenance Savings'));
    }
    case 'emergencyFund':
      return Math.max(0, inputs.emergencyFundGoal - bal('Primary Savings'));
    default:
      return step.need || 0;
  }
}

const GATES = {
  emergencyFundFull: (ctx) => ctx.bal('Primary Savings') >= ctx.inputs.emergencyFundGoal,
};

// Pour `pool` through the steps. Returns { rows, leftover } where each row
// carries its need, allocation, and the running balance left after it — so the
// UI can mirror the workbook's Need / Allocate / Next-Step columns exactly.
export function allocate(steps, pool, ctx) {
  let remaining = Math.max(0, pool || 0);
  const rows = [];
  const allocatedById = {};

  // Surplus base = what's left once every hard gate is funded.
  let surplusBase = null;

  for (const s of steps) {
    if (s.tier === 'surplus' && surplusBase == null) {
      surplusBase = remaining;
    }
    let want;
    if (s.tier === 'surplus') {
      const gated = s.gate && GATES[s.gate] ? !GATES[s.gate](ctx) : false;
      want = gated ? 0 : surplusBase * ((s.pct || 0) / 100);
    } else if (s.tier === 'remainder') {
      want = remaining;
    } else {
      want = needOf(s, ctx, allocatedById);
    }

    const allocated = round(Math.max(0, Math.min(remaining, want)));
    remaining = round(remaining - allocated);
    allocatedById[s.id] = allocated;
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

// Merge saved overrides ({ '5a': { pct: 10 }, '7': { need: 30 } }) onto the
// template — only the surplus percentages and the flat Step 7 need are
// meant to be overridden; everything else is computed.
export function applyOverrides(over = {}) {
  return DEFAULT_STEPS.map((s) => (over[s.id] ? { ...s, ...over[s.id] } : s));
}
