import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// ─── Constants ────────────────────────────────────────────────────────────────
const GIG_EFFICIENCY = 0.83;
const WEEKS_PER_MONTH = 4.33;
const HRB_ALL_WEEKS_AVG = 161;
const HRB_WORK_WEEKS_AVG = 203;

// Apr '26 snapshot balances (used for progress bars and defaults)
const APR26_SNAPSHOT = {
  upstart:        8420,
  capOnePersonal: 3650,
  bestEgg:        5870,
  capOneBP:       1340,
  oneMain:        5120,
  studentLoan:   12400,
};

const BASE_DEBTS = [
  { id: 'upstart',        name: 'Upstart',         apr: 0.2099, min: 248 },
  { id: 'capOnePersonal', name: 'Cap One Personal', apr: 0.2199, min:  89 },
  { id: 'bestEgg',        name: 'Best Egg',         apr: 0.1899, min: 163 },
  { id: 'capOneBP',       name: 'Cap One BP',       apr: 0.2990, min:  35 },
  { id: 'oneMain',        name: 'OneMain',          apr: 0.2799, min: 175 },
  { id: 'studentLoan',    name: 'Student Loan',     apr: 0.0650, min: 135 },
];

const BNPL_SCHEDULE = [
  { name: 'Klarna',       amount: 148, due: '2026-06' },
  { name: 'TD Retail',    amount: 820, due: '2026-07' },
  { name: 'BMV/Affirm',   amount: 396, due: '2026-08' },
  { name: 'Senator Inn',  amount: 312, due: '2026-06' },
  { name: "Lowe's",       amount: 485, due: '2026-07' },
  { name: 'Amazon Aug',   amount: 198, due: '2026-08' },
  { name: 'Amazon Sep',   amount: 154, due: '2026-09' },
  { name: "Goodwin's",    amount: 340, due: '2026-07' },
  { name: 'Amazon Mar',   amount: 176, due: '2027-03' },
  { name: "Men's Wear",   amount: 285, due: '2026-08' },
  { name: 'Norwich Spa',  amount: 210, due: '2026-09' },
  { name: 'Xmas Amazon',  amount: 245, due: '2026-12' },
  { name: 'Aubuchon',     amount:  98, due: '2026-06' },
];

const STRATEGIES = [
  { id: 'current',   label: 'Current Order', desc: 'Pay in listed order' },
  { id: 'avalanche', label: 'Avalanche',      desc: 'Highest APR first — lowest total interest' },
  { id: 'snowball',  label: 'Snowball',       desc: 'Lowest balance first — fastest wins' },
  { id: 'hybrid',    label: 'Hybrid ⭐',      desc: 'Recommended — clear small debts, then avalanche' },
];

const DEBT_COLORS = {
  upstart:        '#a855f7',
  capOnePersonal: '#3b82f6',
  bestEgg:        '#10b981',
  capOneBP:       '#f59e0b',
  oneMain:        '#ef4444',
  studentLoan:    '#6366f1',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(n ?? 0);

// Month 0 = May 2026 (current month)
function monthLabel(offset) {
  const d = new Date(2026, 4 + offset);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// ─── Simulation ───────────────────────────────────────────────────────────────
function simulate(debts, strategy, extraPerMonth) {
  let order;
  if (strategy === 'avalanche') {
    order = [...debts].sort((a, b) => b.apr - a.apr).map((d) => d.id);
  } else if (strategy === 'snowball') {
    order = [...debts].sort((a, b) => a.balance - b.balance).map((d) => d.id);
  } else if (strategy === 'hybrid') {
    const small = debts.filter((d) => d.balance < 2000).sort((a, b) => a.balance - b.balance);
    const large = debts.filter((d) => d.balance >= 2000).sort((a, b) => b.apr - a.apr);
    order = [...small, ...large].map((d) => d.id);
  } else {
    order = debts.map((d) => d.id);
  }

  let balances = debts.map((d) => ({ ...d, balance: Math.max(0, d.balance) }));
  const payoffMonths = {};
  const months = [];
  let cumulativeInterest = 0;

  for (let m = 0; m < 180; m++) {
    if (balances.every((d) => d.balance <= 0)) break;

    let monthlyInterest = 0;

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

    let extra = Math.max(0, extraPerMonth);
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
    const snap = { month: m, label: monthLabel(m), totalBalance: 0, cumulativeInterest: Math.round(cumulativeInterest) };
    balances.forEach((d) => { snap[d.id] = Math.round(d.balance); });
    snap.totalBalance = balances.reduce((s, d) => s + d.balance, 0);
    snap.totalBalance = Math.round(snap.totalBalance);
    months.push(snap);
  }

  return { months, payoffMonths, totalInterest: cumulativeInterest };
}

// ─── Custom chart tooltip ─────────────────────────────────────────────────────
function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-zinc-300 font-medium mb-1.5">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="text-white font-mono">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function DebtCalculator() {
  const [takeHome, setTakeHome] = useState(() => {
    const v = localStorage.getItem('dc_takeHome');
    return v ? parseFloat(v) : 3200;
  });
  const [billsVariable, setBillsVariable] = useState(() => {
    const v = localStorage.getItem('dc_billsVariable');
    return v ? parseFloat(v) : 1800;
  });
  const [weeklyGross, setWeeklyGross] = useState(() => {
    const v = localStorage.getItem('dc_weeklyGross');
    return v ? parseFloat(v) : 0;
  });
  const [strategy, setStrategy] = useState(
    () => localStorage.getItem('dc_strategy') || 'hybrid',
  );
  const [debtBalances, setDebtBalances] = useState(() => {
    const v = localStorage.getItem('dc_debtBalances');
    if (v) {
      try { return JSON.parse(v); } catch { /* fall through */ }
    }
    return Object.fromEntries(BASE_DEBTS.map((d) => [d.id, APR26_SNAPSHOT[d.id]]));
  });
  const [balancesUpdated, setBalancesUpdated] = useState(
    () => localStorage.getItem('dc_balancesUpdated') || "Apr '26",
  );
  const [balancesOpen, setBalancesOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  // Persist to localStorage
  useEffect(() => { localStorage.setItem('dc_takeHome', takeHome); }, [takeHome]);
  useEffect(() => { localStorage.setItem('dc_billsVariable', billsVariable); }, [billsVariable]);
  useEffect(() => { localStorage.setItem('dc_weeklyGross', weeklyGross); }, [weeklyGross]);
  useEffect(() => { localStorage.setItem('dc_strategy', strategy); }, [strategy]);
  useEffect(() => { localStorage.setItem('dc_debtBalances', JSON.stringify(debtBalances)); }, [debtBalances]);
  useEffect(() => { localStorage.setItem('dc_balancesUpdated', balancesUpdated); }, [balancesUpdated]);

  // Derived values
  const debts = useMemo(
    () => BASE_DEBTS.map((d) => ({ ...d, balance: debtBalances[d.id] ?? APR26_SNAPSHOT[d.id] })),
    [debtBalances],
  );

  const monthlyGigNet = useMemo(
    () => weeklyGross * GIG_EFFICIENCY * WEEKS_PER_MONTH,
    [weeklyGross],
  );

  const totalIncome = takeHome + monthlyGigNet;
  const minPaymentsTotal = BASE_DEBTS.reduce((s, d) => s + d.min, 0);
  const extraPerMonth = Math.max(0, totalIncome - billsVariable - minPaymentsTotal);

  const breakEvenWeekly = useMemo(() => {
    const needed = billsVariable + minPaymentsTotal - takeHome;
    if (needed <= 0) return 0;
    return Math.ceil(needed / (GIG_EFFICIENCY * WEEKS_PER_MONTH));
  }, [billsVariable, minPaymentsTotal, takeHome]);

  const { months, payoffMonths, totalInterest } = useMemo(
    () => simulate(debts, strategy, extraPerMonth),
    [debts, strategy, extraPerMonth],
  );

  // Downsample chart data for legibility
  const chartData = useMemo(
    () => months.filter((_, i) => i % 3 === 0 || i === months.length - 1),
    [months],
  );

  // Payoff sequence sorted by month
  const sequenceData = useMemo(
    () =>
      BASE_DEBTS.filter((d) => d.id in payoffMonths)
        .map((d) => ({ ...d, payoffMonth: payoffMonths[d.id], color: DEBT_COLORS[d.id] }))
        .sort((a, b) => a.payoffMonth - b.payoffMonth),
    [payoffMonths],
  );

  // BNPL by month
  const bnplChartData = useMemo(() => {
    const byMonth = {};
    BNPL_SCHEDULE.forEach((item) => {
      if (!byMonth[item.due]) byMonth[item.due] = { total: 0, items: [] };
      byMonth[item.due].total += item.amount;
      byMonth[item.due].items.push(item);
    });
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([due, { total, items }]) => {
        const [yr, mo] = due.split('-').map(Number);
        const label = new Date(yr, mo - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        return { label, total, items, due };
      });
  }, []);

  const totalDebt = debts.reduce((s, d) => s + d.balance, 0);
  const debtFreeMonth = months.length > 0 ? months.length - 1 : null;

  function updateBalance(id, raw) {
    const val = parseFloat(raw) || 0;
    setDebtBalances((prev) => ({ ...prev, [id]: val }));
    setBalancesUpdated(
      new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    );
  }

  const tabs = ['Balance Over Time', 'Interest Paid', 'Payoff Sequence', 'BNPL Timeline'];

  return (
    <div className="min-h-screen text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-8">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors text-sm mb-4"
          >
            <ArrowLeft size={15} />
            Back to Hub
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Debt Payoff Calculator</h1>
          <p className="text-zinc-400 mt-1 text-sm">Model your path to zero using gig income.</p>
        </div>

        {/* ── Financial Inputs ───────────────────────────────────────────────── */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-4">
          <h2 className="text-base font-semibold mb-4">Monthly Finances</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <label className="block">
              <span className="text-xs text-zinc-400 mb-1 block">Take-Home Pay / Month</span>
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
              <span className="text-xs text-zinc-400 mb-1 block">Variable Bills / Month</span>
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

          {/* Weekly gig slider */}
          <div>
            <div className="flex justify-between items-baseline mb-2">
              <span className="text-xs text-zinc-400">Weekly Gig Gross</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-500">{fmt(monthlyGigNet)}/mo net</span>
                <span className="text-white font-semibold text-sm">{fmt(weeklyGross)}/wk</span>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={450}
              step={5}
              value={weeklyGross}
              onChange={(e) => setWeeklyGross(parseFloat(e.target.value))}
              className="w-full accent-purple-500"
            />
            <div className="flex justify-between text-xs text-zinc-600 mt-1 px-0.5">
              <span>$0</span>
              {breakEvenWeekly > 0 && breakEvenWeekly <= 450 && (
                <span className="text-amber-500 font-medium">
                  break-even ≈ {fmt(breakEvenWeekly)}/wk
                </span>
              )}
              <span>$450</span>
            </div>

            {/* Goal presets */}
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                onClick={() => setWeeklyGross(Math.min(450, breakEvenWeekly))}
                className="px-3 py-1 rounded-full bg-amber-950/50 border border-amber-700/50 text-amber-400 text-xs hover:bg-amber-900/40 transition-colors"
              >
                Break-even {fmt(breakEvenWeekly)}/wk
              </button>
              <button
                onClick={() => setWeeklyGross(HRB_ALL_WEEKS_AVG)}
                className="px-3 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-700 transition-colors"
              >
                HRB avg {fmt(HRB_ALL_WEEKS_AVG)}/wk
              </button>
              <button
                onClick={() => setWeeklyGross(HRB_WORK_WEEKS_AVG)}
                className="px-3 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-700 transition-colors"
              >
                Working-wk avg {fmt(HRB_WORK_WEEKS_AVG)}/wk
              </button>
              <button
                onClick={() => setWeeklyGross(270)}
                className="px-3 py-1 rounded-full bg-purple-950/50 border border-purple-700/50 text-purple-400 text-xs hover:bg-purple-900/40 transition-colors"
              >
                Goal $270/wk
              </button>
            </div>
          </div>
        </section>

        {/* ── Summary cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'Income / Month', value: fmt(totalIncome), color: 'text-white' },
            {
              label: 'Extra / Month',
              value: fmt(extraPerMonth),
              color: extraPerMonth > 0 ? 'text-emerald-400' : 'text-red-400',
            },
            {
              label: 'Debt-Free',
              value: debtFreeMonth !== null ? monthLabel(debtFreeMonth) : '> 15yr',
              color: 'text-purple-400',
            },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center"
            >
              <p className="text-xs text-zinc-400 mb-1">{label}</p>
              <p className={`text-xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* ── Strategy selector ──────────────────────────────────────────────── */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-4">
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

        {/* ── Payoff timeline ────────────────────────────────────────────────── */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-4">
          <div className="flex justify-between items-baseline mb-4">
            <h2 className="text-base font-semibold">Payoff Timeline</h2>
            <span className="text-xs text-zinc-400">
              Total interest:{' '}
              <span className="text-red-400 font-medium">{fmt(totalInterest)}</span>
            </span>
          </div>
          <div className="space-y-3">
            {BASE_DEBTS.map((d) => {
              const balance = debtBalances[d.id] ?? APR26_SNAPSHOT[d.id];
              const snap = APR26_SNAPSHOT[d.id];
              const mo = payoffMonths[d.id];
              const pct = Math.min(100, Math.max(0, ((snap - balance) / snap) * 100));
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
                  <span className="text-xs text-zinc-400 w-16 text-right flex-shrink-0">
                    {mo !== undefined ? monthLabel(mo) : '> 15yr'}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-zinc-800 flex flex-wrap justify-between gap-2 text-sm">
            <span className="text-zinc-400">
              Total debt:{' '}
              <span className="text-white font-medium">{fmt(totalDebt)}</span>
            </span>
            <span className="text-zinc-400">
              Min payments:{' '}
              <span className="text-white font-medium">{fmt(minPaymentsTotal)}/mo</span>
            </span>
          </div>
        </section>

        {/* ── Editable Balances ──────────────────────────────────────────────── */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl mb-4">
          <button
            className="w-full flex items-center justify-between p-6 text-left"
            onClick={() => setBalancesOpen((o) => !o)}
          >
            <div>
              <h2 className="text-base font-semibold">Current Balances</h2>
              <p className="text-xs text-zinc-400 mt-0.5">Last updated: {balancesUpdated}</p>
            </div>
            {balancesOpen ? (
              <ChevronUp size={18} className="text-zinc-400" />
            ) : (
              <ChevronDown size={18} className="text-zinc-400" />
            )}
          </button>

          {balancesOpen && (
            <div className="px-6 pb-6">
              <p className="text-xs text-zinc-500 mb-4">
                Edit to update projections. Progress bars show % paid vs Apr &lsquo;26 snapshot.
              </p>
              <div className="space-y-5">
                {BASE_DEBTS.map((d) => {
                  const balance = debtBalances[d.id] ?? APR26_SNAPSHOT[d.id];
                  const snap = APR26_SNAPSHOT[d.id];
                  const pct = Math.min(100, Math.max(0, ((snap - balance) / snap) * 100));
                  return (
                    <div key={d.id}>
                      <div className="flex justify-between items-baseline mb-1">
                        <span
                          className="text-sm font-medium"
                          style={{ color: DEBT_COLORS[d.id] }}
                        >
                          {d.name}
                        </span>
                        <span className="text-xs text-zinc-500">
                          Apr &lsquo;26 snapshot: {fmt(snap)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">
                            $
                          </span>
                          <input
                            type="number"
                            value={balance}
                            onChange={(e) => updateBalance(d.id, e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-7 pr-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
                          />
                        </div>
                        <span className="text-xs text-zinc-400 w-14 text-right">
                          {pct.toFixed(1)}% off
                        </span>
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
            </div>
          )}
        </section>

        {/* ── Charts ────────────────────────────────────────────────────────── */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl mb-4">
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
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    tick={{ fill: '#71717a', fontSize: 10 }}
                    width={42}
                  />
                  <Tooltip content={<DarkTooltip />} />
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
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    tick={{ fill: '#71717a', fontSize: 10 }}
                    width={42}
                  />
                  <Tooltip content={<DarkTooltip />} />
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
                    Add extra income above to see payoff sequence.
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
                          className="h-5 rounded flex-shrink-0 transition-all"
                          style={{
                            background: `${item.color}30`,
                            border: `1px solid ${item.color}80`,
                            width: `${Math.max(barPct, 5)}%`,
                            minWidth: '2rem',
                          }}
                        />
                        <span className="text-xs font-medium ml-1" style={{ color: item.color }}>
                          {monthLabel(item.payoffMonth)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Tab 3 — BNPL Timeline */}
            {activeTab === 3 && (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={bnplChartData}
                  margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                  <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 10 }} />
                  <YAxis
                    tickFormatter={(v) => `$${v}`}
                    tick={{ fill: '#71717a', fontSize: 10 }}
                    width={42}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const entry = bnplChartData.find((d) => d.label === label);
                      return (
                        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs shadow-xl">
                          <p className="text-zinc-300 font-medium mb-1.5">{label}</p>
                          {entry?.items.map((item) => (
                            <div key={item.name} className="flex justify-between gap-4">
                              <span className="text-zinc-400">{item.name}</span>
                              <span className="text-white font-mono">{fmt(item.amount)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between gap-4 mt-2 pt-2 border-t border-zinc-700">
                            <span className="text-zinc-300 font-medium">Total</span>
                            <span className="text-white font-mono font-bold">
                              {fmt(payload[0].value)}
                            </span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="total" name="BNPL Due" fill="#a855f7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* ── BNPL Schedule list ─────────────────────────────────────────────── */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-8">
          <h2 className="text-base font-semibold mb-4">BNPL Schedule</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
            {BNPL_SCHEDULE.map((item) => {
              const [yr, mo] = item.due.split('-').map(Number);
              const label = new Date(yr, mo - 1).toLocaleDateString('en-US', {
                month: 'short',
                year: 'numeric',
              });
              return (
                <div
                  key={item.name}
                  className="flex items-center justify-between py-2 border-b border-zinc-800"
                >
                  <span className="text-sm text-zinc-300">{item.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500">{label}</span>
                    <span className="text-sm font-mono text-white">{fmt(item.amount)}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex justify-end">
            <span className="text-sm text-zinc-400">
              Total BNPL:{' '}
              <span className="text-white font-semibold">
                {fmt(BNPL_SCHEDULE.reduce((s, i) => s + i.amount, 0))}
              </span>
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
