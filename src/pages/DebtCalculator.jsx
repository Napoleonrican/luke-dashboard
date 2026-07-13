import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp, Eye, EyeOff, Settings, ExternalLink, Copy, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchDebts } from '../lib/fin';
import { buildSnapshotMarkdown } from '../lib/claudeExport';
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  DEFAULT_HOURLY_RATE, DEFAULT_BENCHMARKS, benchmarkWeekly,
} from './debtcalc/benchmarks';

// ─── Supabase sync ────────────────────────────────────────────────────────────
const SB_ROW_ID   = 'luke';
const UPDATED_KEY = 'dp_updatedAt';

// ─── Constants ────────────────────────────────────────────────────────────────
const GIG_EFFICIENCY  = 0.83;
const WEEKS_PER_MONTH = 4.33;
const WEEKLY_SLIDER_MAX = 700;

// ─── Debt source: live from fin_debts (the Debts tab). ────────────────────────
const TAG_FROM_CREDIT = { 'Credit Card': 'CC', Loan: 'Loan', BNPL: 'BNPL' };
const TAG_COLORS = { CC: '#f59e0b', Loan: '#6366f1', BNPL: '#f97316', Mixed: '#94a3b8' };
const PALETTE = [
  '#a855f7', '#3b82f6', '#10b981', '#ef4444', '#6366f1', '#f97316',
  '#ec4899', '#06b6d4', '#f59e0b', '#14b8a6', '#8b5cf6', '#84cc16',
];

// ─── Strategies (Hybrid removed; Current = your paydown priority) ──────────────
const STRATEGIES = [
  { id: 'current',   label: 'Current Order', desc: 'By the Payoff Priority set on your Debts tab' },
  { id: 'avalanche', label: 'Avalanche',     desc: 'Highest APR first — lowest total interest' },
  { id: 'snowball',  label: 'Snowball',      desc: 'Lowest balance first — fastest wins' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtDec = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);

function monthLabel(offset) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// ─── Simulation ───────────────────────────────────────────────────────────────
function simulate(debts, strategy, extraPerMonth) {
  const origMins = Object.fromEntries(debts.map((d) => [d.id, d.min]));

  let order;
  if (strategy === 'avalanche') {
    order = [...debts].sort((a, b) => b.apr - a.apr).map((d) => d.id);
  } else if (strategy === 'snowball') {
    order = [...debts].sort((a, b) => a.balance - b.balance).map((d) => d.id);
  } else {
    // current — by the paydown priority entered on the Debts tab (nulls last)
    order = [...debts]
      .sort((a, b) => (a.priority ?? 9999) - (b.priority ?? 9999))
      .map((d) => d.id);
  }

  let balances = debts.map((d) => ({ ...d, balance: Math.max(0, d.balance) }));
  const payoffMonths = {};
  const months = [];
  let cumulativeInterest = 0;

  for (let m = 0; m < 120; m++) {
    if (balances.every((d) => d.balance <= 0)) break;
    const discFreed = balances.filter((d) => d.balance <= 0).reduce((s, d) => s + (origMins[d.id] || 0), 0);
    let monthlyInterest = 0;

    balances.forEach((d) => {
      if (d.balance <= 0) return;
      const interest = d.balance * (d.apr / 12);
      monthlyInterest += interest;
      d.balance += interest;
      const pay = Math.min(d.min, d.balance);
      d.balance -= pay;
      if (d.balance < 0.01) { d.balance = 0; if (!(d.id in payoffMonths)) payoffMonths[d.id] = m; }
    });

    let extra = Math.max(0, extraPerMonth) + discFreed;
    for (const id of order) {
      if (extra < 0.01) break;
      const d = balances.find((b) => b.id === id);
      if (!d || d.balance <= 0) continue;
      const pay = Math.min(extra, d.balance);
      d.balance -= pay;
      extra -= pay;
      if (d.balance < 0.01) { d.balance = 0; if (!(d.id in payoffMonths)) payoffMonths[d.id] = m; }
    }

    cumulativeInterest += monthlyInterest;
    const snap = { month: m, label: monthLabel(m), totalBalance: 0, cumulativeInterest: Math.round(cumulativeInterest) };
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

// ─── Dark tooltip ─────────────────────────────────────────────────────────────
function DarkTooltip({ active, payload, label, privacyMode }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-zinc-300 font-medium mb-1.5">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <Redacted on={privacyMode}><span className="text-white font-mono">{fmt(p.value)}</span></Redacted>
        </div>
      ))}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function DebtCalculator() {
  const ls = (k) => { try { return localStorage.getItem('dp_' + k); } catch { return null; } };

  // ── Scenario inputs (persisted to debt_settings) ────────────────────────────
  const [takeHome, setTakeHome] = useState(() => Number(ls('takeHome')) || 4162);
  const [billsVariable, setBillsVariable] = useState(() => Number(ls('billsVariable')) || 2862);
  const [weeklyGross, setWeeklyGross] = useState(() => Number(ls('weeklyGross')) || 120);
  const [earninWeekly, setEarninWeekly] = useState(() => Number(ls('earninWeekly')) || 285);
  const [strategy, setStrategy] = useState(() => ls('strategy') || 'current');

  // ── Side-gig + benchmark settings (configured on the Settings page) ─────────
  const [hourlyRate, setHourlyRate] = useState(DEFAULT_HOURLY_RATE);
  const [benchmarks, setBenchmarks] = useState(DEFAULT_BENCHMARKS);

  // ── Live debts (single source of truth: fin_debts), grouped by lender ───────
  const [debts, setDebts] = useState([]);
  const [debtsLoading, setDebtsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchDebts().then(({ data }) => {
      if (cancelled) return;
      const groups = {};
      for (const d of data || []) {
        if ((d.balance ?? 0) <= 0) continue;
        const key = d.lender || d.purchase || 'Unknown';
        const g = (groups[key] ||= {
          id: key, name: key, balance: 0, min: 0, aprWeighted: 0, baseline: 0,
          tags: new Set(), priorities: [], count: 0,
        });
        const bal = Math.max(0, d.balance ?? 0);
        g.balance += bal;
        g.min += d.normal_payment ?? 0;
        g.aprWeighted += (d.apr ?? 0) * bal;
        g.baseline += (d.total_due ?? 0) > 0 ? d.total_due : bal;
        g.tags.add(d.credit_type);
        if (d.paydown_priority != null) g.priorities.push(d.paydown_priority);
        g.count += 1;
      }
      const mapped = Object.values(groups).map((g) => ({
        id: g.id,
        name: g.count > 1 ? `${g.name} (${g.count})` : g.name,
        balance: g.balance,
        apr: g.balance > 0 ? g.aprWeighted / g.balance : 0,
        min: g.min,
        tag: g.tags.size === 1 ? (TAG_FROM_CREDIT[[...g.tags][0]] || 'Loan') : 'Mixed',
        baseline: g.baseline,
        priority: g.priorities.length ? Math.min(...g.priorities) : null,
      }));
      setDebts(mapped);
      setDebtsLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const debtColor = useMemo(
    () => Object.fromEntries(debts.map((d, i) => [d.id, PALETTE[i % PALETTE.length]])),
    [debts],
  );

  // ── UI state ────────────────────────────────────────────────────────────────
  const [showInputs, setShowInputs]     = useState(false);
  const [balancesOpen, setBalancesOpen] = useState(false);
  const [activeTab, setActiveTab]       = useState(0);
  const [privacyMode, setPrivacyMode]   = useState(true);
  const [synced, setSynced]             = useState(false);

  // ── Supabase: pull on mount, then enable writes ─────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!supabase) { if (!cancelled) setSynced(true); return; }
      const { data, error } = await supabase.from('debt_settings').select('*').eq('id', SB_ROW_ID).single();
      if (cancelled) return;
      if (data && !error) {
        const localTs = localStorage.getItem(UPDATED_KEY);
        if (!localTs || data.updated_at > localTs) {
          setTakeHome(Number(data.take_home)           || 4162);
          setBillsVariable(Number(data.bills_variable) || 2862);
          setWeeklyGross(Number(data.weekly_gross)     || 120);
          setEarninWeekly(Number(data.earnin_weekly)   || 285);
          setStrategy(data.strategy                    || 'current');
          try { localStorage.setItem(UPDATED_KEY, data.updated_at); } catch { /* ignore */ }
        }
        // Settings always reflect the saved config (Settings page is the editor).
        if (data.hourly_rate) setHourlyRate(Number(data.hourly_rate));
        if (Array.isArray(data.benchmarks) && data.benchmarks.length) setBenchmarks(data.benchmarks);
      }
      setSynced(true);
    }
    init();
    return () => { cancelled = true; };
  }, []);

  // ── localStorage persist (scenario only) ────────────────────────────────────
  useEffect(() => {
    if (!synced) return;
    try {
      localStorage.setItem('dp_takeHome',      takeHome);
      localStorage.setItem('dp_billsVariable', billsVariable);
      localStorage.setItem('dp_weeklyGross',   weeklyGross);
      localStorage.setItem('dp_earninWeekly',  earninWeekly);
      localStorage.setItem('dp_strategy',      strategy);
      localStorage.setItem(UPDATED_KEY, new Date().toISOString());
    } catch { /* ignore */ }
  }, [synced, takeHome, billsVariable, weeklyGross, earninWeekly, strategy]);

  // ── Supabase push (debounced) — scenario inputs only ────────────────────────
  const debounceRef = useRef(null);
  const pushToSupabase = useCallback(() => {
    if (!synced || !supabase) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      supabase.from('debt_settings').upsert({
        id: SB_ROW_ID, take_home: takeHome, bills_variable: billsVariable,
        weekly_gross: weeklyGross, earnin_weekly: earninWeekly, strategy,
        updated_at: new Date().toISOString(),
      }).then(({ error }) => { if (error) console.error('[Supabase upsert error]', error.message); });
    }, 1500);
  }, [synced, takeHome, billsVariable, weeklyGross, earninWeekly, strategy]);

  useEffect(() => { pushToSupabase(); return () => clearTimeout(debounceRef.current); }, [pushToSupabase]);

  // ── Totals & monthly math ───────────────────────────────────────────────────
  const totalDebtMins = useMemo(() => debts.reduce((s, d) => s + d.min, 0), [debts]);
  const monthlyOutflow  = billsVariable + totalDebtMins;
  const monthlyDeficit  = Math.max(0, monthlyOutflow - takeHome);
  const breakEvenWeekly = Math.ceil(monthlyDeficit / (WEEKS_PER_MONTH * GIG_EFFICIENCY));
  const monthlyGigNet   = weeklyGross * GIG_EFFICIENCY * WEEKS_PER_MONTH;
  const extraPerMonth   = Math.max(0, monthlyGigNet - monthlyDeficit);
  const isDeficit       = weeklyGross < breakEvenWeekly;
  const surplusDefAmt   = Math.abs(Math.round(monthlyGigNet - monthlyDeficit));
  const hoursPerWeek    = hourlyRate > 0 ? (weeklyGross / hourlyRate).toFixed(1) : '—';
  const totalIncome     = takeHome + monthlyGigNet;

  // ── Earnin reliance gauge (context, NOT a target added onto break-even).
  //    Earnin gets clawed back each payday, so its weekly volume is mostly
  //    repaid timing-churn, not net money you're short — the structural hole is
  //    the break-even deficit. Hitting break-even plugs that hole and lets the
  //    buffer rebuild, and the Earnin draw fades on its own. We show it only so
  //    you can watch it trend down; we deliberately don't stack it on the goal.
  const earninRatio = breakEvenWeekly > 0 ? earninWeekly / breakEvenWeekly : 0;

  // ── Simulation ──────────────────────────────────────────────────────────────
  const { months, payoffMonths, totalInterest } = useMemo(
    () => simulate(debts, strategy, extraPerMonth),
    [debts, strategy, extraPerMonth],
  );
  const chartData = useMemo(() => months.filter((_, i) => i % 3 === 0 || i === months.length - 1), [months]);
  const sequenceData = useMemo(
    () => debts.filter((d) => d.id in payoffMonths)
      .map((d) => ({ ...d, payoffMonth: payoffMonths[d.id], color: debtColor[d.id] }))
      .sort((a, b) => a.payoffMonth - b.payoffMonth),
    [debts, payoffMonths, debtColor],
  );

  const totalDebt     = debts.reduce((s, d) => s + d.balance, 0);
  const totalOriginal = debts.reduce((s, d) => s + d.baseline, 0);
  const totalPaidDown = Math.max(0, totalOriginal - totalDebt);
  const debtFreeMonth = months.length > 0 ? months.length - 1 : null;

  // ── Benchmark presets (break-even computed; rest = hours × hourly rate) ─────
  const goalPresets = useMemo(
    () => benchmarks.map((b) => ({
      ...b,
      weekly: b.computed ? breakEvenWeekly : benchmarkWeekly(b, hourlyRate),
    })),
    [benchmarks, breakEvenWeekly, hourlyRate],
  );

  const inputCls = (blur = true) =>
    `w-full bg-zinc-800 border border-zinc-700 rounded-lg py-2 text-sm text-white
     focus:outline-none focus:border-purple-500 transition-colors${blur && privacyMode ? ' blur-sm' : ''}`;

  // ── Strategy comparison (all strategies, same income assumptions) ──────────
  // Re-runs each strategy so the Claude export can table interest/time side by
  // side. extraPerMonth is income-driven, so it's identical across strategies.
  const strategyComparison = useMemo(
    () => STRATEGIES.map((s) => {
      const sim = simulate(debts, s.id, extraPerMonth);
      return {
        id: s.id,
        label: s.label,
        totalInterest: sim.totalInterest,
        debtFreeMonth: sim.months.length > 0 ? sim.months.length - 1 : null,
      };
    }),
    [debts, extraPerMonth],
  );

  // ── Export snapshot for Claude Chat ────────────────────────────────────────
  const [copied, setCopied] = useState(false);

  function downloadFallback(md) {
    const blob = new Blob([md], { type: 'text/markdown' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `financial-snapshot-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExport() {
    // Don't dump plaintext financials while numbers are hidden — unlock first.
    if (privacyMode) { setPrivacyMode(false); return; }

    const md = buildSnapshotMarkdown({
      takeHome, weeklyGross, monthlyGigNet, totalIncome,
      billsVariable, totalDebtMins, monthlyOutflow,
      monthlyDeficit, breakEvenWeekly, extraPerMonth,
      strategyId: strategy,
      strategyLabel: STRATEGIES.find((s) => s.id === strategy)?.label || strategy,
      debtFreeMonth,
      debts: debts.map((d) => ({
        name: d.name, balance: d.balance, apr: d.apr, min: d.min, tag: d.tag,
        payoffMonth: d.id in payoffMonths ? payoffMonths[d.id] : null,
      })),
      strategyComparison,
    });

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(md)
        .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
        .catch(() => downloadFallback(md));
    } else {
      downloadFallback(md);
    }
  }

  const tabs = ['Balance Over Time', 'Interest Paid', 'Payoff Sequence'];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <Link to="/" className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors text-sm mb-3">
              <ArrowLeft size={15} />Back to Hub
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">Debt Payoff Calculator</h1>
            <p className="text-zinc-400 mt-1 text-sm">
              {debtsLoading ? 'Loading debts…' : `${debts.length} lenders · live from your Debts tab`}
            </p>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-shrink-0">
            <Link to="/debt-calculator/settings" title="Benchmark settings"
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800 text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors">
              <Settings size={15} />
            </Link>
            <button
              onClick={handleExport}
              disabled={debtsLoading}
              title={privacyMode
                ? 'Show numbers first, then copy a snapshot for Claude'
                : 'Copy a Markdown snapshot to paste into a Claude Chat session'}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                copied
                  ? 'bg-emerald-900/30 border-emerald-600 text-emerald-400'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'
              }`}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? 'Copied!' : 'Export for Claude'}
            </button>
            <button onClick={() => setPrivacyMode((p) => !p)}
              title={privacyMode ? 'Show numbers' : 'Hide numbers'}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                privacyMode ? 'bg-amber-900/30 border-amber-600 text-amber-400 hover:bg-amber-900/50'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'}`}>
              {privacyMode ? <Eye size={15} /> : <EyeOff size={15} />}
              {privacyMode ? 'Show' : 'Hide'}
            </button>
          </div>
        </div>

        {/* ── Compact collapsibles: My Numbers + Current Balances ──────────────*/}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
          <MyNumbers
            open={showInputs} setOpen={setShowInputs}
            takeHome={takeHome} setTakeHome={setTakeHome}
            billsVariable={billsVariable} setBillsVariable={setBillsVariable}
            earninWeekly={earninWeekly} setEarninWeekly={setEarninWeekly}
            totalDebtMins={totalDebtMins} monthlyOutflow={monthlyOutflow}
            monthlyDeficit={monthlyDeficit} breakEvenWeekly={breakEvenWeekly}
            privacyMode={privacyMode} inputCls={inputCls}
          />
          <CurrentBalances
            open={balancesOpen} setOpen={setBalancesOpen}
            debts={debts} debtColor={debtColor} balancesUpdated={null}
            totalDebt={totalDebt} totalOriginal={totalOriginal} totalPaidDown={totalPaidDown}
            privacyMode={privacyMode}
          />
        </div>

        {/* ── Summary cards ───────────────────────────────────────────────────*/}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <SummaryCard label="Income / Month" value={fmt(totalIncome)} tone="text-white" privacyMode={privacyMode} />
          <SummaryCard label="Extra / Month" value={fmt(extraPerMonth)} tone={extraPerMonth > 0 ? 'text-emerald-400' : 'text-red-400'} privacyMode={privacyMode} />
          <SummaryCard label="Total Interest" value={fmt(totalInterest)} tone="text-red-400" privacyMode={privacyMode} />
          <SummaryCard label="Debt-Free" value={debtFreeMonth !== null ? monthLabel(debtFreeMonth) : '> 10yr'} tone="text-purple-400" privacyMode={false} />
        </div>

        {/* ── Main interactive: controls (left) + charts (right, sticky) ──────*/}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <div className="space-y-4">
            {/* Weekly DoorDash slider */}
            <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h2 className="text-base font-semibold">Weekly DoorDash Earnings</h2>
                  <p className="text-xs text-zinc-400 mt-0.5">Drag to model different dashing commitments</p>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <Redacted on={privacyMode}>
                    <div className="text-2xl font-bold">${weeklyGross}<span className="text-sm font-normal text-zinc-400">/wk</span></div>
                    <div className="text-xs text-zinc-400">≈ {hoursPerWeek} hrs/wk · ${Math.round(weeklyGross * WEEKS_PER_MONTH)}/mo gross</div>
                  </Redacted>
                </div>
              </div>

              <input type="range" min={0} max={WEEKLY_SLIDER_MAX} step={5} value={weeklyGross}
                onChange={(e) => setWeeklyGross(Number(e.target.value))} className="w-full accent-purple-500 mb-2" />
              <div className="flex justify-between text-xs text-zinc-600 mb-1 px-0.5">
                <span>$0</span>
                <Redacted on={privacyMode}><span className="text-amber-500">break-even ≈ {fmt(breakEvenWeekly)}/wk</span></Redacted>
                <span>${WEEKLY_SLIDER_MAX}</span>
              </div>
              <div className="text-center text-xs mb-3 text-zinc-600">
                Break-even is the target — <Redacted on={privacyMode}><span className="text-pink-400">~{fmt(earninWeekly)}/wk Earnin</span></Redacted> is the reliance it retires as your buffer rebuilds
              </div>

              <div className={`rounded-lg p-3 mb-4 ${isDeficit ? 'bg-red-950/50 border border-red-800/60' : 'bg-emerald-950/50 border border-emerald-800/60'}`}>
                {isDeficit ? (
                  <>
                    <p className="text-sm font-bold text-red-400"><Redacted on={privacyMode}>{fmt(surplusDefAmt)}/mo short of break-even</Redacted></p>
                    <p className="text-xs text-red-500 mt-0.5"><Redacted on={privacyMode}>Need at least {fmt(breakEvenWeekly)}/wk to cover all minimums</Redacted></p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold text-emerald-400"><Redacted on={privacyMode}>{fmt(extraPerMonth)}/mo available for extra debt paydown</Redacted></p>
                    <p className="text-xs text-emerald-500 mt-0.5"><Redacted on={privacyMode}>${weeklyGross - breakEvenWeekly}/wk above break-even</Redacted></p>
                  </>
                )}
                <p className="text-xs mt-1.5 pt-1.5 border-t text-pink-300/80 border-zinc-700/60">
                  <Redacted on={privacyMode}>
                    Earnin reliance: ~{fmt(earninWeekly)}/wk ({earninRatio >= 1 ? `${earninRatio.toFixed(1)}×` : 'under'} break-even). It's mostly repaid churn, not net income to replace — plug break-even and it fades.
                  </Redacted>
                </p>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {goalPresets.map((g) => {
                  const active = weeklyGross === g.weekly;
                  return (
                    <button key={g.id} onClick={() => setWeeklyGross(Math.min(WEEKLY_SLIDER_MAX, g.weekly))}
                      className="rounded-xl p-2 text-center border transition-all hover:opacity-90"
                      style={{ borderColor: g.color, background: active ? g.color + '22' : 'transparent', boxShadow: active ? `0 0 0 2px ${g.color}` : 'none' }}>
                      <div className="font-bold text-xs" style={{ color: g.color }}><Redacted on={privacyMode}>${g.weekly}/wk</Redacted></div>
                      <div className="text-xs text-zinc-300 font-medium truncate">{g.name}</div>
                      <div className="text-xs text-zinc-500 truncate">{g.subtext}</div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Payoff Strategy */}
            <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h2 className="text-base font-semibold mb-3">Payoff Strategy</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {STRATEGIES.map((s) => (
                  <button key={s.id} onClick={() => setStrategy(s.id)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      strategy === s.id ? 'bg-purple-900/40 border-purple-500 text-white'
                                        : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500'}`}>
                    <div className="font-medium text-sm">{s.label}</div>
                    <div className="text-xs text-zinc-400 mt-1 leading-snug">{s.desc}</div>
                  </button>
                ))}
              </div>
            </section>
          </div>

          {/* Charts — sticky so they stay in view while you adjust controls */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl lg:sticky lg:top-4">
            <div className="flex border-b border-zinc-800 overflow-x-auto">
              {tabs.map((tab, i) => (
                <button key={tab} onClick={() => setActiveTab(i)}
                  className={`flex-1 min-w-max px-3 py-3 text-xs font-medium whitespace-nowrap transition-colors ${
                    activeTab === i ? 'text-purple-400 border-b-2 border-purple-500' : 'text-zinc-400 hover:text-zinc-200'}`}>
                  {tab}
                </button>
              ))}
            </div>

            <div className="p-4">
              {debtsLoading ? (
                <div className="h-[300px] flex items-center justify-center text-zinc-600 text-sm">Loading…</div>
              ) : debts.length === 0 ? (
                <div className="h-[300px] flex flex-col items-center justify-center gap-2 text-center">
                  <p className="text-zinc-500 text-sm">No debts found.</p>
                  <Link to="/cashflow/debts" className="text-purple-400 hover:text-purple-300 text-sm inline-flex items-center gap-1">
                    Add them on the Debts tab <ExternalLink size={13} />
                  </Link>
                </div>
              ) : activeTab === 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                    <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis yAxisId="left" tickFormatter={(v) => privacyMode ? '●●●' : `$${(v / 1000).toFixed(0)}k`} tick={{ fill: '#71717a', fontSize: 10 }} width={44} />
                    <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => privacyMode ? '●●●' : `$${(v / 1000).toFixed(0)}k`} tick={{ fill: '#52525b', fontSize: 10 }} width={44} />
                    <Tooltip content={(props) => <DarkTooltip {...props} privacyMode={privacyMode} />} />
                    <Legend wrapperStyle={{ fontSize: '11px', color: '#a1a1aa' }} />
                    {debts.map((d) => (
                      <Line key={d.id} yAxisId="left" type="monotone" dataKey={d.id} name={d.name} stroke={debtColor[d.id]} dot={false} strokeWidth={1.5} />
                    ))}
                    <Line yAxisId="right" type="monotone" dataKey="totalBalance" name="Total" stroke="#ffffff" dot={false} strokeWidth={2} strokeDasharray="5 5" />
                  </LineChart>
                </ResponsiveContainer>
              ) : activeTab === 1 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                    <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tickFormatter={(v) => privacyMode ? '●●●' : `$${(v / 1000).toFixed(0)}k`} tick={{ fill: '#71717a', fontSize: 10 }} width={44} />
                    <Tooltip content={(props) => <DarkTooltip {...props} privacyMode={privacyMode} />} />
                    <Area type="monotone" dataKey="cumulativeInterest" name="Cumulative Interest" stroke="#ef4444" fill="#ef444422" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="space-y-3 py-2 min-h-[300px]">
                  {sequenceData.length === 0 ? (
                    <p className="text-zinc-500 text-sm text-center py-12">Add gig income to see the payoff sequence.</p>
                  ) : sequenceData.map((item, i) => {
                    const barPct = Math.min(85, (item.payoffMonth / Math.max(1, debtFreeMonth || 1)) * 85);
                    return (
                      <div key={item.id} className="flex items-center gap-3">
                        <span className="text-zinc-600 text-xs w-5 text-right">{i + 1}</span>
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="text-sm text-zinc-300 w-36 flex-shrink-0 truncate">{item.name}</span>
                        <div className="h-5 rounded transition-all" style={{ background: `${item.color}30`, border: `1px solid ${item.color}80`, width: `${Math.max(barPct, 5)}%`, minWidth: '2rem' }} />
                        <Redacted on={privacyMode}><span className="text-xs font-medium ml-1" style={{ color: item.color }}>{monthLabel(item.payoffMonth)}</span></Redacted>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ─── My Numbers (compact collapsible) ─────────────────────────────────────────
function MyNumbers({ open, setOpen, takeHome, setTakeHome, billsVariable, setBillsVariable, earninWeekly, setEarninWeekly, totalDebtMins, monthlyOutflow, monthlyDeficit, breakEvenWeekly, privacyMode, inputCls }) {
  const shortfall = monthlyDeficit > 0 ? `DoorDash must cover ${fmt(monthlyDeficit)}/mo` : `Surplus ${fmt(Math.abs(monthlyOutflow - takeHome))}/mo ✓`;
  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl self-start">
      <button className="w-full flex items-center justify-between p-4 text-left" onClick={() => setOpen((o) => !o)}>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">My Numbers</h2>
          <p className="text-xs text-zinc-400 mt-0.5 truncate"><Redacted on={privacyMode}>{shortfall}</Redacted></p>
        </div>
        {open ? <ChevronUp size={18} className="text-zinc-400 flex-shrink-0 ml-2" /> : <ChevronDown size={18} className="text-zinc-400 flex-shrink-0 ml-2" />}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-zinc-800">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-3">
            <label className="block">
              <span className="text-xs text-zinc-400 mb-1 block">HRB Monthly Take-Home</span>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">$</span>
                <input type="number" value={takeHome} onChange={(e) => setTakeHome(parseFloat(e.target.value) || 0)} onFocus={(e) => e.target.select()} className={`${inputCls()} pl-7 pr-3`} />
              </div>
            </label>
            <label className="block">
              <span className="text-xs text-zinc-400 mb-1 block">Bills &amp; Variable Expenses</span>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">$</span>
                <input type="number" value={billsVariable} onChange={(e) => setBillsVariable(parseFloat(e.target.value) || 0)} onFocus={(e) => e.target.select()} className={`${inputCls()} pl-7 pr-3`} />
              </div>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs text-zinc-400 mb-1 block">Weekly Earnin draw (reliance gauge)</span>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">$</span>
                <input type="number" value={earninWeekly} onChange={(e) => setEarninWeekly(parseFloat(e.target.value) || 0)} onFocus={(e) => e.target.select()} className={`${inputCls()} pl-7 pr-3`} />
              </div>
              <span className="text-xs text-zinc-500 mt-1 block">Recent avg from your Earnin report — the reliance you want DoorDash to replace.</span>
            </label>
          </div>
          <div className="bg-zinc-800 rounded-xl p-3 text-xs space-y-1.5">
            <Row label="Debt minimums (live)" value={`${fmt(totalDebtMins)}/mo`} privacyMode={privacyMode} />
            <Row label="Total outflow" value={`${fmt(monthlyOutflow)}/mo`} privacyMode={privacyMode} strong />
            <div className={`flex justify-between font-bold border-t border-zinc-700 pt-1.5 ${monthlyDeficit > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              <span>Monthly shortfall</span>
              <Redacted on={privacyMode}><span>{monthlyDeficit > 0 ? `${fmt(monthlyDeficit)}/mo` : 'Surplus ✓'}</span></Redacted>
            </div>
            <div className="flex justify-between text-amber-400"><span>Break-even weekly (target)</span><Redacted on={privacyMode}><span>{fmt(breakEvenWeekly)}/wk</span></Redacted></div>
            <div className="flex justify-between text-pink-400/80"><span>Earnin reliance (gauge)</span><Redacted on={privacyMode}><span>~{fmt(earninWeekly)}/wk</span></Redacted></div>
          </div>
        </div>
      )}
    </section>
  );
}

function Row({ label, value, privacyMode, strong }) {
  return (
    <div className={`flex justify-between ${strong ? 'font-semibold text-zinc-200 border-t border-zinc-700 pt-1.5' : 'text-zinc-400'}`}>
      <span>{label}</span><Redacted on={privacyMode}><span>{value}</span></Redacted>
    </div>
  );
}

// ─── Current Balances (compact collapsible, read-only) ────────────────────────
function CurrentBalances({ open, setOpen, debts, debtColor, totalDebt, totalOriginal, totalPaidDown, privacyMode }) {
  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl self-start">
      <button className="w-full flex items-center justify-between p-4 text-left" onClick={() => setOpen((o) => !o)}>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Current Balances</h2>
          <p className="text-xs text-zinc-400 mt-0.5 truncate">
            <Redacted on={privacyMode}><span className="text-white font-medium">{fmt(totalDebt)}</span></Redacted> remaining
            {totalPaidDown > 0 && <span className="ml-1 text-emerald-400">· <Redacted on={privacyMode}>{fmt(totalPaidDown)} paid down</Redacted></span>}
          </p>
        </div>
        {open ? <ChevronUp size={18} className="text-zinc-400 flex-shrink-0 ml-2" /> : <ChevronDown size={18} className="text-zinc-400 flex-shrink-0 ml-2" />}
      </button>
      {open && (
        <div className="px-4 pb-4">
          <p className="text-xs text-zinc-500 mb-3 flex items-center gap-1.5 flex-wrap">
            Read-only — edit on the
            <Link to="/cashflow/debts" className="text-purple-400 hover:text-purple-300 inline-flex items-center gap-0.5">Debts tab <ExternalLink size={11} /></Link>
          </p>
          <div className="space-y-3">
            {debts.map((d) => {
              const tagColor = TAG_COLORS[d.tag] || '#6366f1';
              const snap = d.baseline || d.balance;
              const pct = snap > 0 ? Math.min(100, Math.max(0, ((snap - d.balance) / snap) * 100)) : 0;
              return (
                <div key={d.id}>
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium truncate" style={{ color: debtColor[d.id] }}>{d.name}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium shrink-0" style={{ color: tagColor, background: tagColor + '20', border: `1px solid ${tagColor}50` }}>{d.tag}</span>
                    </div>
                    <Redacted on={privacyMode}><span className="text-xs text-white font-mono shrink-0 ml-2">{fmtDec(d.balance)}</span></Redacted>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                      <div className="h-1.5 rounded-full transition-all" style={{ backgroundColor: debtColor[d.id], width: `${pct}%` }} />
                    </div>
                    <Redacted on={privacyMode}><span className="text-xs text-zinc-500 w-12 text-right">{pct.toFixed(0)}%</span></Redacted>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-zinc-800 flex justify-between text-xs">
            <span className="text-zinc-400">Remaining: <Redacted on={privacyMode}><span className="text-white font-medium">{fmt(totalDebt)}</span></Redacted></span>
            <span className="text-zinc-500">Baseline: <Redacted on={privacyMode}>{fmt(totalOriginal)}</Redacted></span>
          </div>
        </div>
      )}
    </section>
  );
}

function SummaryCard({ label, value, tone, privacyMode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
      <p className="text-xs text-zinc-400 mb-1">{label}</p>
      <p className={`text-xl font-bold ${tone}`}>{privacyMode ? <Redacted on={privacyMode}>{value}</Redacted> : value}</p>
    </div>
  );
}
