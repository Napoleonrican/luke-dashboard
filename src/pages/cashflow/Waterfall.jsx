import { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Wallet, Plus, Trash2, Banknote, PiggyBank, ArrowDownToLine, SlidersHorizontal, ChevronDown, ChevronRight,
  SkipForward, X, Layers, CalendarClock, CheckCircle2, BadgeCheck,
} from 'lucide-react';
import { Redacted } from './CashflowLayout';
import {
  fetchAccounts, upsertAccount, deleteRow, updateRow, getPref, setPref,
  fetchBills, fetchDebts, fetchDigitalSubs, fetchConsumableSubs, fetchRunwayManual, fetchRunwayDeck,
  addToDeck, updateDeck, upsertRunwayManual,
} from '../../lib/fin';
import { fmt, fmtDec, fmtDate, monthlyOf, updatedColor, daysSince } from './format';
import { AmountEdit } from './ModalField';
import EditCell from './EditCell';
import { DaysBadge } from './cells';
import { Td } from './tableparts';
import ConfirmDialog from './ConfirmDialog';
import {
  normalizeSources, withinWindow, upcomingItems, bucketTotals, isDebtType, itemKey, deckItems,
  advanceDate, TABLE_FOR, DUE_COL_FOR, todayISO,
} from './runway';
import { monthlyDigital, monthlyConsumable } from './subsAgg';
import WipNotice from './WipNotice';
import {
  DEFAULT_INPUTS, applyOverrides, allocate, byAccount, TIER_META, TIER_ORDER,
  fuelWeeklyDynamic, grocWeeklyDynamic,
} from './waterfallCalc';

const PAYCHECK_PREF = 'waterfall_paycheck';
const INCLUDE_PREF = 'waterfall_include_paycheck';
const SIDEGIG_PREF = 'waterfall_sidegig';
const OVER_PREF = 'waterfall_over';       // { '5a': { pct }, '7': { need } } — the only overridable cells
const INPUTS_PREF = 'waterfall_inputs';   // the separate "Plan Inputs" panel values
const WINDOW_PREF = 'runway_window';
const BALANCE_CHECK_PREF = 'waterfall_balance_check_dismissed_on';   // an ISO date
const WINDOWS = [7, 14, 30];

const TYPE_COLOR = {
  Bill: '#3b82f6', 'Debt/Loan': '#8b5cf6', 'Digital Sub.': '#ec4899',
  'One-Time': '#f59e0b', 'Consumable Sub.': '#10b981',
};
const typeColor = (t) => TYPE_COLOR[t] || '#94a3b8';
const MANUAL_TYPES = ['Bill', 'Debt/Loan', 'One-Time', 'Digital Sub.'];

const INPUT_FIELDS = [
  { group: 'What you currently owe', fields: [
    { key: 'earninOwed', label: 'Earnin — payback owed', hint: 'Not linked to the Earnin tab yet — copy the running balance over manually.' },
    { key: 'uberBackupOwed', label: 'Uber Pro — backup balance owed' },
  ] },
  { group: 'Targets (from your Inputs sheet)', fields: [
    { key: 'operatingBufferStage1', label: 'Operating buffer target' },
    { key: 'debtBuffer', label: 'Debt/loan account buffer' },
    { key: 'vehicleMaintTarget', label: 'Ongoing vehicle maintenance target' },
    { key: 'outstandingCX5', label: 'Outstanding CX-5 repairs' },
    { key: 'outstandingVersa', label: 'Outstanding Versa repairs' },
    { key: 'emergencyFundGoal', label: 'Emergency fund goal' },
    { key: 'fuelWeeklyBase', label: 'Fuel — full week need' },
    { key: 'grocWeeklyBase', label: 'Groceries — full week need' },
  ] },
];

// Waterfall + Runway, combined — what's coming up and where this week's money
// goes, on one page, since the two get used together. Income + balances up
// top, what's due next, then the plan itself; Ad Hoc / Current Balances /
// Plan Inputs (the config-ish, occasionally-touched pieces) collapse by
// default at the bottom.
export default function Waterfall() {
  const { privacy } = useOutletContext();
  const [accounts, setAccounts] = useState([]);
  const [bills, setBills] = useState([]);
  const [debts, setDebts] = useState([]);
  const [digital, setDigital] = useState([]);
  const [consumable, setConsumable] = useState([]);
  const [manual, setManual] = useState([]);
  const [deck, setDeck] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paycheck, setPaycheck] = useState(0);
  const [includePaycheck, setIncludePaycheck] = useState(true);
  const [sideGig, setSideGig] = useState(0);
  const [over, setOver] = useState({});
  const [inputs, setInputs] = useState(DEFAULT_INPUTS);
  const [inputsOpen, setInputsOpen] = useState(false);
  const [balancesOpen, setBalancesOpen] = useState(false);
  const [adHocOpen, setAdHocOpen] = useState(false);
  const [comingUpOpen, setComingUpOpen] = useState(true);
  const [windowDays, setWindowDays] = useState(14);
  const [synced, setSynced] = useState(false);
  const [confirmRemoveAccount, setConfirmRemoveAccount] = useState(null);
  const [confirmRemoveManual, setConfirmRemoveManual] = useState(null);
  const [balanceCheckDismissedOn, setBalanceCheckDismissedOn] = useState(null);
  const balancesSectionRef = useRef(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchAccounts(), fetchBills(), fetchDebts(), fetchDigitalSubs(),
      fetchConsumableSubs(), fetchRunwayManual(), fetchRunwayDeck(),
    ]).then(([acc, b, d, dig, cons, man, dk]) => {
      if (!active) return;
      setAccounts(acc.data || []); setBills(b.data || []); setDebts(d.data || []);
      setDigital(dig.data || []); setConsumable(cons.data || []);
      setManual(man.data || []); setDeck(dk.data || []);
      setLoading(false);
    });
    Promise.all([
      getPref(PAYCHECK_PREF), getPref(INCLUDE_PREF), getPref(SIDEGIG_PREF),
      getPref(OVER_PREF), getPref(INPUTS_PREF), getPref(WINDOW_PREF), getPref(BALANCE_CHECK_PREF),
    ]).then(
      ([pc, inc, sg, ov, inp, win, bal]) => {
        if (!active) return;
        if (typeof pc.data === 'number') setPaycheck(pc.data);
        if (typeof inc.data === 'boolean') setIncludePaycheck(inc.data);
        if (typeof sg.data === 'number') setSideGig(sg.data);
        if (ov.data && typeof ov.data === 'object') setOver(ov.data);
        if (inp.data && typeof inp.data === 'object') setInputs({ ...DEFAULT_INPUTS, ...inp.data });
        if (WINDOWS.includes(win.data)) setWindowDays(win.data);
        if (typeof bal.data === 'string') setBalanceCheckDismissedOn(bal.data);
        setSynced(true);
      },
    );
    return () => { active = false; };
  }, []);

  const savePaycheck = (v) => { setPaycheck(v); if (synced) setPref(PAYCHECK_PREF, v); };
  const saveSideGig = (v) => { setSideGig(v); if (synced) setPref(SIDEGIG_PREF, v); };
  const toggleInclude = () => setIncludePaycheck((p) => { const n = !p; if (synced) setPref(INCLUDE_PREF, n); return n; });
  const setWindow = (n) => { setWindowDays(n); setPref(WINDOW_PREF, n); };

  const setPct = (id, v) => {
    const nextOver = { ...over, [id]: { ...over[id], pct: v } };
    setOver(nextOver); if (synced) setPref(OVER_PREF, nextOver);
  };
  const setFlatNeed = (id, v) => {
    const nextOver = { ...over, [id]: { ...over[id], need: v } };
    setOver(nextOver); if (synced) setPref(OVER_PREF, nextOver);
  };
  const setInput = (key, v) => {
    const next = { ...inputs, [key]: v };
    setInputs(next); if (synced) setPref(INPUTS_PREF, next);
  };

  const cashOnHand = accounts.reduce((s, a) => s + (a.balance ?? 0), 0);
  const available = (includePaycheck ? paycheck : 0) + sideGig + cashOnHand;

  // ── Runway: what's coming up ────────────────────────────────────────────────
  const items = normalizeSources({ bills, debts, digital, manual });
  const deckSet = new Set(deck.map((r) => itemKey(r.source_kind, r.source_id)));
  const onDeck = deckItems(deck, items);
  const upcoming = upcomingItems(items, windowDays, deckSet);
  const totals = bucketTotals(withinWindow(items, windowDays));

  const onDeckBillSum = onDeck.filter((it) => !isDebtType(it.type)).reduce((s, it) => s + (it.amount || 0), 0);
  const onDeckDebtSum = onDeck.filter((it) => isDebtType(it.type)).reduce((s, it) => s + (it.amount || 0), 0);
  const onDeckTotal = onDeck.reduce((s, it) => s + (it.amount ?? 0), 0);
  const onDeckByType = Object.entries(
    onDeck.reduce((acc, it) => { acc[it.type] = (acc[it.type] ?? 0) + (it.amount ?? 0); return acc; }, {}),
  ).sort((a, b) => b[1] - a[1]);

  // 7-day bill/debt totals EXCLUDING items already on deck — the workbook
  // counts an on-deck item once (via the sums above), not twice.
  const in7 = withinWindow(items, 7).filter((it) => !deckSet.has(it.key));
  const bills7 = in7.filter((it) => !isDebtType(it.type)).reduce((s, it) => s + (it.amount || 0), 0);
  const debts7 = in7.filter((it) => isDebtType(it.type)).reduce((s, it) => s + (it.amount || 0), 0);

  const subsFloor = (
    digital.filter((s) => s.active).reduce((t, s) => t + monthlyDigital(s), 0)
    + consumable.filter((s) => s.active).reduce((t, s) => t + monthlyConsumable(s), 0)
  ) / 2;

  // Total Fixed Bills used to be a manual Plan Inputs figure (the workbook's
  // hard-coded Inputs!B2). It only ever fed the Floor Build need, and it's
  // exactly what the Bills tab already tracks (category = "Bill", not the
  // "Operating" spend like groceries/fuel) — so it's computed live from there
  // now instead of duplicated as a number you'd have to keep in sync by hand.
  const totalFixedBills = bills
    .filter((b) => b.category === 'Bill')
    .reduce((s, b) => s + monthlyOf(b.amount, b.frequency), 0);

  const fuelWeekly = fuelWeeklyDynamic(inputs.fuelWeeklyBase);
  const grocWeekly = grocWeeklyDynamic(inputs.grocWeeklyBase);

  const balanceFor = (name) => {
    const a = accounts.find((x) => (x.name || '').trim().toLowerCase() === name.trim().toLowerCase());
    return a ? (a.balance ?? 0) : 0;
  };

  // "Already in Bill Pay" mode sweeps whatever's actually sitting in Bill Pay
  // Checking into this week's pool, then treats that account as if it started
  // the week at $0 — the plan below decides how much of it comes back into
  // Bill Pay (via 0b/2/4) versus flows to every other account. Every other
  // account's balance is untouched (real, not swept). `effectiveBalFor` is
  // what the plan reasons with; `balanceFor` (real) stays for Current
  // Balances and anywhere else that should show what's actually in the bank.
  const billPayBalance = balanceFor('Bill Pay Checking');
  const effectiveBalFor = (name) => (
    !includePaycheck && name.trim().toLowerCase() === 'bill pay checking' ? 0 : balanceFor(name)
  );

  const ctx = {
    bal: effectiveBalFor, inputs, bills7, debts7, onDeckBillSum, onDeckDebtSum, subsFloor, fuelWeekly, grocWeekly,
    totalFixedBills,
  };
  const pool = includePaycheck ? (paycheck + sideGig) : (billPayBalance + sideGig);
  const steps = applyOverrides(over);
  const { rows, leftover } = allocate(steps, pool, ctx);
  const accountPlan = byAccount(rows);
  const totalAllocated = pool - leftover;

  // ── Accounts CRUD ────────────────────────────────────────────────────────────
  const updateAccount = async (id, field, value) => {
    setAccounts((prev) => prev.map((a) => a.id === id ? { ...a, [field]: value } : a));
    await upsertAccount({ id, [field]: value });
  };
  const addAccount = async () => {
    const { data } = await upsertAccount({
      name: 'New Account', slug: `acct-${Date.now()}`, balance: 0, sort_order: accounts.length,
    });
    if (data?.[0]) setAccounts((prev) => [...prev, data[0]]);
  };
  const removeAccount = async (id) => {
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    await deleteRow('fin_accounts', id);
  };

  // Accounts whose balance hasn't been touched today — drives the "still
  // accurate?" banner above Current Balances. Skipped once dismissed for the
  // day, or once every account is already confirmed fresh.
  const today = todayISO();
  const staleAccounts = accounts.filter((a) => (a.updated_at || '').slice(0, 10) !== today);
  const showBalanceCheck = !loading && accounts.length > 0 && staleAccounts.length > 0 && balanceCheckDismissedOn !== today;

  const dismissBalanceCheck = () => {
    setBalanceCheckDismissedOn(today);
    setPref(BALANCE_CHECK_PREF, today);
  };
  // "Looks good" — re-saves each stale balance as-is, which bumps updated_at
  // via the same trigger a real edit would, so it reads as freshly confirmed
  // without changing any figure.
  const confirmBalancesFresh = async () => {
    dismissBalanceCheck();
    await Promise.all(staleAccounts.map((a) => upsertAccount({ id: a.id, balance: a.balance })));
    setAccounts((prev) => prev.map((a) =>
      staleAccounts.some((s) => s.id === a.id) ? { ...a, updated_at: new Date().toISOString() } : a,
    ));
  };
  const jumpToBalances = () => {
    dismissBalanceCheck();
    setBalancesOpen(true);
    balancesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ── Runway actions ───────────────────────────────────────────────────────────
  const moveToDeck = async (it) => {
    const { data } = await addToDeck(it.source_kind, it.source_id);
    if (data?.[0]) setDeck((prev) => [...prev.filter((r) => r.id !== data[0].id), data[0]]);
  };
  const removeFromDeck = async (deckId) => {
    setDeck((prev) => prev.filter((r) => r.id !== deckId));
    await deleteRow('fin_runway_deck', deckId);
  };
  const togglePending = async (deckId, val) => {
    setDeck((prev) => prev.map((r) => r.id === deckId ? { ...r, pending_withdrawal: val } : r));
    await updateDeck(deckId, { pending_withdrawal: val });
  };
  const patchSourceDue = (kind, id, fields) => {
    const setter = { bill: setBills, debt: setDebts, digital: setDigital, manual: setManual }[kind];
    setter?.((prev) => prev.map((r) => r.id === id ? { ...r, ...fields } : r));
  };
  const HAS_UPDATED_ON = { bill: true, debt: true, digital: true, manual: false };
  const advanceFreqFor = (it) => (it.source_kind === 'bill' ? 'Monthly' : it.frequency);
  const advance = async (it, deckId) => {
    const next = advanceDate(it.dueISO, advanceFreqFor(it));
    if (!next) return;
    const fields = { [DUE_COL_FOR[it.source_kind]]: next };
    if (HAS_UPDATED_ON[it.source_kind]) fields.updated_on = todayISO();
    patchSourceDue(it.source_kind, it.source_id, fields);
    if (deckId) { setDeck((prev) => prev.filter((r) => r.id !== deckId)); await deleteRow('fin_runway_deck', deckId); }
    await updateRow(TABLE_FOR[it.source_kind], it.source_id, fields);
  };
  const canAdvance = (it) => !!advanceDate(it.dueISO, advanceFreqFor(it));

  const updateManual = async (id, field, value) => {
    setManual((prev) => prev.map((m) => m.id === id ? { ...m, [field]: value } : m));
    await upsertRunwayManual({ id, [field]: value });
  };
  const addManual = async () => {
    const { data } = await upsertRunwayManual({
      name: 'New item', amount: 0, bill_type: 'One-Time',
      next_due_date: todayISO(), sort_order: manual.length,
    });
    if (data?.[0]) setManual((prev) => [...prev, data[0]]);
  };
  const removeManual = async (id) => {
    setManual((prev) => prev.filter((m) => m.id !== id));
    setDeck((prev) => prev.filter((r) => !(r.source_kind === 'manual' && r.source_id === id)));
    await deleteRow('fin_runway_manual', id);
  };

  // Need cell — read-only "live" figure for every computed step; the surplus
  // %s and Step 7's flat need are the only fields that stay editable here,
  // matching how the workbook itself hard-codes those two directly in-sheet.
  const renderNeed = ({ step, need }) => {
    if (step.auto) {
      // Step 0b bundles two things (matching the workbook): what's owed to
      // Earnin, plus whatever's already staged On Deck (Bill-type) below —
      // both netted against the Bill Pay Checking balance. Break that down on
      // hover so a $0 Earnin balance doesn't read as a bug when on-deck bills
      // are still driving the number.
      const liveTitle = step.auto === 'earninCoverage'
        ? `Earnin owed ${fmtDec(inputs.earninOwed)} + on-deck bills ${fmtDec(onDeckBillSum)} − Bill Pay Checking ${fmtDec(effectiveBalFor('Bill Pay Checking'))}`
        : step.auto === 'floorBuild'
        ? `Total fixed bills ${fmtDec(totalFixedBills)} (live from Bills) − Bill Pay Checking`
        : 'Computed from your accounts, Plan Inputs & 7-day totals';
      return (
        <span className="inline-flex items-center gap-1.5 justify-end">
          <Redacted on={privacy}><span className="tabular-nums text-zinc-300">{fmtDec(need)}</span></Redacted>
          <span className="rounded bg-amber-900/30 px-1 text-[9px] uppercase tracking-wide text-amber-400" title={liveTitle}>live</span>
        </span>
      );
    }
    if (step.tier === 'surplus') {
      return (
        <span className="inline-flex items-center gap-1.5 justify-end">
          <EditCell type="number" value={step.pct} onSave={(v) => setPct(step.id, v)} display={(v) => `${v ?? 0}%`} className="text-zinc-400 tabular-nums" />
          <Redacted on={privacy}><span className="tabular-nums text-zinc-600">· {fmtDec(need)}</span></Redacted>
        </span>
      );
    }
    if (step.tier === 'remainder') return <span className="text-zinc-600">sweep</span>;
    // Only Step 7 (flat, literal in the workbook) reaches here.
    return <Redacted on={privacy}><AmountEdit value={step.need} onCommit={(v) => setFlatNeed(step.id, v)} className="text-zinc-300" /></Redacted>;
  };

  return (
    <div className="space-y-6">
      <WipNotice>
        Needs compute from your accounts, 7-day bill/debt totals &amp; the Plan Inputs panel below —
        double-check the inputs match your real targets before you move money.
      </WipNotice>

      {/* Available this week */}
      <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1fr] gap-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex items-center gap-2 text-zinc-500 mb-3">
            <Wallet size={15} className="text-emerald-400" /><span className="text-xs">Available this week</span>
          </div>
          <Redacted on={privacy}>
            <p className="text-3xl font-bold text-emerald-400 tabular-nums">{fmt(available)}</p>
          </Redacted>
          <div className="mt-4 space-y-2.5 text-sm">
            {/* Paycheck: amount + planning-vs-landed toggle */}
            <div className={`flex items-center justify-between gap-2 ${includePaycheck ? '' : 'opacity-50'}`}>
              <span className="text-zinc-400">Paycheck</span>
              <span className="w-24">
                <Redacted on={privacy}>
                  <AmountEdit value={paycheck} onCommit={savePaycheck} className="text-zinc-200" />
                </Redacted>
              </span>
            </div>
            <div className="inline-flex w-full rounded-lg border border-zinc-700 bg-zinc-800 p-0.5 text-xs">
              <button
                onClick={() => { if (!includePaycheck) toggleInclude(); }}
                className={`flex-1 rounded-md px-2 py-1.5 font-medium transition-colors ${
                  includePaycheck ? 'bg-emerald-900/40 text-emerald-300' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Planning ahead
              </button>
              <button
                onClick={() => { if (includePaycheck) toggleInclude(); }}
                className={`flex-1 rounded-md px-2 py-1.5 font-medium transition-colors ${
                  !includePaycheck ? 'bg-amber-900/40 text-amber-300' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Already in Bill Pay
              </button>
            </div>
            {/* Side-gig earnings */}
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-zinc-400"><Banknote size={14} className="text-zinc-500" />Side-gig earnings</span>
              <span className="w-24">
                <Redacted on={privacy}>
                  <AmountEdit value={sideGig} onCommit={saveSideGig} className="text-zinc-200" />
                </Redacted>
              </span>
            </div>
            {/* Cash on hand (derived) */}
            <div className="flex items-center justify-between gap-2 border-t border-zinc-800 pt-2.5">
              <span className="flex items-center gap-2 text-zinc-400"><PiggyBank size={14} className="text-zinc-500" />Cash on hand</span>
              <Redacted on={privacy}><span className="tabular-nums text-zinc-400">{fmtDec(cashOnHand)}</span></Redacted>
            </div>
          </div>
          {includePaycheck ? (
            <p className="mt-3 text-[11px] text-zinc-500">
              &ldquo;Planning ahead&rdquo; — the paycheck hasn&rsquo;t landed yet, so it&rsquo;s poured as new money on top of your current balances.
            </p>
          ) : (
            <p className="mt-3 text-[11px] text-amber-500/80">
              &ldquo;Already in Bill Pay&rdquo; — Bill Pay Checking&rsquo;s current balance
              (<Redacted on={privacy}><span className="tabular-nums">{fmtDec(billPayBalance)}</span></Redacted>) becomes this week&rsquo;s pool,
              treated as if that account started the week at $0. The plan below decides how much comes back into it versus flows elsewhere.
            </p>
          )}
        </div>

        {/* To distribute — the pool the waterfall pours (new income this week) */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 flex flex-col justify-center">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <ArrowDownToLine size={15} className="text-cyan-400" /><span className="text-xs">To distribute this week</span>
          </div>
          <Redacted on={privacy}><p className="text-3xl font-bold text-cyan-400 tabular-nums">{fmt(pool)}</p></Redacted>
          <p className="mt-2 text-[11px] text-zinc-500">
            {includePaycheck
              ? 'New income poured through the plan below (paycheck + side-gig). Cash on hand stays put.'
              : 'Bill Pay Checking’s balance, swept + side-gig, poured through the plan below. Every other account’s balance stays put.'}
          </p>
          <div className="mt-3 flex items-center gap-4 text-xs">
            <span className="text-zinc-500">Allocated <Redacted on={privacy}><span className="tabular-nums text-emerald-400">{fmtDec(totalAllocated)}</span></Redacted></span>
            <span className="text-zinc-500">Left <Redacted on={privacy}><span className={`tabular-nums ${leftover > 0.005 ? 'text-amber-400' : 'text-zinc-500'}`}>{fmtDec(leftover)}</span></Redacted></span>
          </div>
        </div>
      </div>

      {/* Short Term Needs: window selector + headline stats */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <CalendarClock size={17} className="text-amber-400" /> Short Term Needs
        </h2>
        <div className="inline-flex rounded-lg border border-zinc-700 bg-zinc-800 p-0.5">
          {WINDOWS.map((n) => (
            <button
              key={n}
              onClick={() => setWindow(n)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                windowDays === n ? 'bg-amber-900/40 text-amber-300' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {n} days
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label={`Bills — next ${windowDays}d`} value={fmt(totals.bills)} privacy={privacy} tone="text-blue-400" />
        <Stat label={`Debts — next ${windowDays}d`} value={fmt(totals.debt)} privacy={privacy} tone="text-violet-400" />
        <Stat label={`Total — next ${windowDays}d`} value={fmt(totals.total)} privacy={privacy} tone="text-amber-400" />
        <OnDeckCard total={onDeckTotal} byType={onDeckByType} count={onDeck.length} privacy={privacy} />
      </div>

      {/* On Deck / Pending Withdrawal */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
          <Layers size={15} className="text-emerald-400" />
          <h3 className="text-sm font-semibold">On Deck</h3>
          <span className="text-xs text-zinc-500">— staged to pay · mark Pending once triggered</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">Due</th>
                <th className="px-3 py-2 font-medium text-right">Amount</th>
                <th className="px-3 py-2 font-medium text-right">Days</th>
                <th className="px-3 py-2 font-medium text-center">Pending</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {onDeck.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-zinc-600 text-xs">Nothing on deck. Move items down from the upcoming list below.</td></tr>
              ) : onDeck.map((it) => (
                <tr key={it.deckId} className={`border-b border-zinc-800/60 last:border-0 group ${it.pending_withdrawal ? 'bg-amber-950/20' : 'hover:bg-zinc-800/30'}`}>
                  <NameCell it={it} />
                  <Td className="tabular-nums text-zinc-300">{fmtDate(it.dueISO)}</Td>
                  <AmountCell amount={it.amount} privacy={privacy} />
                  <Td className="text-right"><DaysBadge iso={it.dueISO} /></Td>
                  <Td className="text-center">
                    <input type="checkbox" checked={!!it.pending_withdrawal}
                      onChange={(e) => togglePending(it.deckId, e.target.checked)}
                      className="h-4 w-4 accent-amber-500 cursor-pointer" title="Pending Withdrawal" />
                  </Td>
                  <Td className="text-right">
                    <span className="inline-flex items-center gap-2 justify-end">
                      {canAdvance(it) && (
                        <button onClick={() => advance(it, it.deckId)} title="Advance to next due date & clear"
                          className="text-zinc-500 hover:text-emerald-400 transition-colors"><SkipForward size={14} /></button>
                      )}
                      {it.source_kind === 'manual' && (
                        <button onClick={() => setConfirmRemoveManual(it)} title="Mark paid & remove — one-off items don't recur"
                          className="text-zinc-500 hover:text-emerald-400 transition-colors"><CheckCircle2 size={14} /></button>
                      )}
                      <button onClick={() => removeFromDeck(it.deckId)} title="Take off deck (keeps it on the upcoming list)"
                        className="text-zinc-500 hover:text-red-400 transition-colors"><X size={15} /></button>
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Coming Up — collapsible, open by default (checked alongside On Deck daily) */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <button
          onClick={() => setComingUpOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-zinc-800/30 transition-colors"
        >
          <span className="flex items-center gap-2">
            <CalendarClock size={15} className="text-amber-400" />
            <span className="text-sm font-semibold">Coming Up — next {windowDays} days</span>
            <span className="text-xs text-zinc-500">— live from Bills, Debts, Subscriptions &amp; ad-hoc</span>
          </span>
          {comingUpOpen ? <ChevronDown size={15} className="text-zinc-500" /> : <ChevronRight size={15} className="text-zinc-500" />}
        </button>
        {comingUpOpen && (
        <div className="overflow-x-auto border-t border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">Due</th>
                <th className="px-3 py-2 font-medium text-right">Amount</th>
                <th className="px-3 py-2 font-medium text-right">Days</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-zinc-600">Loading…</td></tr>
              ) : upcoming.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-zinc-600 text-xs">Nothing due in the next {windowDays} days.</td></tr>
              ) : upcoming.map((it) => (
                <tr key={it.key} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 group">
                  <NameCell it={it} />
                  <Td className="tabular-nums text-zinc-300">{fmtDate(it.dueISO)}</Td>
                  <AmountCell amount={it.amount} privacy={privacy} />
                  <Td className="text-right"><DaysBadge iso={it.dueISO} /></Td>
                  <Td className="text-right">
                    <span className="inline-flex items-center gap-2 justify-end">
                      {canAdvance(it) && (
                        <button onClick={() => advance(it)} title="Advance to next due date"
                          className="text-zinc-500 hover:text-emerald-400 transition-colors opacity-0 group-hover:opacity-100"><SkipForward size={14} /></button>
                      )}
                      {it.source_kind === 'manual' && (
                        <button onClick={() => setConfirmRemoveManual(it)} title="Mark paid & remove — one-off items don't recur"
                          className="text-zinc-500 hover:text-emerald-400 transition-colors opacity-0 group-hover:opacity-100"><CheckCircle2 size={14} /></button>
                      )}
                      <button onClick={() => moveToDeck(it)}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-700/60 bg-emerald-900/20 px-2 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-900/40 transition-colors">
                        <ArrowDownToLine size={13} /> On Deck
                      </button>
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </section>

      {/* Allocation: steps + per-account rollup — the core output, always open */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4 items-start">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-zinc-800">
            <div>
              <h3 className="text-sm font-semibold">This week&rsquo;s plan</h3>
              <p className="text-xs text-zinc-500 mt-0.5"><span className="text-amber-400">Live</span> needs are computed — edit Plan Inputs below, not the table.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-2 font-medium">Step</th>
                  <th className="px-3 py-2 font-medium text-right">Need</th>
                  <th className="px-3 py-2 font-medium text-right">Allocate</th>
                  <th className="px-3 py-2 font-medium text-right">Left</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} className="px-3 py-8 text-center text-zinc-600">Loading…</td></tr>
                ) : TIER_ORDER.map((tier) => {
                  const tierRows = rows.filter((r) => r.step.tier === tier);
                  if (!tierRows.length) return null;
                  return (
                    <TierGroup key={tier} tier={tier} rows={tierRows} renderNeed={renderNeed} privacy={privacy} />
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Per-account rollup — what to move where */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="text-sm font-semibold mb-0.5">Move into each account</h3>
          <p className="text-xs text-zinc-500 mb-3">The plan, rolled up by destination.</p>
          {loading ? (
            <p className="text-xs text-zinc-600 py-4">Loading…</p>
          ) : accountPlan.length === 0 ? (
            <p className="text-xs text-zinc-600 py-4">Nothing to distribute yet — add income above.</p>
          ) : (
            <div className="space-y-2.5">
              {accountPlan.map((g) => {
                const bal = effectiveBalFor(g.account);
                return (
                  <div key={g.account} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-zinc-200">{g.account}</span>
                      <Redacted on={privacy}><span className="text-sm font-bold tabular-nums text-emerald-400">{fmtDec(g.total)}</span></Redacted>
                    </div>
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      <Redacted on={privacy}><span className="tabular-nums">{fmtDec(bal)}</span></Redacted>
                      {' → '}
                      <Redacted on={privacy}><span className="tabular-nums text-zinc-300">{fmtDec(bal + g.total)}</span></Redacted>
                    </p>
                    <div className="mt-2 space-y-0.5">
                      {g.steps.map((st) => (
                        <div key={st.id} className="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                          <span className="truncate">{st.label}</span>
                          <Redacted on={privacy}><span className="tabular-nums shrink-0">{fmtDec(st.amount)}</span></Redacted>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between border-t border-zinc-800 pt-2 text-sm font-semibold text-zinc-200">
                <span>Total distributed</span>
                <Redacted on={privacy}><span className="tabular-nums text-emerald-400">{fmtDec(totalAllocated)}</span></Redacted>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Ad Hoc / Manual entry — collapsible, closed by default */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <button
            onClick={() => setAdHocOpen((o) => !o)}
            className="flex flex-1 min-w-0 items-center gap-2 text-left hover:text-zinc-200 transition-colors"
          >
            <Plus size={15} className="text-zinc-400 shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Ad Hoc / Manual Entry</span>
              <span className="block text-xs text-zinc-500 mt-0.5">One-offs not on the Bills or Debts tabs.</span>
            </span>
          </button>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={addManual} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-600 bg-emerald-900/30 text-xs font-medium text-emerald-400 hover:bg-emerald-900/50 transition-colors">
              <Plus size={14} /> Add item
            </button>
            <button onClick={() => setAdHocOpen((o) => !o)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
              {adHocOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </button>
          </div>
        </div>
        {adHocOpen && (
        <div className="overflow-x-auto border-t border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">Due</th>
                <th className="px-3 py-2 font-medium text-right">Amount</th>
                <th className="px-3 py-2 font-medium text-right">Days</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {manual.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-zinc-600 text-xs">No manual items. Add rent-service or other one-off charges here.</td></tr>
              ) : manual.map((m) => (
                <tr key={m.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 group">
                  <Td>
                    <span className="flex items-center gap-2">
                      <select
                        value={m.bill_type} onChange={(e) => updateManual(m.id, 'bill_type', e.target.value)}
                        title={`${m.bill_type} — click to change`}
                        className="h-2.5 w-2.5 shrink-0 rounded-full border-0 p-0 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-900"
                        style={{ background: typeColor(m.bill_type) }}
                      >
                        {MANUAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <EditCell value={m.name} onSave={(v) => updateManual(m.id, 'name', v)} className="text-zinc-200 font-medium" />
                    </span>
                  </Td>
                  <Td><EditCell type="date" value={m.next_due_date} onSave={(v) => updateManual(m.id, 'next_due_date', v)} display={fmtDate} className="text-zinc-300 tabular-nums" /></Td>
                  <Td className="text-right">
                    <Redacted on={privacy}><EditCell type="number" value={m.amount} onSave={(v) => updateManual(m.id, 'amount', v)} display={fmtDec} className="text-zinc-200 tabular-nums" /></Redacted>
                  </Td>
                  <Td className="text-right"><DaysBadge iso={m.next_due_date} /></Td>
                  <Td className="text-right">
                    <button onClick={() => setConfirmRemoveManual(m)} className="text-zinc-600 hover:text-red-400 transition-colors p-3 -m-3"><Trash2 size={13} /></button>
                  </Td>
                </tr>
              ))}
            </tbody>
            {manual.length > 0 && (
              <tfoot>
                <tr className="border-t border-zinc-800 text-zinc-400">
                  <Td className="font-medium text-zinc-300" colSpan={2}>Total</Td>
                  <Td className="text-right font-semibold text-emerald-400">
                    <Redacted on={privacy}><span className="tabular-nums">{fmtDec(manual.reduce((s, m) => s + (m.amount ?? 0), 0))}</span></Redacted>
                  </Td>
                  <Td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        )}
      </section>

      {/* Balance freshness check — sits right above Current Balances, only
          shows when something's stale, dismissible for the day. */}
      {showBalanceCheck && (
        <section className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-4">
          <div className="flex items-start gap-2 mb-3">
            <BadgeCheck size={16} className="text-amber-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-amber-200">Still accurate?</h3>
              <p className="text-xs text-amber-300/70 mt-0.5">Last recorded balances — confirm they&rsquo;re right, or jump in and update them.</p>
            </div>
          </div>
          <div className="space-y-1.5 mb-3">
            {accounts.map((a) => {
              const since = daysSince(a.updated_at);
              const c = updatedColor(a.updated_at);
              return (
                <div key={a.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: c?.color }} />
                    <span className="text-zinc-300 truncate">{a.name}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <Redacted on={privacy}><span className="tabular-nums text-zinc-400">{fmtDec(a.balance)}</span></Redacted>
                    <span className="text-[11px] text-zinc-600 w-14 text-right">{since == null ? '—' : since === 0 ? 'today' : `${since}d ago`}</span>
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={dismissBalanceCheck} className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white transition-colors">
              Not now
            </button>
            <button onClick={confirmBalancesFresh} className="rounded-lg border border-emerald-600 bg-emerald-900/30 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-900/50 transition-colors">
              Looks good
            </button>
            <button onClick={jumpToBalances} className="rounded-lg border border-amber-600 bg-amber-900/30 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-900/50 transition-colors">
              Update now
            </button>
          </div>
        </section>
      )}

      {/* Current balances (accounts) — collapsible, closed by default */}
      <section ref={balancesSectionRef} className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <button
            onClick={() => setBalancesOpen((o) => !o)}
            className="flex flex-1 min-w-0 items-center gap-2 text-left hover:text-zinc-200 transition-colors"
          >
            <PiggyBank size={15} className="text-emerald-400 shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Current Balances</span>
              <span className="block text-xs text-zinc-500 mt-0.5">The accounts you track — edit balances inline.</span>
            </span>
          </button>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={addAccount} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-600 bg-emerald-900/30 text-xs font-medium text-emerald-400 hover:bg-emerald-900/50 transition-colors">
              <Plus size={14} /> Add account
            </button>
            <button onClick={() => setBalancesOpen((o) => !o)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
              {balancesOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </button>
          </div>
        </div>
        {balancesOpen && (
        <div className="overflow-x-auto border-t border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-2 font-medium">Account</th>
                <th className="px-4 py-2 font-medium text-right">Balance</th>
                <th className="w-10 px-2 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-zinc-600">Loading…</td></tr>
              ) : accounts.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-zinc-600 text-xs">No accounts yet — add the ones you want to track.</td></tr>
              ) : accounts.map((a) => (
                <tr key={a.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 group">
                  <td className="px-4 py-2">
                    <EditCell value={a.name} onSave={(v) => updateAccount(a.id, 'name', v)} className="text-zinc-200 font-medium" />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Redacted on={privacy}>
                      <AmountEdit value={a.balance} onCommit={(v) => updateAccount(a.id, 'balance', v)} className="text-zinc-200" />
                    </Redacted>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      onClick={() => setConfirmRemoveAccount(a)}
                      className="text-zinc-600 hover:text-red-400 transition-colors p-3 -m-3"
                      title="Delete account"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {!loading && accounts.length > 0 && (
              <tfoot>
                <tr className="border-t border-zinc-800 font-semibold text-zinc-200">
                  <td className="px-4 py-2.5">Total cash on hand</td>
                  <td className="px-4 py-2.5 text-right"><Redacted on={privacy}><span className="tabular-nums text-emerald-400">{fmtDec(cashOnHand)}</span></Redacted></td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        )}
      </section>

      {/* Plan Inputs — the only place non-flat needs get edited (never the table) */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <button
          onClick={() => setInputsOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-zinc-800/30 transition-colors"
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal size={15} className="text-emerald-400" />
            <span className="text-sm font-semibold">Plan Inputs</span>
            <span className="text-xs text-zinc-500">— feeds every &ldquo;live&rdquo; Need above</span>
          </span>
          {inputsOpen ? <ChevronDown size={15} className="text-zinc-500" /> : <ChevronRight size={15} className="text-zinc-500" />}
        </button>
        {inputsOpen && (
          <div className="border-t border-zinc-800 px-4 py-4 space-y-4">
            {INPUT_FIELDS.map((g) => (
              <div key={g.group}>
                <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">{g.group}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {g.fields.map((f) => (
                    <label key={f.key} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
                      <span className="text-xs text-zinc-400" title={f.hint}>{f.label}</span>
                      <span className="w-20 shrink-0">
                        <Redacted on={privacy}>
                          <AmountEdit value={inputs[f.key]} onCommit={(v) => setInput(f.key, v)} className="text-zinc-200" />
                        </Redacted>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div>
              <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">Computed automatically</p>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 max-w-xs">
                <span className="text-xs text-zinc-400" title="Sum of monthly-equivalent amounts for Bills tab rows categorized 'Bill' — feeds Floor Build.">
                  Total fixed bills (monthly)
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <Redacted on={privacy}><span className="tabular-nums text-zinc-300 text-sm">{fmtDec(totalFixedBills)}</span></Redacted>
                  <span className="rounded bg-amber-900/30 px-1 text-[9px] uppercase tracking-wide text-amber-400">live</span>
                </span>
              </div>
            </div>
          </div>
        )}
      </section>

      <p className="text-xs text-zinc-600">
        Every <span className="text-amber-400">live</span> Need is a formula against your accounts, 7-day bill/debt
        totals, on-deck amounts &amp; the Plan Inputs panel above — matching the workbook. The surplus %s (5a/5b/5c)
        and Step 7&rsquo;s flat need stay directly editable, same as the original sheet.
      </p>

      <p className="text-[11px] text-zinc-600 flex flex-wrap gap-4">
        <span><span className="inline-block h-2 w-2 rounded-full align-middle mr-1" style={{ background: 'hsl(0 85% 65%)' }} />Due soon / overdue</span>
        <span><span className="inline-block h-2 w-2 rounded-full align-middle mr-1" style={{ background: 'hsl(60 80% 60%)' }} />Coming up</span>
        <span><span className="inline-block h-2 w-2 rounded-full align-middle mr-1" style={{ background: 'hsl(120 70% 55%)' }} />Plenty of runway</span>
      </p>

      <ConfirmDialog
        open={confirmRemoveAccount}
        title={`Delete “${confirmRemoveAccount?.name || 'this account'}”?`}
        message="This removes it from Current Balances and from every Waterfall calculation that reads its balance. This can’t be undone."
        confirmLabel="Delete account"
        onCancel={() => setConfirmRemoveAccount(null)}
        onConfirm={() => { removeAccount(confirmRemoveAccount.id); setConfirmRemoveAccount(null); }}
      />

      {/* Confirms deletes from anywhere an ad-hoc item shows up (On Deck,
          Coming Up, or the Ad Hoc table itself) — the two shapes passed in
          differ (normalized `it.source_id` vs. the raw row's `.id`). */}
      <ConfirmDialog
        open={confirmRemoveManual}
        title={`Remove “${confirmRemoveManual?.name || 'this item'}”?`}
        message="This deletes it from the Ad Hoc list and off the Runway entirely — for a paid one-off, that's the point. This can't be undone."
        confirmLabel="Mark paid & remove"
        onCancel={() => setConfirmRemoveManual(null)}
        onConfirm={() => {
          removeManual(confirmRemoveManual.source_id ?? confirmRemoveManual.id);
          setConfirmRemoveManual(null);
        }}
      />
    </div>
  );
}

// ── Small presentational cells ────────────────────────────────────────────────
// The colored dot doubles as the type indicator — hover it for the type name
// instead of a dedicated column.
function NameCell({ it }) {
  return (
    <Td>
      <span className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: typeColor(it.type) }} title={it.type} />
        <span className="text-zinc-200 font-medium">{it.name}</span>
      </span>
    </Td>
  );
}

function AmountCell({ amount, privacy }) {
  return (
    <Td className="text-right">
      <Redacted on={privacy}><span className="tabular-nums text-zinc-200">{fmtDec(amount)}</span></Redacted>
    </Td>
  );
}

// On Deck headline: total staged, then the split by type so you know how much
// to have sitting in each account to cover what you've triggered.
function OnDeckCard({ total, byType, count, privacy }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs text-zinc-500 mb-1">On Deck <span className="text-zinc-600">· {count}</span></p>
      <Redacted on={privacy}><span className="text-xl font-bold tabular-nums text-emerald-400">{fmt(total)}</span></Redacted>
      {byType.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {byType.map(([type, amt]) => (
            <div key={type} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: typeColor(type) }} />
                <span className="truncate text-zinc-400">{type}</span>
              </span>
              <Redacted on={privacy}><span className="tabular-nums text-zinc-400 shrink-0">{fmt(amt)}</span></Redacted>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, privacy, tone = 'text-white' }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      {privacy !== undefined
        ? <Redacted on={privacy}><span className={`text-xl font-bold tabular-nums ${tone}`}>{value}</span></Redacted>
        : <span className={`text-xl font-bold tabular-nums ${tone}`}>{value}</span>}
    </div>
  );
}

// One tier's subheader + its step rows.
function TierGroup({ tier, rows, renderNeed, privacy }) {
  const meta = TIER_META[tier];
  return (
    <>
      <tr className="bg-zinc-950/40">
        <td colSpan={4} className="px-3 py-1.5">
          <span className="text-[11px] uppercase tracking-wide font-semibold text-zinc-400">{meta.label}</span>
          <span className="text-[11px] text-zinc-600 font-normal normal-case"> · {meta.note}</span>
        </td>
      </tr>
      {rows.map(({ step, need, allocated, remainingAfter }) => {
        const funded = allocated > 0.005;
        return (
          <tr key={step.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30">
            <td className="px-3 py-2">
              <span className="text-zinc-300"><span className="text-zinc-600 mr-1.5">{step.id}</span>{step.label}</span>
            </td>
            <td className="px-3 py-2 text-right">{renderNeed({ step, need })}</td>
            <td className="px-3 py-2 text-right">
              <Redacted on={privacy}><span className={`tabular-nums font-medium ${funded ? 'text-emerald-400' : 'text-zinc-600'}`}>{funded ? fmtDec(allocated) : '—'}</span></Redacted>
            </td>
            <td className="px-3 py-2 text-right">
              <Redacted on={privacy}><span className="tabular-nums text-zinc-500">{fmtDec(remainingAfter)}</span></Redacted>
            </td>
          </tr>
        );
      })}
    </>
  );
}
