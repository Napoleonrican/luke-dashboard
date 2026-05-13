import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';

// ─── Auth ─────────────────────────────────────────────────────────────────────
const PASSWORD    = 'Napoleon21!';
const AUTH_KEY    = 'dashboard_auth';
const isAuthed    = () => localStorage.getItem(AUTH_KEY) === 'true';

// ─── Constants ────────────────────────────────────────────────────────────────
const GIG_EFFICIENCY   = 0.83;
const WEEKS_PER_MONTH  = 4.33;
const HOURLY_RATE      = 25.27;
const HRB_ALL_WEEKS_AVG  = 161;
const HRB_WORK_WEEKS_AVG = 203;

// ─── Real debt data (from debt_payoff_model.html, Apr '26 snapshot) ───────────
const BASE_DEBTS = [
  { id: 'upstart',        name: 'Upstart',          balance: 1351.15, apr: 0.2857, min:  42.50, tag: 'Loan' },
  { id: 'capOnePersonal', name: 'Cap One Personal',  balance: 2647.99, apr: 0.3049, min:  99.00, tag: 'CC'   },
  { id: 'bestEgg',        name: 'Best Egg',          balance: 7977.00, apr: 0.2949, min: 343.13, tag: 'Loan' },
  { id: 'capOneBP',       name: 'Cap One BP',        balance: 4436.49, apr: 0.2899, min: 154.00, tag: 'CC'   },
  { id: 'oneMain',        name: 'OneMain',           balance: 7187.49, apr: 0.1699, min: 517.46, tag: 'Loan' },
  { id: 'studentLoan',    name: 'Student Loan',      balance: 2998.17, apr: 0.0680, min:  39.17, tag: 'Loan' },
];

// APR '26 snapshot = starting balances above
const APR26_SNAPSHOT = Object.fromEntries(BASE_DEBTS.map((d) => [d.id, d.balance]));

// ─── BNPL schedule (monthly minimums + payoff month from May '26 = month 0) ──
const BNPL_SCHEDULE = [
  { name: 'Klarna',                min:  29.01, payoffMonth:  1 },
  { name: 'TD Retail',             min:  31.38, payoffMonth:  1 },
  { name: 'BMV (Affirm)',          min:  31.40, payoffMonth:  2 },
  { name: 'Senator Inn (Affirm)',  min:  39.03, payoffMonth:  2 },
  { name: "Lowe's (Affirm)",       min:  64.73, payoffMonth:  3 },
  { name: 'Amazon Aug (Affirm)',   min:  24.11, payoffMonth:  4 },
  { name: 'Amazon Sep (Affirm)',   min:  28.17, payoffMonth:  5 },
  { name: "Goodwin's (Affirm)",    min:  73.11, payoffMonth: 10 },
  { name: 'Amazon Mar (Affirm)',   min:  22.97, payoffMonth: 11 },
  { name: "Men's Wear (Affirm)",   min:  29.24, payoffMonth: 13 },
  { name: 'Norwich Spa (Affirm)',  min:  50.69, payoffMonth: 13 },
  { name: 'Xmas Amazon (Affirm)', min:  28.76, payoffMonth: 14 },
  { name: 'Aubuchon (Affirm)',     min:  60.44, payoffMonth: 14 },
];
const TOTAL_BNPL_MINS  = BNPL_SCHEDULE.reduce((s, b) => s + b.min, 0);
const TOTAL_MAJOR_MINS = BASE_DEBTS.reduce((s, d) => s + d.min, 0);
const TOTAL_DEBT_MINS  = TOTAL_MAJOR_MINS + TOTAL_BNPL_MINS;

const STRATEGIES = [
  { id: 'current',   label: 'Current Order', desc: 'Pay in listed order' },
  { id: 'avalanche', label: 'Avalanche',      desc: 'Highest APR first — lowest total interest' },
  { id: 'snowball',  label: 'Snowball',       desc: 'Lowest balance first — fastest wins' },
  { id: 'hybrid',    label: 'Hybrid ⭐',      desc: 'Recommended — clear Upstart, then avalanche' },
];

const DEBT_COLORS = {
  upstart:        '#a855f7',
  capOnePersonal: '#3b82f6',
  bestEgg:        '#10b981',
  capOneBP:       '#f59e0b',
  oneMain:        '#ef4444',
  studentLoan:    '#6366f1',
};

const TAG_COLORS = { CC: '#f59e0b', Loan: '#6366f1' };

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(n ?? 0);

// Month 0 = May 2026
function monthLabel(offset) {
  const d = new Date(2026, 4 + offset);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// ─── Simulation (mirrors HTML: BNPL freed cash + paid-off debt snowball) ─────
function simulate(debts, strategy, extraPerMonth) {
  const origMins = Object.fromEntries(debts.map((d) => [d.id, d.min]));

  let order;
  if (strategy === 'avalanche') {
    order = [...debts].sort((a, b) => b.apr - a.apr).map((d) => d.id);
  } else if (strategy === 'snowball') {
    order = [...debts].sort((a, b) => a.balance - b.balance).map((d) => d.id);
  } else if (strategy === 'hybrid') {
    // Smallest first, then avalanche (matches HTML optimized hybrid)
    order = [...debts]
      .sort((a, b) => {
        const aSmall = a.balance < 2000;
        const bSmall = b.balance < 2000;
        if (aSmall && !bSmall) return -1;
        if (!aSmall && bSmall) return 1;
        if (aSmall && bSmall) return a.balance - b.balance;
        return b.apr - a.apr;
      })
      .map((d) => d.id);
  } else {
    order = debts.map((d) => d.id);
  }

  let balances = debts.map((d) => ({ ...d, balance: Math.max(0, d.balance) }));
  const payoffMonths = {};
  const months = [];
  let cumulativeInterest = 0;

  for (let m = 0; m < 120; m++) {
    if (balances.every((d) => d.balance <= 0)) break;

    // Cash freed as BNPL items complete (cumulative)
    const bnplFreed = BNPL_SCHEDULE.filter((b) => b.payoffMonth <= m)
      .reduce((s, b) => s + b.min, 0);
    // Cash freed from paid-off major debts (their minimums recycle)
    const discFreed = balances
      .filter((d) => d.balance <= 0)
      .reduce((s, d) => s + (origMins[d.id] || 0), 0);

    let monthlyInterest = 0;

    // Apply interest + minimum payments
    balances.forEach((d) => {
      if (d.balance <= 0) return;
      const interest = d.balance * (d.apr / 12);
      monthlyInterest += interest;
      d.balance += interest;
      const pay = Math.min(d.min, d.balance);
      d.balance -= pay;
      if (d.balance < 0.01) {
        d.balance = 0;
        if (!(d.id in payoffMonths)) payoffMonths[d.id] = m;
      }
    });

    // Apply extra payment pool to priority debts
    let extra = Math.max(0, extraPerMonth) + bnplFreed + discFreed;
    for (const id of order) {
      if (extra < 0.01) break;
      const d = balances.find((b) => b.id === id);
      if (!d || d.balance <= 0) continue;
      const pay = Math.min(extra, d.balance);
      d.balance -= pay;
      extra -= pay;
      if (d.balance < 0.01) {
        d.balance = 0;
        if (!(d.id in payoffMonths)) payoffMonths[d.id] = m;
      }
    }

    cumulativeInterest += monthlyInterest;
    const snap = {
      month: m,
      label: monthLabel(m),
      totalBalance: 0,
      cumulativeInterest: Math.round(cumulativeInterest),
    };
    balances.forEach((d) => { snap[d.id] = Math.round(Math.max(0, d.balance)); });
    snap.totalBalance = Math.round(balances.reduce((s, d) => s + Math.max(0, d.balance), 0));
    months.push(snap);
  }

  return { months, payoffMonths, totalInterest: cumulativeInterest };
}

// ─── Privacy wrapper ──────────────────────────────────────────────────────────
function Redacted({ children, on }) {
  if (!on) return <>{children}</>;
  return <span className="blur-sm select-none pointer-events-none">{children}</span>;
}

// ─── Custom dark tooltip ──────────────────────────────────────────────────────
function DarkTooltip({ active, payload, label, privacyMode }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-zinc-300 font-medium mb-1.5">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <Redacted on={privacyMode}>
            <span className="text-white font-mono">{fmt(p.value)}</span>
          </Redacted>
        </div>
      ))}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function DebtCalculator() {
  // localStorage helper (dp_ prefix matches HTML version)
  const ls = (k) => { try { return localStorage.getItem('dp_' + k); } catch { return null; } };

  // Persistent state
  const [takeHome, setTakeHome] = useState(() => Number(ls('takeHome')) || 4162);
  const [billsVariable, setBillsVariable] = useState(() => Number(ls('billsVariable')) || 2862);
  const [weeklyGross, setWeeklyGross] = useState(() => Number(ls('weeklyGross')) || 120);
  const [strategy, setStrategy] = useState(() => ls('strategy') || 'hybrid');
  const [debtBalances, setDebtBalances] = useState(() => {
    try {
      const saved = ls('debtBalances');
      return saved
        ? JSON.parse(saved)
        : Object.fromEntries(BASE_DEBTS.map((d) => [d.id, d.balance]));
    } catch {
      return Object.fromEntries(BASE_DEBTS.map((d) => [d.id, d.balance]));
    }
  });
  const [balancesUpdated, setBalancesUpdated] = useState(
    () => ls('balancesUpdated') || "Apr '26",
  );

  // UI state (not persisted)
  const [showInputs, setShowInputs]     = useState(false);  // My Numbers panel
  const [balancesOpen, setBalancesOpen] = useState(false);  // Current Balances panel
  const [activeTab, setActiveTab]       = useState(0);
  // Privacy: always start blurred; unblur requires password (or already authed)
  const [privacyMode, setPrivacyMode]   = useState(true);
  const [showUnlock, setShowUnlock]     = useState(false);
  const [pwInput, setPwInput]           = useState('');
  const [pwError, setPwError]           = useState(false);

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('dp_takeHome',      takeHome);
      localStorage.setItem('dp_billsVariable', billsVariable);
      localStorage.setItem('dp_weeklyGross',   weeklyGross);
      localStorage.setItem('dp_strategy',      strategy);
      localStorage.setItem('dp_debtBalances',  JSON.stringify(debtBalances));
      if (balancesUpdated) localStorage.setItem('dp_balancesUpdated', balancesUpdated);
    } catch {}
  }, [takeHome, billsVariable, weeklyGross, strategy, debtBalances, balancesUpdated]);

  // Live debts with user-edited balances
  const debts = useMemo(
    () => BASE_DEBTS.map((d) => ({ ...d, balance: Math.max(0, debtBalances[d.id] ?? d.balance) })),
    [debtBalances],
  );

  // Monthly math
  const monthlyOutflow  = billsVariable + TOTAL_DEBT_MINS;
  const monthlyDeficit  = Math.max(0, monthlyOutflow - takeHome);
  const breakEvenWeekly = Math.ceil(monthlyDeficit / (WEEKS_PER_MONTH * GIG_EFFICIENCY));
  const monthlyGigNet   = weeklyGross * GIG_EFFICIENCY * WEEKS_PER_MONTH;
  const extraPerMonth   = Math.max(0, monthlyGigNet - monthlyDeficit);
  const isDeficit       = weeklyGross < breakEvenWeekly;
  const surplusDefAmt   = Math.abs(Math.round(monthlyGigNet - monthlyDeficit));
  const hoursPerWeek    = (weeklyGross / HOURLY_RATE).toFixed(1);
  const totalIncome     = takeHome + monthlyGigNet;

  // Simulation
  const { months, payoffMonths, totalInterest } = useMemo(
    () => simulate(debts, strategy, extraPerMonth),
    [debts, strategy, extraPerMonth],
  );

  // Chart data (every 3rd month + last for readability)
  const chartData = useMemo(
    () => months.filter((_, i) => i % 3 === 0 || i === months.length - 1),
    [months],
  );

  // BNPL Freed Cash chart — cumulative $/mo freed over 15 months
  const bnplFreedData = useMemo(() => {
    const pts = [];
    for (let m = 0; m <= 15; m++) {
      const freed = BNPL_SCHEDULE.filter((b) => b.payoffMonth <= m).reduce((s, b) => s + b.min, 0);
      pts.push({ label: monthLabel(m), freed: Math.round(freed) });
    }
    return pts;
  }, []);

  // Payoff sequence sorted by month
  const sequenceData = useMemo(
    () =>
      BASE_DEBTS.filter((d) => d.id in payoffMonths)
        .map((d) => ({ ...d, payoffMonth: payoffMonths[d.id], color: DEBT_COLORS[d.id] }))
        .sort((a, b) => a.payoffMonth - b.payoffMonth),
    [payoffMonths],
  );

  const totalDebt     = debts.reduce((s, d) => s + d.balance, 0);
  const totalOriginal = BASE_DEBTS.reduce((s, d) => s + d.balance, 0);
  const totalPaidDown = Math.max(0, totalOriginal - totalDebt);
  const debtFreeMonth = months.length > 0 ? months.length - 1 : null;

  function updateBalance(id, raw) {
    const val = Math.max(0, parseFloat(raw) || 0);
    setDebtBalances((prev) => ({ ...prev, [id]: val }));
    setBalancesUpdated(
      new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    );
  }

  // Privacy / unlock handlers
  function handleEyeClick() {
    if (!privacyMode) {
      // Currently showing → re-blur
      setPrivacyMode(true);
    } else if (isAuthed()) {
      // Already authenticated this session → unblur without password
      setPrivacyMode(false);
    } else {
      // Need password → show modal
      setShowUnlock(true);
    }
  }

  function handleUnlock(e) {
    e?.preventDefault();
    if (pwInput === PASSWORD) {
      localStorage.setItem(AUTH_KEY, 'true');
      setPrivacyMode(false);
      setShowUnlock(false);
      setPwInput('');
      setPwError(false);
    } else {
      setPwError(true);
      setPwInput('');
    }
  }

  const tabs = ['Balance Over Time', 'Interest Paid', 'Payoff Sequence', 'BNPL Freed Cash'];

  const shortfallLabel = monthlyDeficit > 0
    ? `DoorDash must cover ${fmt(monthlyDeficit)}/mo`
    : `Surplus ${fmt(Math.abs(monthlyOutflow - takeHome))}/mo ✓`;

  const goalPresets = [
    { weekly: breakEvenWeekly,    label: 'Break-even', note: 'min to cover',  color: '#f59e0b' },
    { weekly: HRB_ALL_WEEKS_AVG,  label: 'HRB avg',    note: 'all weeks',    color: '#94a3b8' },
    { weekly: HRB_WORK_WEEKS_AVG, label: 'HRB avg',    note: 'work weeks',   color: '#6366f1' },
    { weekly: 270,                label: '3 days/wk',  note: 'Scenario 2',   color: '#10b981' },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* ── Page header ───────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors text-sm mb-3"
            >
              <ArrowLeft size={15} />Back to Hub
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">Debt Payoff Calculator</h1>
            <p className="text-zinc-400 mt-1 text-sm">
              6 major debts modeled. BNPL minimums roll in as they complete.
            </p>
          </div>
          {/* Privacy / Unlock toggle */}
          <button
            onClick={handleEyeClick}
            title={privacyMode ? 'Unlock to show numbers' : 'Hide numbers (demo mode)'}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors mt-1 ${
              privacyMode
                ? 'bg-amber-900/30 border-amber-600 text-amber-400 hover:bg-amber-900/50'
                : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'
            }`}
          >
            {privacyMode ? <Eye size={15} /> : <EyeOff size={15} />}
            {privacyMode ? 'Unlock' : 'Hide'}
          </button>
        </div>

        {/* ── My Numbers (collapsible) ───────────────────────────────────────── */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl mb-4">
          <button
            className="w-full flex items-center justify-between p-5 text-left"
            onClick={() => setShowInputs((o) => !o)}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-base flex-shrink-0">⚙️</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-semibold">My Numbers</h2>
                  <span className="text-xs bg-zinc-800 text-zinc-500 rounded-full px-2 py-0.5 border border-zinc-700">
                    {takeHome !== 4162 || billsVariable !== 2862 ? 'edited' : 'defaults'}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5 truncate">
                  <Redacted on={privacyMode}>{shortfallLabel}</Redacted>
                </p>
              </div>
            </div>
            {showInputs
              ? <ChevronUp size={18} className="text-zinc-400 flex-shrink-0 ml-2" />
              : <ChevronDown size={18} className="text-zinc-400 flex-shrink-0 ml-2" />}
          </button>

          {showInputs && (
            <div className="px-5 pb-5 border-t border-zinc-800">
              <p className="text-xs text-zinc-500 mt-3 mb-3">
                Update whenever your income or expenses change.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <label className="block">
                  <span className="text-xs text-zinc-400 mb-0.5 block">HRB Monthly Take-Home</span>
                  <span className="text-xs text-zinc-600 mb-1 block">Net paycheck × paychecks/mo</span>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">$</span>
                    <input
                      type="number"
                      value={takeHome}
                      onChange={(e) => setTakeHome(parseFloat(e.target.value) || 0)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-7 pr-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
                    />
                  </div>
                </label>
                <label className="block">
                  <span className="text-xs text-zinc-400 mb-0.5 block">Bills &amp; Variable Expenses</span>
                  <span className="text-xs text-zinc-600 mb-1 block">Everything except debt payments</span>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">$</span>
                    <input
                      type="number"
                      value={billsVariable}
                      onChange={(e) => setBillsVariable(parseFloat(e.target.value) || 0)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-7 pr-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
                    />
                  </div>
                </label>
              </div>
              {/* Breakdown table */}
              <div className="bg-zinc-800 rounded-xl p-3 text-xs space-y-1.5">
                <div className="flex justify-between text-zinc-400">
                  <span>Bills &amp; variable expenses</span>
                  <Redacted on={privacyMode}><span>{fmt(billsVariable)}/mo</span></Redacted>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Debt minimums (auto)</span>
                  <Redacted on={privacyMode}><span>{fmt(TOTAL_DEBT_MINS)}/mo</span></Redacted>
                </div>
                <div className="flex justify-between font-semibold text-zinc-200 border-t border-zinc-700 pt-1.5">
                  <span>Total outflow</span>
                  <Redacted on={privacyMode}><span>{fmt(monthlyOutflow)}/mo</span></Redacted>
                </div>
                <div className="flex justify-between font-semibold text-zinc-200">
                  <span>HRB take-home</span>
                  <Redacted on={privacyMode}>
                    <span className="text-emerald-400">–{fmt(takeHome)}/mo</span>
                  </Redacted>
                </div>
                <div className={`flex justify-between font-bold border-t border-zinc-700 pt-1.5 ${monthlyDeficit > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  <span>Monthly shortfall (DoorDash must cover)</span>
                  <Redacted on={privacyMode}>
                    <span>{monthlyDeficit > 0 ? fmt(monthlyDeficit) : 'Surplus!'}/mo</span>
                  </Redacted>
                </div>
                <div className="flex justify-between text-amber-400">
                  <span>Break-even weekly</span>
                  <Redacted on={privacyMode}><span>{fmt(breakEvenWeekly)}/wk</span></Redacted>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ── Weekly DoorDash Slider ─────────────────────────────────────────── */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h2 className="text-base font-semibold">Weekly DoorDash Earnings</h2>
              <p className="text-xs text-zinc-400 mt-0.5">Drag to model different dashing commitments</p>
            </div>
            <div className="text-right flex-shrink-0 ml-4">
              <Redacted on={privacyMode}>
                <div className="text-2xl font-bold">
                  ${weeklyGross}
                  <span className="text-sm font-normal text-zinc-400">/wk</span>
                </div>
                <div className="text-xs text-zinc-400">
                  ≈ {hoursPerWeek} hrs/wk · ${Math.round(weeklyGross * WEEKS_PER_MONTH)}/mo gross
                </div>
              </Redacted>
            </div>
          </div>

          <input
            type="range"
            min={0}
            max={450}
            step={5}
            value={weeklyGross}
            onChange={(e) => setWeeklyGross(Number(e.target.value))}
            className="w-full accent-purple-500 mb-2"
          />

          <div className="flex justify-between text-xs text-zinc-600 mb-3 px-0.5">
            <span>$0</span>
            <Redacted on={privacyMode}>
              <span className="text-amber-500">break-even ≈ {fmt(breakEvenWeekly)}/wk</span>
            </Redacted>
            <span>$450</span>
          </div>

          {/* Status box */}
          <div
            className={`rounded-lg p-3 mb-4 ${
              isDeficit
                ? 'bg-red-950/50 border border-red-800/60'
                : 'bg-emerald-950/50 border border-emerald-800/60'
            }`}
          >
            {isDeficit ? (
              <>
                <p className="text-sm font-bold text-red-400">
                  <Redacted on={privacyMode}>{fmt(surplusDefAmt)}/mo short of break-even</Redacted>
                </p>
                <p className="text-xs text-red-500 mt-0.5">
                  <Redacted on={privacyMode}>
                    Need at least {fmt(breakEvenWeekly)}/wk to cover all minimums
                  </Redacted>
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-emerald-400">
                  <Redacted on={privacyMode}>{fmt(extraPerMonth)}/mo available for extra debt paydown</Redacted>
                </p>
                <p className="text-xs text-emerald-500 mt-0.5">
                  <Redacted on={privacyMode}>
                    ${weeklyGross - breakEvenWeekly}/wk above break-even
                  </Redacted>
                </p>
              </>
            )}
          </div>

          {/* Goal preset buttons */}
          <div className="grid grid-cols-4 gap-2">
            {goalPresets.map((g) => {
              const active = weeklyGross === g.weekly;
              return (
                <button
                  key={g.label + g.weekly}
                  onClick={() => setWeeklyGross(Math.min(450, g.weekly))}
                  className="rounded-xl p-2 text-center border transition-all hover:opacity-90"
                  style={{
                    borderColor: g.color,
                    background: active ? g.color + '22' : 'transparent',
                    boxShadow: active ? `0 0 0 2px ${g.color}` : 'none',
                  }}
                >
                  <div className="font-bold text-xs" style={{ color: g.color }}>
                    <Redacted on={privacyMode}>${g.weekly}/wk</Redacted>
                  </div>
                  <div className="text-xs text-zinc-300 font-medium">{g.label}</div>
                  <div className="text-xs text-zinc-500">{g.note}</div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Summary cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'Income / Month', value: fmt(totalIncome),     color: 'text-white',       blur: true },
            { label: 'Extra / Month',  value: fmt(extraPerMonth),   color: extraPerMonth > 0 ? 'text-emerald-400' : 'text-red-400', blur: true },
            { label: 'Debt-Free',      value: debtFreeMonth !== null ? monthLabel(debtFreeMonth) : '> 10yr', color: 'text-purple-400', blur: false },
          ].map(({ label, value, color, blur }) => (
            <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
              <p className="text-xs text-zinc-400 mb-1">{label}</p>
              <p className={`text-xl font-bold ${color}`}>
                {blur ? <Redacted on={privacyMode}>{value}</Redacted> : value}
              </p>
            </div>
          ))}
        </div>

        {/* ── Payoff Strategy ────────────────────────────────────────────────── */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
          <h2 className="text-base font-semibold mb-3">Payoff Strategy</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {STRATEGIES.map((s) => (
              <button
                key={s.id}
                onClick={() => setStrategy(s.id)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  strategy === s.id
                    ? 'bg-purple-900/40 border-purple-500 text-white'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500'
                }`}
              >
                <div className="font-medium text-sm">{s.label}</div>
                <div className="text-xs text-zinc-400 mt-1 leading-snug">{s.desc}</div>
              </button>
            ))}
          </div>
        </section>

        {/* ── Payoff Timeline ────────────────────────────────────────────────── */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
          <div className="flex justify-between items-baseline mb-4">
            <h2 className="text-base font-semibold">Payoff Timeline</h2>
            <span className="text-xs text-zinc-400">
              Total interest:{' '}
              <Redacted on={privacyMode}>
                <span className="text-red-400 font-medium">{fmt(totalInterest)}</span>
              </Redacted>
            </span>
          </div>
          <div className="space-y-3">
            {BASE_DEBTS.map((d) => {
              const balance = debtBalances[d.id] ?? d.balance;
              const snap    = APR26_SNAPSHOT[d.id];
              const mo      = payoffMonths[d.id];
              const pct     = Math.min(100, Math.max(0, ((snap - balance) / snap) * 100));
              return (
                <div key={d.id} className="flex items-center gap-3">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: DEBT_COLORS[d.id] }}
                  />
                  <span className="text-sm text-zinc-300 w-36 flex-shrink-0">{d.name}</span>
                  <div className="flex-1 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-1.5 rounded-full transition-all"
                      style={{ backgroundColor: DEBT_COLORS[d.id], width: `${pct}%` }}
                    />
                  </div>
                  <Redacted on={privacyMode}>
                    <span className="text-xs text-zinc-400 w-16 text-right flex-shrink-0">
                      {mo !== undefined ? monthLabel(mo) : '> 10yr'}
                    </span>
                  </Redacted>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-zinc-800 flex flex-wrap justify-between gap-2 text-sm">
            <span className="text-zinc-400">
              Total debt:{' '}
              <Redacted on={privacyMode}>
                <span className="text-white font-medium">{fmt(totalDebt)}</span>
              </Redacted>
            </span>
            <span className="text-zinc-400">
              All minimums:{' '}
              <Redacted on={privacyMode}>
                <span className="text-white font-medium">{fmt(TOTAL_DEBT_MINS)}/mo</span>
              </Redacted>
            </span>
          </div>
        </section>

        {/* ── Current Balances (collapsible) ────────────────────────────────── */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl mb-4">
          <button
            className="w-full flex items-center justify-between p-5 text-left"
            onClick={() => setBalancesOpen((o) => !o)}
          >
            <div>
              <h2 className="text-base font-semibold">Current Balances</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Last updated: {balancesUpdated}
                {totalPaidDown > 0 && (
                  <span className="ml-2 text-emerald-400">
                    ·{' '}
                    <Redacted on={privacyMode}>{fmt(totalPaidDown)} paid down</Redacted>
                  </span>
                )}
              </p>
            </div>
            {balancesOpen
              ? <ChevronUp size={18} className="text-zinc-400" />
              : <ChevronDown size={18} className="text-zinc-400" />}
          </button>

          {balancesOpen && (
            <div className="px-5 pb-5">
              <p className="text-xs text-zinc-500 mb-4">
                Edit balances to update projections. Progress bars show % paid vs Apr &lsquo;26 snapshot.
              </p>
              <div className="space-y-5">
                {BASE_DEBTS.map((d) => {
                  const balance = debtBalances[d.id] ?? d.balance;
                  const snap    = APR26_SNAPSHOT[d.id];
                  const pct     = Math.min(100, Math.max(0, ((snap - balance) / snap) * 100));
                  const tagColor = TAG_COLORS[d.tag];
                  const isPaidOff = balance < 0.01;
                  return (
                    <div key={d.id}>
                      <div className="flex justify-between items-center mb-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="text-sm font-medium"
                            style={{ color: DEBT_COLORS[d.id] }}
                          >
                            {d.name}
                          </span>
                          <span
                            className="text-xs px-1.5 py-0.5 rounded font-medium"
                            style={{
                              color: tagColor,
                              background: tagColor + '20',
                              border: `1px solid ${tagColor}50`,
                            }}
                          >
                            {d.tag}
                          </span>
                          {isPaidOff && (
                            <span className="text-xs text-emerald-400 font-medium">✓ Paid off</span>
                          )}
                        </div>
                        <span className="text-xs text-zinc-500 flex-shrink-0">
                          {(d.apr * 100).toFixed(2)}% · {fmt(d.min)}/mo min
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">$</span>
                          <input
                            type="number"
                            value={balance}
                            onChange={(e) => updateBalance(d.id, e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-7 pr-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
                          />
                        </div>
                        <span className="text-xs text-zinc-400 w-14 text-right">{pct.toFixed(1)}% off</span>
                      </div>
                      <div className="mt-2 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-1.5 rounded-full transition-all"
                          style={{ backgroundColor: DEBT_COLORS[d.id], width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 pt-4 border-t border-zinc-800 flex justify-between text-sm">
                <span className="text-zinc-400">
                  Remaining:{' '}
                  <Redacted on={privacyMode}>
                    <span className="text-white font-medium">{fmt(totalDebt)}</span>
                  </Redacted>
                </span>
                <span className="text-zinc-500 text-xs">
                  Apr &lsquo;26 snapshot: {fmt(totalOriginal)}
                </span>
              </div>
            </div>
          )}
        </section>

        {/* ── Charts ────────────────────────────────────────────────────────── */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl mb-8">
          {/* Tab bar */}
          <div className="flex border-b border-zinc-800 overflow-x-auto">
            {tabs.map((tab, i) => (
              <button
                key={i}
                onClick={() => setActiveTab(i)}
                className={`flex-1 min-w-max px-3 py-3 text-xs font-medium whitespace-nowrap transition-colors ${
                  activeTab === i
                    ? 'text-purple-400 border-b-2 border-purple-500'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="p-4">
            {/* Tab 0 — Balance Over Time */}
            {activeTab === 0 && (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#71717a', fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickFormatter={(v) => privacyMode ? '●●●' : `$${(v / 1000).toFixed(0)}k`}
                    tick={{ fill: '#71717a', fontSize: 10 }}
                    width={44}
                  />
                  <Tooltip content={(props) => <DarkTooltip {...props} privacyMode={privacyMode} />} />
                  <Legend wrapperStyle={{ fontSize: '11px', color: '#a1a1aa' }} />
                  {BASE_DEBTS.map((d) => (
                    <Line
                      key={d.id}
                      type="monotone"
                      dataKey={d.id}
                      name={d.name}
                      stroke={DEBT_COLORS[d.id]}
                      dot={false}
                      strokeWidth={1.5}
                    />
                  ))}
                  <Line
                    type="monotone"
                    dataKey="totalBalance"
                    name="Total"
                    stroke="#ffffff"
                    dot={false}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}

            {/* Tab 1 — Interest Paid */}
            {activeTab === 1 && (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#71717a', fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickFormatter={(v) => privacyMode ? '●●●' : `$${(v / 1000).toFixed(0)}k`}
                    tick={{ fill: '#71717a', fontSize: 10 }}
                    width={44}
                  />
                  <Tooltip content={(props) => <DarkTooltip {...props} privacyMode={privacyMode} />} />
                  <Area
                    type="monotone"
                    dataKey="cumulativeInterest"
                    name="Cumulative Interest"
                    stroke="#ef4444"
                    fill="#ef444422"
                    strokeWidth={2}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}

            {/* Tab 2 — Payoff Sequence */}
            {activeTab === 2 && (
              <div className="space-y-3 py-2 min-h-[200px]">
                {sequenceData.length === 0 ? (
                  <p className="text-zinc-500 text-sm text-center py-12">
                    Add gig income above to see payoff sequence.
                  </p>
                ) : (
                  sequenceData.map((item, i) => {
                    const barPct = Math.min(85, (item.payoffMonth / Math.max(1, debtFreeMonth || 1)) * 85);
                    return (
                      <div key={item.id} className="flex items-center gap-3">
                        <span className="text-zinc-600 text-xs w-5 text-right">{i + 1}</span>
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-sm text-zinc-300 w-36 flex-shrink-0">{item.name}</span>
                        <div
                          className="h-5 rounded transition-all"
                          style={{
                            background: `${item.color}30`,
                            border: `1px solid ${item.color}80`,
                            width: `${Math.max(barPct, 5)}%`,
                            minWidth: '2rem',
                          }}
                        />
                        <Redacted on={privacyMode}>
                          <span className="text-xs font-medium ml-1" style={{ color: item.color }}>
                            {monthLabel(item.payoffMonth)}
                          </span>
                        </Redacted>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Tab 3 — BNPL Freed Cash */}
            {activeTab === 3 && (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={bnplFreedData}
                    margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                    <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 10 }} />
                    <YAxis
                      tickFormatter={(v) => privacyMode ? '●●●' : `$${v}`}
                      tick={{ fill: '#71717a', fontSize: 10 }}
                      width={44}
                    />
                    <Tooltip
                      formatter={(v) =>
                        privacyMode ? ['●●●', 'Freed/mo'] : [`$${v}/mo`, 'Freed from BNPLs']
                      }
                    />
                    <ReferenceLine
                      y={248}
                      stroke="#f59e0b"
                      strokeDasharray="4 4"
                      label={{
                        value: "$248 by Sep '26",
                        fontSize: 9,
                        fill: '#f59e0b',
                        position: 'insideTopRight',
                      }}
                    />
                    <Bar dataKey="freed" name="Freed/mo" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>

                {/* BNPL itemized list */}
                <div className="mt-3 space-y-1">
                  {BNPL_SCHEDULE.map((b) => (
                    <div key={b.name} className="flex justify-between text-xs">
                      <span className="text-zinc-400">{b.name}</span>
                      <div className="flex gap-4">
                        <Redacted on={privacyMode}>
                          <span className="text-zinc-300 font-mono">${b.min.toFixed(2)}/mo</span>
                        </Redacted>
                        <span className="text-zinc-500 w-24 text-right">
                          done {monthLabel(b.payoffMonth)}
                        </span>
                      </div>
                    </div>
                  ))}
                  <div className="border-t border-zinc-700 pt-1.5 flex justify-between font-semibold text-xs">
                    <span className="text-zinc-300">Total freed by {monthLabel(14)}</span>
                    <Redacted on={privacyMode}>
                      <span className="text-indigo-400">${TOTAL_BNPL_MINS.toFixed(0)}/mo</span>
                    </Redacted>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

      </div>

      {/* ── Unlock modal ────────────────────────────────────────────────────── */}
      {showUnlock && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowUnlock(false); setPwInput(''); setPwError(false); } }}
        >
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl p-6 shadow-2xl">
            <div className="flex flex-col items-center gap-2 mb-5">
              <div className="bg-zinc-800 rounded-xl p-3 text-amber-400">
                <Eye size={22} strokeWidth={1.75} />
              </div>
              <h3 className="text-base font-semibold text-white">Unlock Numbers</h3>
              <p className="text-xs text-zinc-400 text-center">
                Enter your dashboard password to view figures.
              </p>
            </div>
            <form onSubmit={handleUnlock} className="flex flex-col gap-3">
              <input
                type="password"
                autoFocus
                value={pwInput}
                onChange={(e) => { setPwInput(e.target.value); setPwError(false); }}
                placeholder="Password"
                className={`w-full bg-zinc-800 rounded-lg border px-4 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition-colors focus:border-purple-500 ${
                  pwError ? 'border-red-500/60' : 'border-zinc-700'
                }`}
              />
              {pwError && <p className="text-xs text-red-400">Incorrect password.</p>}
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => { setShowUnlock(false); setPwInput(''); setPwError(false); }}
                  className="flex-1 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-sm text-white font-medium transition-colors"
                >
                  Unlock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
