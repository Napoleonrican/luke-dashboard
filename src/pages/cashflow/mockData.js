// ─── Cashflow Plan — seed data from the workbooks ────────────────────────────
// Mirrors the structure of "0 - Cashflow Plan (AI_Assisted).xlsx" (Waterfall,
// Short Term Needs & Planning, Inputs) and the Financial Workbook (All Bills &
// Debts). Figures are seeded from the uploaded workbooks so the demo reflects
// the real model; they'll be wired to live state / Supabase in the real build.

export const fmt = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(n ?? 0);

export const fmtDec = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n ?? 0);

// ── Top of the Waterfall: what's coming in + what's on hand ──────────────────
export const INFLOW = {
  paycheck:        2081,
  doordash:        0,      // editable — what you've earned / project this week
  earninDebit:     779.95, // owed back to Earnin
  billsNext7:      663.85,
  debtMinsNext7:   122.24,
};

export const BALANCES = [
  { name: 'Bill Pay Checking',        balance: 365.61, key: 'billpay' },
  { name: 'Operating Checking',       balance:  69.36, key: 'operating' },
  { name: 'Debt / Loan Checking',     balance: 197.12, key: 'debtloan' },
  { name: 'Uber Pro Card',            balance:  28.11, key: 'uberpro' },
  { name: 'Vehicle Maint. Savings',   balance:   1.20, key: 'vehmaint' },
  { name: 'Primary Savings (E-Fund)', balance:   0.72, key: 'efund' },
];

// ── The Cash Waterfall steps, grouped exactly like the sheet ─────────────────
// `need` = amount required to satisfy the step; `allocate` is what the engine
// would route there given current available funds (demo: starts at 0).
export const WATERFALL = [
  {
    group: 'Stability & Timing (Hard Gates)',
    note: 'These always fire first — they protect timing and core runway.',
    steps: [
      { id: '0a', label: 'Uber Pro Card — Backup Repayment',         need: 96,   allocate: 0 },
      { id: '0b', label: 'Bill Pay — Earnin Repayment Coverage',     need: 0,    allocate: 0 },
      { id: '1',  label: 'Weekly Essentials (Fuel + Groceries)',     need: 17,   allocate: 0 },
      { id: '2',  label: 'Bill Pay — Immediate Bills (7-day runway)', need: 355,  allocate: 0 },
      { id: '3',  label: 'Debt Pay — Debt / Loan Radar (7-day)',     need: 171,  allocate: 0 },
      { id: '4',  label: 'Bill Pay — Floor Build (Core Stability)',  need: 1210, allocate: 0 },
    ],
  },
  {
    group: 'Surplus Slices',
    note: 'Fire when funds remain after the floor build. Fixed % of surplus.',
    steps: [
      { id: '5a', label: 'Debt Cleanup — next tiny BNPL payoff (15%)', need: 0, allocate: 0, pct: 15 },
      { id: '5b', label: 'House Savings (25%)',                        need: 0, allocate: 0, pct: 25 },
      { id: '5c', label: 'Debt Cleanup — Avalanche (20%)',            need: 0, allocate: 0, pct: 20 },
    ],
  },
  {
    group: 'Absorbers (Target-Based, Self-Limiting)',
    note: 'Take whatever remains, then shut off when their target is full.',
    steps: [
      { id: '6',  label: 'Operating Buffer (Side-Gig + Uber Pro)', need: 153,  allocate: 0 },
      { id: '7',  label: 'Credit Union Relationship Fund',         need: 25,   allocate: 0 },
      { id: '8a', label: 'CX-5 — Catch-Up & Maintenance',          need: 1612, allocate: 0 },
      { id: '8b', label: 'Ongoing Vehicle Maintenance (CX-5)',     need: 109,  allocate: 0 },
      { id: '8c', label: 'Versa Revival',                          need: 0,    allocate: 0 },
    ],
  },
];

// ── Short Term Needs & Planning — daily runway ───────────────────────────────
export const RUNWAY_DAYS = [
  { day: 'Thu', date: 'Jun 18', needed: 250,   start: 660.00, earnings: 98, end: 508.00 },
  { day: 'Fri', date: 'Jun 19', needed: 44.99, start: 508.00, earnings: 0,  end: 463.01 },
  { day: 'Sat', date: 'Jun 20', needed: 242.53, start: 463.01, earnings: 98, end: 318.48 },
  { day: 'Sun', date: 'Jun 21', needed: 22.97, start: 318.48, earnings: 98, end: 393.51 },
  { day: 'Mon', date: 'Jun 22', needed: 0,     start: 393.51, earnings: 0,  end: 393.51 },
  { day: 'Tue', date: 'Jun 23', needed: 50.06, start: 393.51, earnings: 0,  end: 343.45 },
  { day: 'Wed', date: 'Jun 24', needed: 0,     start: 343.45, earnings: 0,  end: 343.45 },
];

export const UPCOMING_DEBITS = [
  { name: 'Livble — Rent Payment Service', date: 'Jun 18', amount: 250,   type: 'One-Time' },
  { name: 'Cable / Internet',              date: 'Jun 19', amount: 44.99, type: 'Bill' },
  { name: 'Everlance — Mileage Tracker',   date: 'Jun 20', amount: 69.99, type: 'Digital Sub.' },
  { name: 'Bill Pay Credit Card x0451',    date: 'Jun 20', amount: 151,   type: 'Debt/Loan' },
  { name: 'Samsung Line of Credit',        date: 'Jun 20', amount: 21.54, type: 'Debt/Loan' },
  { name: 'Amazon',                        date: 'Jun 21', amount: 22.97, type: 'Debt/Loan' },
  { name: 'Senator Inn & Spa',             date: 'Jun 23', amount: 20.82, type: 'Debt/Loan' },
  { name: "Men's Wearhouse",               date: 'Jun 23', amount: 29.24, type: 'Debt/Loan' },
];

const TYPE_COLOR = {
  Bill: '#3b82f6', 'Debt/Loan': '#a855f7', 'Digital Sub.': '#ec4899',
  'One-Time': '#f59e0b', 'Consumable Sub.': '#10b981',
};
export const typeColor = (t) => TYPE_COLOR[t] || '#94a3b8';

// ── All Bills & Debts (Financial Workbook) ───────────────────────────────────
export const MONTHLY_BILLS = [
  { name: 'Rent',                       monthly: 1000,   category: 'Bill' },
  { name: 'Electricity',                monthly: 133.40, category: 'Bill' },
  { name: 'Vehicle Insurance',          monthly: 131.66, category: 'Bill' },
  { name: 'Cell Phone Plan',            monthly: 106.33, category: 'Bill' },
  { name: 'Cable / Internet',           monthly: 44.99,  category: 'Bill' },
  { name: 'Storage Rent',               monthly: 40,     category: 'Bill' },
  { name: 'Planet Fitness',             monthly: 25.06,  category: 'Bill' },
  { name: "Renter's Insurance",         monthly: 12,     category: 'Bill' },
  { name: 'Personal Food & Groceries',  monthly: 916.37, category: 'Operating' },
  { name: 'Social Food Spend',          monthly: 221.06, category: 'Operating' },
  { name: 'Consumable Subscriptions',   monthly: 113.01, category: 'Subscription' },
  { name: 'Digital Subscriptions',      monthly: 103.75, category: 'Subscription' },
];

export const DEBT_ROWS = [
  { name: 'Affirm (BNPL)',     monthly: 532.52, balance: 4283.29 },
  { name: 'OneMain Financial', monthly: 517.46, balance: 6244.26 },
  { name: 'Best Egg',          monthly: 343.13, balance: 7385.22 },
  { name: 'Capital One',       monthly: 247,    balance: 6943.64 },
  { name: 'Upstart',           monthly: 42.50,  balance: 1258.22 },
  { name: 'Government (SL)',   monthly: 39.17,  balance: 2958.79 },
  { name: 'PayPal',            monthly: 38.18,  balance: 114.54 },
  { name: 'TD Retail',         monthly: 21.54,  balance: 23.05 },
];

const CAT_COLOR = { Bill: '#3b82f6', Operating: '#10b981', Subscription: '#ec4899' };
export const catColor = (c) => CAT_COLOR[c] || '#94a3b8';

// ── Inputs / targets ─────────────────────────────────────────────────────────
export const INPUTS = [
  { label: 'Total Fixed Bills',     value: 1573, unit: '/mo' },
  { label: 'Min Debt Payment',      value: 1794, unit: '/mo' },
  { label: 'Side-Gig (avg)',        value: 1176, unit: '/mo' },
  { label: 'Bill Pay Floor',        value: 1200, unit: 'target' },
  { label: 'Debt/Loan Buffer',      value: 448.50, unit: 'target' },
  { label: 'Operating Buffer S1/S2', value: 250, unit: '→ 500' },
  { label: 'Emergency Fund Goal',   value: 3000, unit: 'target' },
  { label: 'IRS Monthly',           value: 147, unit: '/mo' },
];
