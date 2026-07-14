import { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Wallet, Plus, Trash2, Banknote, PiggyBank, ArrowDownToLine, SlidersHorizontal, ChevronDown, ChevronRight,
  SkipForward, X, Layers, CalendarClock, CheckCircle2, BadgeCheck, Eye, EyeOff, ArrowLeftRight, Settings,
} from 'lucide-react';
import { Redacted } from './CashflowLayout';
import {
  fetchAccounts, upsertAccount, deleteRow, updateRow, getPref, setPref,
  fetchBills, fetchDebts, fetchDigitalSubs, fetchConsumableSubs, fetchRunwayManual, fetchRunwayDeck,
  addToDeck, updateDeck, upsertRunwayManual,
  fetchPendingTransfers, upsertPendingTransfer, fetchEarninTransactions,
} from '../../lib/fin';
import { fmt, fmtDec, fmtDate, monthlyOf, updatedColor, daysSince, daysUntil } from './format';
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
const SECTIONS_PREF = 'waterfall_sections';   // { money, needs, payday } open/closed
const BANKED_PREF = 'waterfall_banked_accounts';   // [accountId, …] swept into the pool
const WINDOWS = [7, 14, 30];

// Biweekly payday anchor — every other Wednesday, next landing 7/22/26.
// Recomputed relative to today, so "Until Paycheck" always points forward.
const PAYCHECK_ANCHOR = '2026-07-22';
const PAYCHECK_PERIOD_DAYS = 14;
function nextPaycheckInfo() {
  const [y, m, d] = PAYCHECK_ANCHOR.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  let days = daysUntil(PAYCHECK_ANCHOR);
  while (days < 0) { date.setDate(date.getDate() + PAYCHECK_PERIOD_DAYS); days += PAYCHECK_PERIOD_DAYS; }
  const p = (n) => String(n).padStart(2, '0');
  return { days, iso: `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}` };
}

const TYPE_COLOR = {
  Bill: '#3b82f6', 'Debt/Loan': '#8b5cf6', 'Digital Sub.': '#ec4899',
  'One-Time': '#f59e0b', 'Consumable Sub.': '#10b981',
};
const typeColor = (t) => TYPE_COLOR[t] || '#94a3b8';
const MANUAL_TYPES = ['Bill', 'Debt/Loan', 'One-Time', 'Digital Sub.'];

const INPUT_FIELDS = [
  { group: 'What you currently owe', fields: [
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
  const { privacy, onTogglePrivacy, setPageMenuItems } = useOutletContext();
  const [accounts, setAccounts] = useState([]);
  const [bills, setBills] = useState([]);
  const [debts, setDebts] = useState([]);
  const [digital, setDigital] = useState([]);
  const [consumable, setConsumable] = useState([]);
  const [manual, setManual] = useState([]);
  const [deck, setDeck] = useState([]);
  const [pending, setPending] = useState([]);
  const [earninTxns, setEarninTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paycheck, setPaycheck] = useState(0);
  const [includePaycheck, setIncludePaycheck] = useState(true);
  const [sideGig, setSideGig] = useState(0);
  const [over, setOver] = useState({});
  const [bankedIds, setBankedIds] = useState([]);   // account ids swept into the pool
  const [inputs, setInputs] = useState(DEFAULT_INPUTS);
  const [planInputsModalOpen, setPlanInputsModalOpen] = useState(false);
  const [balancesOpen, setBalancesOpen] = useState(true);
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  const [acctMenuOpen, setAcctMenuOpen] = useState(false);
  // Page-level collapsible groups (persisted to fin_prefs). "needs" toggles the
  // Short Term Needs detail tables (the 4 summary cards stay visible either way).
  const [moneyOpen, setMoneyOpen] = useState(true);
  const [needsOpen, setNeedsOpen] = useState(true);
  const [paydayOpen, setPaydayOpen] = useState(false);
  const [customWindowDays, setCustomWindowDays] = useState(14);
  const [windowMode, setWindowMode] = useState('days');   // 'days' | 'paycheck'
  const [synced, setSynced] = useState(false);
  const [confirmRemoveAccount, setConfirmRemoveAccount] = useState(null);
  const [confirmRemoveManual, setConfirmRemoveManual] = useState(null);
  const [confirmRemovePending, setConfirmRemovePending] = useState(null);
  const [balanceCheckDismissedOn, setBalanceCheckDismissedOn] = useState(null);
  const balancesSectionRef = useRef(null);

  // Register the "Plan Inputs…" action into the layout's ⋯ menu while this tab
  // is mounted; clear it on unmount so it only shows on Waterfall.
  useEffect(() => {
    setPageMenuItems([{ icon: SlidersHorizontal, label: 'Plan Inputs…', onClick: () => setPlanInputsModalOpen(true) }]);
    return () => setPageMenuItems([]);
  }, [setPageMenuItems]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchAccounts(), fetchBills(), fetchDebts(), fetchDigitalSubs(),
      fetchConsumableSubs(), fetchRunwayManual(), fetchRunwayDeck(), fetchPendingTransfers(),
      fetchEarninTransactions(),
    ]).then(([acc, b, d, dig, cons, man, dk, pt, et]) => {
      if (!active) return;
      setAccounts(acc.data || []); setBills(b.data || []); setDebts(d.data || []);
      setDigital(dig.data || []); setConsumable(cons.data || []);
      setManual(man.data || []); setDeck(dk.data || []); setPending(pt.data || []);
      setEarninTxns(et.data || []);
      setLoading(false);
    });
    Promise.all([
      getPref(PAYCHECK_PREF), getPref(INCLUDE_PREF), getPref(SIDEGIG_PREF),
      getPref(OVER_PREF), getPref(INPUTS_PREF), getPref(WINDOW_PREF), getPref(BALANCE_CHECK_PREF),
      getPref(SECTIONS_PREF), getPref(BANKED_PREF),
    ]).then(
      ([pc, inc, sg, ov, inp, win, bal, sec, bnk]) => {
        if (!active) return;
        if (typeof pc.data === 'number') setPaycheck(pc.data);
        if (typeof inc.data === 'boolean') setIncludePaycheck(inc.data);
        if (typeof sg.data === 'number') setSideGig(sg.data);
        if (ov.data && typeof ov.data === 'object') setOver(ov.data);
        if (inp.data && typeof inp.data === 'object') setInputs({ ...DEFAULT_INPUTS, ...inp.data });
        // Backward-compatible: older prefs stored a bare number (fixed-day mode).
        if (typeof win.data === 'number') {
          if (WINDOWS.includes(win.data)) setCustomWindowDays(win.data);
        } else if (win.data && typeof win.data === 'object') {
          if (WINDOWS.includes(win.data.days)) setCustomWindowDays(win.data.days);
          if (win.data.mode === 'paycheck' || win.data.mode === 'days') setWindowMode(win.data.mode);
        }
        if (typeof bal.data === 'string') setBalanceCheckDismissedOn(bal.data);
        if (sec.data && typeof sec.data === 'object') {
          if (typeof sec.data.money === 'boolean') setMoneyOpen(sec.data.money);
          if (typeof sec.data.needs === 'boolean') setNeedsOpen(sec.data.needs);
          if (typeof sec.data.payday === 'boolean') setPaydayOpen(sec.data.payday);
        }
        if (Array.isArray(bnk.data)) setBankedIds(bnk.data);
        setSynced(true);
      },
    );
    return () => { active = false; };
  }, []);

  const savePaycheck = (v) => { setPaycheck(v); if (synced) setPref(PAYCHECK_PREF, v); };
  const saveSideGig = (v) => { setSideGig(v); if (synced) setPref(SIDEGIG_PREF, v); };
  const toggleInclude = () => setIncludePaycheck((p) => { const n = !p; if (synced) setPref(INCLUDE_PREF, n); return n; });
  const setWindow = (n) => {
    setWindowMode('days'); setCustomWindowDays(n);
    setPref(WINDOW_PREF, { mode: 'days', days: n });
  };
  const setWindowToPaycheck = () => {
    setWindowMode('paycheck');
    setPref(WINDOW_PREF, { mode: 'paycheck', days: customWindowDays });
  };
  // Bank / un-bank an account: sweep its balance into the pool and plan it from
  // $0 (or reverse). Persisted so it sticks across visits.
  const toggleBanked = (accountId) => setBankedIds((prev) => {
    const next = prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId];
    if (synced) setPref(BANKED_PREF, next);
    return next;
  });
  // The window used everywhere below: a fixed 7/14/30, or the live day-count
  // until the next biweekly paycheck (recomputed each render, never stale).
  const { days: daysToPaycheck, iso: nextPaycheckISO } = nextPaycheckInfo();
  // Exclude the paycheck day itself — anything due that day belongs to the
  // next period, not this one, so the window stops the day before.
  const windowDays = windowMode === 'paycheck' ? Math.max(0, daysToPaycheck - 1) : customWindowDays;

  // Toggle a collapsible group and persist all three states together.
  const toggleSection = (key, setter) => setter((v) => {
    const next = !v;
    if (synced) setPref(SECTIONS_PREF, { money: moneyOpen, needs: needsOpen, payday: paydayOpen, [key]: next });
    return next;
  });

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
  // On Deck items already flagged "Pending Withdrawal" — triggered and about to
  // clear, so this is the more urgent subset of On Deck to have cash ready for.
  const pendingWithdrawalTotal = onDeck.filter((it) => it.pending_withdrawal).reduce((s, it) => s + (it.amount ?? 0), 0);
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

  // Earnin payback owed used to be a manual Plan Inputs figure you'd copy over
  // from the Earnin tab by hand. It's exactly the Earnin log's running balance
  // (advances add, repayments subtract), so it's computed live from there now.
  const earninOwed = earninTxns.reduce(
    (s, t) => s + (t.kind === 'advance' ? (t.amount ?? 0) : -(t.amount ?? 0)), 0,
  );
  const liveInputs = { ...inputs, earninOwed };

  const fuelWeekly = fuelWeeklyDynamic(inputs.fuelWeeklyBase);
  const grocWeekly = grocWeeklyDynamic(inputs.grocWeeklyBase);

  const balanceFor = (name) => {
    const a = accounts.find((x) => (x.name || '').trim().toLowerCase() === name.trim().toLowerCase());
    return a ? (a.balance ?? 0) : 0;
  };

  const billPayBalance = balanceFor('Bill Pay Checking');
  const billPayId = accounts.find((a) => (a.name || '').trim().toLowerCase() === 'bill pay checking')?.id;

  // "Banked" accounts get swept into this week's pool AND planned from $0 (the
  // plan reasons about their needs as if the account started empty) — one
  // consistent rule: money you zero out of an account lands back in the pool,
  // so nothing vanishes. Un-banked accounts keep their balance and net normally
  // against their needs. In "Already in Bill Pay" mode the paycheck has already
  // landed inside Bill Pay's balance, so Bill Pay is auto-banked (its balance,
  // paycheck included, is the pool). `balanceFor` (real) still backs Current
  // Balances and anything that should show what's actually in the bank.
  const bankedSet = new Set(bankedIds.filter((id) => accounts.some((a) => a.id === id)));
  if (!includePaycheck && billPayId) bankedSet.add(billPayId);
  const isBanked = (name) => {
    const a = accounts.find((x) => (x.name || '').trim().toLowerCase() === name.trim().toLowerCase());
    return a ? bankedSet.has(a.id) : false;
  };
  const bankedTotal = accounts.filter((a) => bankedSet.has(a.id)).reduce((s, a) => s + (a.balance ?? 0), 0);
  const effectiveBalFor = (name) => (isBanked(name) ? 0 : balanceFor(name));

  const ctx = {
    bal: effectiveBalFor, inputs: liveInputs, bills7, debts7, onDeckBillSum, onDeckDebtSum, subsFloor, fuelWeekly, grocWeekly,
    totalFixedBills,
  };
  // Pool = incoming paycheck (only if it hasn't landed yet) + side-gig + every
  // banked balance. In "Already in Bill Pay" the paycheck isn't added again —
  // it's inside Bill Pay's (auto-banked) balance.
  const pool = (includePaycheck ? paycheck : 0) + sideGig + bankedTotal;
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
    setPending((prev) => prev.filter((p) => p.account_id !== id));   // cascade mirrors the DB FK
    await deleteRow('fin_accounts', id);
  };

  // ── Pending transfers (money in flight) ──────────────────────────────────────
  const updatePending = async (id, field, value) => {
    setPending((prev) => prev.map((p) => p.id === id ? { ...p, [field]: value } : p));
    await upsertPendingTransfer({ id, [field]: value });
  };
  const addPending = async () => {
    const firstAcct = accounts[0];
    if (!firstAcct) return;
    const { data } = await upsertPendingTransfer({
      account_id: firstAcct.id, direction: 'in', amount: 0, expected_date: todayISO(), label: '',
    });
    if (data?.[0]) { setPending((prev) => [...prev, data[0]]); setPendingModalOpen(true); }
  };
  const removePending = async (id) => {
    setPending((prev) => prev.filter((p) => p.id !== id));
    await deleteRow('fin_pending_transfers', id);
  };

  // Net pending for an account = sum of incoming minus outgoing. Purely
  // informational — the allocation pour still uses real current balances.
  const netPendingFor = (accountId) => pending
    .filter((p) => p.account_id === accountId)
    .reduce((s, p) => s + (p.direction === 'out' ? -1 : 1) * (p.amount ?? 0), 0);
  const totalNetPending = pending.reduce((s, p) => s + (p.direction === 'out' ? -1 : 1) * (p.amount ?? 0), 0);
  const accountName = (id) => accounts.find((a) => a.id === id)?.name || '—';

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
      // 0b/0c net against the Bill Pay Checking balance you're keeping, so a
      // $0 Need can just mean "the balance already covers it" — spell that out
      // on hover so it doesn't read as a bug. Earnin is netted first, then the
      // leftover balance covers on-deck bills.
      const billPayNow = effectiveBalFor('Bill Pay Checking');
      const liveTitle = step.auto === 'earninRepay'
        ? `Earnin owed ${fmtDec(earninOwed)} (live from Earnin tab) − Bill Pay Checking ${fmtDec(billPayNow)}`
        : step.auto === 'onDeckBills'
        ? `On-deck bills ${fmtDec(onDeckBillSum)} − Bill Pay left after Earnin ${fmtDec(Math.max(0, billPayNow - earninOwed))}`
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
        Needs compute from your accounts, 7-day bill/debt totals &amp; the Plan Inputs panel (in the settings menu) —
        double-check the inputs match your real targets before you move money.
      </WipNotice>

      {/* ── Money this week — income + balances, collapsible ── */}
      <GroupHeader
        icon={Wallet} iconColor="#34d399" title="Money this week"
        open={moneyOpen} onToggle={() => toggleSection('money', setMoneyOpen)}
        summary={
          <span className="hidden sm:flex items-center gap-3 text-[11px]">
            <span className="text-zinc-500">Avail <Redacted on={privacy}><span className="tabular-nums text-emerald-400">{fmt(available)}</span></Redacted></span>
            <span className="text-zinc-500">Distribute <Redacted on={privacy}><span className="tabular-nums text-cyan-400">{fmt(pool)}</span></Redacted></span>
            <span className="text-zinc-500">Cash <Redacted on={privacy}><span className="tabular-nums text-zinc-300">{fmt(cashOnHand)}</span></Redacted></span>
          </span>
        }
      />
      {moneyOpen && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          {/* Headline pair: what you have (left) vs. what pours through the plan (right) */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-zinc-500 mb-2">
                <Wallet size={15} className="text-emerald-400" /><span className="text-xs">Available this week</span>
              </div>
              <Redacted on={privacy}>
                <p className="text-3xl font-bold text-emerald-400 tabular-nums">{fmt(available)}</p>
              </Redacted>
            </div>
            <div className="min-w-0 text-right">
              <div className="flex items-center justify-end gap-2 text-zinc-500 mb-2">
                <span className="text-xs">To distribute</span><ArrowDownToLine size={15} className="text-cyan-400" />
              </div>
              <Redacted on={privacy}><p className="text-3xl font-bold text-cyan-400 tabular-nums">{fmt(pool)}</p></Redacted>
              <div className="mt-1.5 flex items-center justify-end gap-3 text-[11px]">
                <span className="text-zinc-500">Allocated <Redacted on={privacy}><span className="tabular-nums text-emerald-400">{fmtDec(totalAllocated)}</span></Redacted></span>
                <span className="text-zinc-500">Left <Redacted on={privacy}><span className={`tabular-nums ${leftover > 0.005 ? 'text-amber-400' : 'text-zinc-500'}`}>{fmtDec(leftover)}</span></Redacted></span>
              </div>
              {bankedTotal > 0.005 && (
                <p className="mt-1 text-[10px] text-zinc-500">
                  {includePaycheck && paycheck > 0 && <>paycheck + </>}
                  <span className="text-cyan-400">banked <Redacted on={privacy}><span className="tabular-nums">{fmt(bankedTotal)}</span></Redacted></span>
                  {sideGig > 0 && <> + side-gig</>}
                </p>
              )}
            </div>
          </div>
          <div className="mt-4 space-y-2.5 text-sm border-t border-zinc-800 pt-4">
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
              &ldquo;Planning ahead&rdquo; — the upcoming paycheck (+ side-gig) is the pool. <span className="text-cyan-400">Bank</span> any
              account below to sweep its balance in too and plan that account from $0, so you can see the full flow of everything at once.
            </p>
          ) : (
            <p className="mt-3 text-[11px] text-amber-500/80">
              &ldquo;Already in Bill Pay&rdquo; — the paycheck already landed in Bill Pay Checking, so it&rsquo;s not added again;
              Bill Pay is auto-banked (its balance <Redacted on={privacy}><span className="tabular-nums">{fmtDec(billPayBalance)}</span></Redacted> is the pool).
              Bank other accounts below to pool them too.
            </p>
          )}
        </div>

        {/* Current balances — moved into the freed column, expanded by default.
            Add-account lives behind a gear; "Transfers" opens the pending modal. */}
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
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setPendingModalOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-cyan-700/60 bg-cyan-900/20 text-xs font-medium text-cyan-400 hover:bg-cyan-900/40 transition-colors"
                title="Pending transfers — money in flight"
              >
                <ArrowLeftRight size={14} /> Transfers
                {pending.length > 0 && <span className="text-cyan-500/80">· {pending.length}</span>}
              </button>
              <div className="relative">
                <button
                  onClick={() => setAcctMenuOpen((o) => !o)}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                  title="Account options"
                >
                  <Settings size={15} />
                </button>
                {acctMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setAcctMenuOpen(false)} />
                    <div className="absolute right-0 mt-1 z-20 w-40 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl py-1">
                      <button
                        onClick={() => { addAccount(); setAcctMenuOpen(false); setBalancesOpen(true); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
                      >
                        <Plus size={14} className="text-emerald-400" /> Add account
                      </button>
                    </div>
                  </>
                )}
              </div>
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
                  <th className="px-3 py-2 font-medium text-center" title="Sweep this balance into “To distribute” and plan the account from $0">Bank</th>
                  <th className="px-4 py-2 font-medium text-right">Updated</th>
                  <th className="w-10 px-2 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-600">Loading…</td></tr>
                ) : accounts.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-600 text-xs">No accounts yet — add the ones you want to track.</td></tr>
                ) : accounts.map((a) => {
                  const net = netPendingFor(a.id);
                  const since = daysSince(a.updated_at);
                  const c = updatedColor(a.updated_at);
                  const banked = bankedSet.has(a.id);
                  const autoBanked = !includePaycheck && a.id === billPayId;
                  return (
                  <tr key={a.id} className={`border-b border-zinc-800/60 last:border-0 group ${banked ? 'bg-cyan-950/20' : 'hover:bg-zinc-800/30'}`}>
                    <td className="px-4 py-2">
                      <EditCell value={a.name} onSave={(v) => updateAccount(a.id, 'name', v)} className="text-zinc-200 font-medium" />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Redacted on={privacy}>
                        <AmountEdit value={a.balance} onCommit={(v) => updateAccount(a.id, 'balance', v)} className="text-zinc-200" />
                      </Redacted>
                      {banked && (a.balance ?? 0) > 0.005 && (
                        <span className="block text-[11px] text-cyan-400/80 mt-0.5">→ in pool</span>
                      )}
                      {Math.abs(net) > 0.005 && (
                        <span className="block text-[11px] text-zinc-500 mt-0.5">
                          <Redacted on={privacy}><span className={`tabular-nums ${net > 0 ? 'text-emerald-400/80' : 'text-amber-400/80'}`}>{net > 0 ? '+' : ''}{fmtDec(net)}</span></Redacted>
                          {' pending → '}
                          <Redacted on={privacy}><span className="tabular-nums text-zinc-300">{fmtDec((a.balance ?? 0) + net)}</span></Redacted>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={banked}
                        disabled={autoBanked}
                        onChange={() => toggleBanked(a.id)}
                        title={autoBanked
                          ? 'Auto-banked — in “Already in Bill Pay” mode the paycheck already sits here'
                          : banked ? 'Banked — swept into the pool, planned from $0' : 'Bank this balance into the pool'}
                        className="h-4 w-4 accent-cyan-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="inline-flex items-center justify-end gap-1.5 text-[11px] text-zinc-500">
                        {a.updated_at && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: c?.color }} title="freshness" />}
                        {since == null ? '—' : since === 0 ? 'today' : `${since}d ago`}
                      </span>
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
                  );
                })}
              </tbody>
              {!loading && accounts.length > 0 && (
                <tfoot>
                  <tr className="border-t border-zinc-800 font-semibold text-zinc-200">
                    <td className="px-4 py-2.5">Total cash on hand</td>
                    <td className="px-4 py-2.5 text-right"><Redacted on={privacy}><span className="tabular-nums text-emerald-400">{fmtDec(cashOnHand)}</span></Redacted></td>
                    <td colSpan={3} />
                  </tr>
                  {Math.abs(totalNetPending) > 0.005 && (
                    <tr className="text-zinc-400">
                      <td className="px-4 pb-2.5 text-xs">Projected once pending clears</td>
                      <td className="px-4 pb-2.5 text-right"><Redacted on={privacy}><span className="tabular-nums text-zinc-300">{fmtDec(cashOnHand + totalNetPending)}</span></Redacted></td>
                      <td colSpan={3} />
                    </tr>
                  )}
                </tfoot>
              )}
            </table>
          </div>
          )}
        </section>
      </div>
      )}

      {/* ── Short Term Needs — cards + window selector + detail tables, all
          collapse together under the header ── */}
      <GroupHeader
        icon={CalendarClock} iconColor="#fbbf24" title="Short Term Needs"
        open={needsOpen} onToggle={() => toggleSection('needs', setNeedsOpen)}
        summary={
          <span className="hidden sm:flex items-center gap-3 text-[11px]">
            <span className="text-zinc-500">Coming <Redacted on={privacy}><span className="tabular-nums text-amber-400">{fmt(totals.total)}</span></Redacted></span>
            <span className="text-zinc-500">On Deck <Redacted on={privacy}><span className="tabular-nums text-emerald-400">{fmt(onDeckTotal)}</span></Redacted></span>
            <span className="text-zinc-500">After <Redacted on={privacy}><span className={`tabular-nums ${cashOnHand - totals.total < -0.005 ? 'text-red-400' : 'text-emerald-400'}`}>{fmt(cashOnHand - totals.total)}</span></Redacted></span>
          </span>
        }
      />
      {needsOpen && (
      <>
      <div className="flex justify-end">
        <div className="inline-flex rounded-lg border border-zinc-700 bg-zinc-800 p-0.5">
          <button
            onClick={setWindowToPaycheck}
            title={`Next paycheck: ${fmtDate(nextPaycheckISO)}`}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              windowMode === 'paycheck' ? 'bg-amber-900/40 text-amber-300' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Until Paycheck
          </button>
          {WINDOWS.map((n) => (
            <button
              key={n}
              onClick={() => setWindow(n)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                windowMode === 'days' && customWindowDays === n ? 'bg-amber-900/40 text-amber-300' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {n} days
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Available now — cash on hand, with projected once pending clears */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500 mb-1">Available now</p>
          <Redacted on={privacy}><span className="text-xl font-bold tabular-nums text-emerald-400">{fmt(cashOnHand)}</span></Redacted>
          {Math.abs(totalNetPending) > 0.005 && (
            <p className="mt-1.5 text-[11px] text-zinc-500">
              → <Redacted on={privacy}><span className="tabular-nums text-zinc-300">{fmt(cashOnHand + totalNetPending)}</span></Redacted> with pending
            </p>
          )}
        </div>

        {/* Coming up — window total, with the bill/debt split as sub-lines */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500 mb-1">Coming up — next {windowDays}d</p>
          <Redacted on={privacy}><span className="text-xl font-bold tabular-nums text-amber-400">{fmt(totals.total)}</span></Redacted>
          <div className="mt-2 space-y-0.5">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ background: '#3b82f6' }} /><span className="text-zinc-400">Bills</span></span>
              <Redacted on={privacy}><span className="tabular-nums text-zinc-400">{fmt(totals.bills)}</span></Redacted>
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ background: '#8b5cf6' }} /><span className="text-zinc-400">Debts</span></span>
              <Redacted on={privacy}><span className="tabular-nums text-zinc-400">{fmt(totals.debt)}</span></Redacted>
            </div>
          </div>
        </div>

        {/* On Deck */}
        <OnDeckCard total={onDeckTotal} byType={onDeckByType} count={onDeck.length} privacy={privacy} />

        {/* Coverage — does cash on hand cover what's staged / coming up? */}
        <CoverageCard cash={cashOnHand} deck={onDeckTotal} pendingWithdrawal={pendingWithdrawalTotal} coming={totals.total} windowDays={windowDays} privacy={privacy} />
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

      {/* Coming Up — live from Bills, Debts, Subscriptions & ad-hoc */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
          <CalendarClock size={15} className="text-amber-400" />
          <h3 className="text-sm font-semibold">Coming Up — next {windowDays} days</h3>
          <span className="text-xs text-zinc-500">— live from Bills, Debts, Subscriptions &amp; ad-hoc</span>
        </div>
        <div className="overflow-x-auto">
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
      </section>

      {/* Ad Hoc / Manual entry — one-offs; folded into the Needs group */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-zinc-800">
          <span className="flex items-center gap-2 min-w-0">
            <Plus size={15} className="text-zinc-400 shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Ad Hoc / Manual Entry</span>
              <span className="block text-xs text-zinc-500 mt-0.5">One-offs not on the Bills or Debts tabs.</span>
            </span>
          </span>
          <button onClick={addManual} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-600 bg-emerald-900/30 text-xs font-medium text-emerald-400 hover:bg-emerald-900/50 transition-colors shrink-0">
            <Plus size={14} /> Add item
          </button>
        </div>
        <div className="overflow-x-auto">
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
      </section>
      </>
      )}

      {/* ── Payday Distribution — this week's plan + per-account rollup ── */}
      <GroupHeader
        icon={ArrowDownToLine} iconColor="#22d3ee" title="Payday Distribution"
        open={paydayOpen} onToggle={() => toggleSection('payday', setPaydayOpen)}
        summary={
          <span className="hidden sm:flex items-center gap-3 text-[11px]">
            <span className="text-zinc-500">Distribute <Redacted on={privacy}><span className="tabular-nums text-cyan-400">{fmt(pool)}</span></Redacted></span>
            <span className="text-zinc-500">Allocated <Redacted on={privacy}><span className="tabular-nums text-emerald-400">{fmtDec(totalAllocated)}</span></Redacted></span>
            {leftover > 0.005 && <span className="text-zinc-500">Left <Redacted on={privacy}><span className="tabular-nums text-amber-400">{fmtDec(leftover)}</span></Redacted></span>}
          </span>
        }
      />
      {paydayOpen && (
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4 items-start">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-zinc-800">
            <div>
              <h3 className="text-sm font-semibold">This week&rsquo;s plan</h3>
              <p className="text-xs text-zinc-500 mt-0.5"><span className="text-amber-400">Live</span> needs are computed — edit Plan Inputs (settings menu), not the table.</p>
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
      )}

      {/* Balance freshness check — blocking modal on landing, until addressed
          (Not now / Looks good / Update now). No backdrop-click dismiss on
          purpose: it needs an explicit choice, not an accidental tap-away. */}
      {showBalanceCheck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-amber-700/40 bg-zinc-900 shadow-2xl p-5" role="alertdialog" aria-modal="true">
            <div className="flex items-start gap-2 mb-3">
              <BadgeCheck size={18} className="text-amber-400 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-amber-200">Still accurate?</h3>
                <p className="text-xs text-amber-300/70 mt-0.5">Last recorded balances — confirm they&rsquo;re right, or jump in and update them.</p>
              </div>
              {/* The menu's privacy toggle sits behind this modal — give it its
                  own eye button here so the figures aren't permanently blurred
                  with no way to check them before answering. */}
              <button
                onClick={onTogglePrivacy}
                title={privacy ? 'Show figures' : 'Hide figures'}
                className="shrink-0 text-zinc-500 hover:text-zinc-200 transition-colors p-1.5 -m-1.5"
              >
                {privacy ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            </div>
            <div className="space-y-1.5 mb-4 max-h-[50vh] overflow-y-auto">
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
            <div className="flex flex-wrap justify-end gap-2">
              <button onClick={dismissBalanceCheck} className="rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors">
                Not now
              </button>
              <button onClick={confirmBalancesFresh} className="rounded-lg border border-emerald-600 bg-emerald-900/30 px-3.5 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-900/50 transition-colors">
                Looks good
              </button>
              <button onClick={jumpToBalances} className="rounded-lg border border-amber-600 bg-amber-900/30 px-3.5 py-2 text-sm font-medium text-amber-300 hover:bg-amber-900/50 transition-colors">
                Update now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plan Inputs modal — the only place non-flat needs get edited (never the
          table). Opened from the ⋯ menu's "Plan Inputs…" item (Waterfall only). */}
      {planInputsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8" onClick={() => setPlanInputsModalOpen(false)}>
          <div className="w-full max-w-3xl rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl my-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-zinc-800">
              <span className="flex items-center gap-2 min-w-0">
                <SlidersHorizontal size={16} className="text-emerald-400 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">Plan Inputs</span>
                  <span className="block text-xs text-zinc-500 mt-0.5">Feeds every &ldquo;live&rdquo; Need in the plan.</span>
                </span>
              </span>
              <button onClick={() => setPlanInputsModalOpen(false)} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors" title="Close">
                <X size={16} />
              </button>
            </div>
            <div className="px-4 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
                    <span className="text-xs text-zinc-400" title="Sum of monthly-equivalent amounts for Bills tab rows categorized 'Bill' — feeds Floor Build.">
                      Total fixed bills (monthly)
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      <Redacted on={privacy}><span className="tabular-nums text-zinc-300 text-sm">{fmtDec(totalFixedBills)}</span></Redacted>
                      <span className="rounded bg-amber-900/30 px-1 text-[9px] uppercase tracking-wide text-amber-400">live</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
                    <span className="text-xs text-zinc-400" title="Running balance from the Earnin tab (advances add, repayments subtract) — feeds Step 0b and Step 2.">
                      Earnin — payback owed
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      <Redacted on={privacy}><span className="tabular-nums text-zinc-300 text-sm">{fmtDec(earninOwed)}</span></Redacted>
                      <span className="rounded bg-amber-900/30 px-1 text-[9px] uppercase tracking-wide text-amber-400">live</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-zinc-600">
        Every <span className="text-amber-400">live</span> Need is a formula against your accounts, 7-day bill/debt
        totals, on-deck amounts &amp; the Plan Inputs panel (in the settings menu) — matching the workbook. The surplus %s (5a/5b/5c)
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

      {/* Pending transfers modal — opened from the Current Balances header.
          Informational only; the projected sub-lines live in that table. */}
      {pendingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8" onClick={() => setPendingModalOpen(false)}>
          <div className="w-full max-w-2xl rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl my-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-zinc-800">
              <span className="flex items-center gap-2 min-w-0">
                <ArrowLeftRight size={16} className="text-cyan-400 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">Pending Transfers</span>
                  <span className="block text-xs text-zinc-500 mt-0.5">Money in/out that hasn&rsquo;t landed yet — feeds the projected balances.</span>
                </span>
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={addPending}
                  disabled={accounts.length === 0}
                  title={accounts.length === 0 ? 'Add an account first' : undefined}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-700/60 bg-cyan-900/20 text-xs font-medium text-cyan-400 hover:bg-cyan-900/40 transition-colors disabled:opacity-40"
                >
                  <Plus size={14} /> Add transfer
                </button>
                <button onClick={() => setPendingModalOpen(false)} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors" title="Close">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                    <th className="px-3 py-2 font-medium">Account</th>
                    <th className="px-3 py-2 font-medium">Direction</th>
                    <th className="px-3 py-2 font-medium text-right">Amount</th>
                    <th className="px-3 py-2 font-medium">Expected</th>
                    <th className="px-3 py-2 font-medium">Note</th>
                    <th className="w-10 px-2 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {pending.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-zinc-600 text-xs">No pending transfers. Add one for money you know is coming in or going out but hasn&rsquo;t cleared.</td></tr>
                  ) : pending.map((p) => (
                    <tr key={p.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 group">
                      <Td>
                        <EditCell type="select" value={p.account_id} onSave={(v) => updatePending(p.id, 'account_id', v)}
                          options={accounts.map((a) => ({ value: a.id, label: a.name }))} display={() => accountName(p.account_id)} className="text-zinc-200 font-medium" />
                      </Td>
                      <Td>
                        <EditCell type="select" value={p.direction} onSave={(v) => updatePending(p.id, 'direction', v)}
                          options={[{ value: 'in', label: 'In' }, { value: 'out', label: 'Out' }]}
                          display={(v) => (v === 'out' ? '↑ Out' : '↓ In')}
                          className={p.direction === 'out' ? 'text-amber-400' : 'text-emerald-400'} />
                      </Td>
                      <Td className="text-right">
                        <Redacted on={privacy}><EditCell type="number" value={p.amount} onSave={(v) => updatePending(p.id, 'amount', v)} display={fmtDec} className="text-zinc-200 tabular-nums" /></Redacted>
                      </Td>
                      <Td><EditCell type="date" value={p.expected_date} onSave={(v) => updatePending(p.id, 'expected_date', v)} display={fmtDate} className="text-zinc-300 tabular-nums" /></Td>
                      <Td><EditCell value={p.label} onSave={(v) => updatePending(p.id, 'label', v)} className="text-zinc-500" /></Td>
                      <Td className="text-right">
                        <button onClick={() => setConfirmRemovePending(p)} className="text-zinc-600 hover:text-red-400 transition-colors p-3 -m-3"><Trash2 size={13} /></button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
                {pending.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-zinc-800 text-zinc-400">
                      <Td className="font-medium text-zinc-300" colSpan={2}>Net pending</Td>
                      <Td className="text-right font-semibold">
                        <Redacted on={privacy}><span className={`tabular-nums ${totalNetPending >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>{totalNetPending > 0 ? '+' : ''}{fmtDec(totalNetPending)}</span></Redacted>
                      </Td>
                      <Td colSpan={3} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmRemovePending}
        title="Remove this pending transfer?"
        message={confirmRemovePending
          ? `${confirmRemovePending.direction === 'out' ? 'Outgoing' : 'Incoming'} ${fmtDec(confirmRemovePending.amount)} on ${accountName(confirmRemovePending.account_id)} will stop showing in the projected balance. This can’t be undone.`
          : ''}
        confirmLabel="Remove"
        onCancel={() => setConfirmRemovePending(null)}
        onConfirm={() => { removePending(confirmRemovePending.id); setConfirmRemovePending(null); }}
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

// Coverage — does cash on hand cover what's staged (On Deck) and everything
// due in the window (Coming up)? Headline is the window shortfall/surplus; the
// sub-line answers the On Deck question. Green = surplus, red = short.
function CoverageCard({ cash, deck, pendingWithdrawal, coming, windowDays, privacy }) {
  const vsComing = cash - coming;
  const vsDeck = cash - deck;
  const vsPendingWithdrawal = cash - pendingWithdrawal;
  const short = vsComing < -0.005;
  return (
    <div className={`rounded-xl border p-4 ${short ? 'border-red-800/50 bg-red-950/20' : 'border-zinc-800 bg-zinc-900'}`}>
      <p className="text-xs text-zinc-500 mb-1">Cash after next {windowDays}d</p>
      <span className="flex items-baseline gap-1.5">
        <Redacted on={privacy}><span className={`text-xl font-bold tabular-nums ${short ? 'text-red-400' : 'text-emerald-400'}`}>{vsComing >= 0 ? '+' : ''}{fmt(vsComing)}</span></Redacted>
        <span className={`text-[10px] uppercase tracking-wide ${short ? 'text-red-400' : 'text-emerald-400'}`}>{short ? 'short' : 'surplus'}</span>
      </span>
      <div className="mt-2 text-[11px] flex items-center justify-between gap-2">
        <span className="text-zinc-400">Covers On Deck?</span>
        <Redacted on={privacy}>
          <span className={`tabular-nums font-medium ${vsDeck < -0.005 ? 'text-red-400' : 'text-emerald-400'}`}>
            {vsDeck < -0.005 ? `short ${fmt(vsDeck)}` : 'yes'}
          </span>
        </Redacted>
      </div>
      {pendingWithdrawal > 0.005 && (
        <div className="mt-1 text-[11px] flex items-center justify-between gap-2">
          <span className="text-zinc-400">Covers Pending?</span>
          <Redacted on={privacy}>
            <span className={`tabular-nums font-medium ${vsPendingWithdrawal < -0.005 ? 'text-red-400' : 'text-emerald-400'}`}>
              {vsPendingWithdrawal < -0.005 ? `short ${fmt(vsPendingWithdrawal)}` : 'yes'}
            </span>
          </Redacted>
        </div>
      )}
    </div>
  );
}

// Collapsible group header — a clickable card that shows the section title, an
// optional at-a-glance summary when collapsed, and a chevron. Used to fold the
// page into a few progressive-disclosure sections.
function GroupHeader({ icon: Icon, iconColor, title, open, onToggle, summary = null }) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-left hover:bg-zinc-800/40 transition-colors"
    >
      <span className="flex items-center gap-2 min-w-0">
        <Icon size={16} className="shrink-0" style={{ color: iconColor }} />
        <span className="text-sm font-semibold">{title}</span>
      </span>
      <span className="flex items-center gap-3 shrink-0">
        {!open && summary}
        {open ? <ChevronDown size={16} className="text-zinc-500" /> : <ChevronRight size={16} className="text-zinc-500" />}
      </span>
    </button>
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
