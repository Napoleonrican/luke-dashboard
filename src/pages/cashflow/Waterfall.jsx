import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Wallet, Plus, Trash2, Banknote, PiggyBank, ArrowDownToLine, SlidersHorizontal, ChevronDown, ChevronRight,
} from 'lucide-react';
import { Redacted } from './CashflowLayout';
import {
  fetchAccounts, upsertAccount, deleteRow, getPref, setPref,
  fetchBills, fetchDebts, fetchDigitalSubs, fetchConsumableSubs, fetchRunwayManual, fetchRunwayDeck,
} from '../../lib/fin';
import { fmt, fmtDec } from './format';
import { AmountEdit } from './ModalField';
import EditCell from './EditCell';
import { normalizeSources, withinWindow, isDebtType, itemKey, deckItems } from './runway';
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

const INPUT_FIELDS = [
  { group: 'What you currently owe', fields: [
    { key: 'earninOwed', label: 'Earnin — payback owed', hint: 'Not linked to the Earnin tab yet — copy the running balance over manually.' },
    { key: 'uberBackupOwed', label: 'Uber Pro — backup balance owed' },
  ] },
  { group: 'Targets (from your Inputs sheet)', fields: [
    { key: 'totalFixedBills', label: 'Total fixed bills (monthly)' },
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

// The Cash Waterfall — this week's income poured through prioritized steps into
// each account. You set income + balances up top; the plan below shows exactly
// how much to move where, mirroring the workbook's Waterfall sheet. Every Need
// is computed from live data — you edit the Plan Inputs panel or your account
// balances, never the table itself (the workbook's two literal exceptions —
// the surplus %s and the flat Credit Union need — stay editable in place).
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
  const [synced, setSynced] = useState(false);

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
    Promise.all([getPref(PAYCHECK_PREF), getPref(INCLUDE_PREF), getPref(SIDEGIG_PREF), getPref(OVER_PREF), getPref(INPUTS_PREF)]).then(
      ([pc, inc, sg, ov, inp]) => {
        if (!active) return;
        if (typeof pc.data === 'number') setPaycheck(pc.data);
        if (typeof inc.data === 'boolean') setIncludePaycheck(inc.data);
        if (typeof sg.data === 'number') setSideGig(sg.data);
        if (ov.data && typeof ov.data === 'object') setOver(ov.data);
        if (inp.data && typeof inp.data === 'object') setInputs({ ...DEFAULT_INPUTS, ...inp.data });
        setSynced(true);
      },
    );
    return () => { active = false; };
  }, []);

  const savePaycheck = (v) => { setPaycheck(v); if (synced) setPref(PAYCHECK_PREF, v); };
  const saveSideGig = (v) => { setSideGig(v); if (synced) setPref(SIDEGIG_PREF, v); };
  const toggleInclude = () => setIncludePaycheck((p) => { const n = !p; if (synced) setPref(INCLUDE_PREF, n); return n; });

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

  // ── Allocation context ───────────────────────────────────────────────────────
  const items = normalizeSources({ bills, debts, digital, manual });
  const deckSet = new Set(deck.map((r) => itemKey(r.source_kind, r.source_id)));
  const onDeck = deckItems(deck, items);
  const onDeckBillSum = onDeck.filter((it) => !isDebtType(it.type)).reduce((s, it) => s + (it.amount || 0), 0);
  const onDeckDebtSum = onDeck.filter((it) => isDebtType(it.type)).reduce((s, it) => s + (it.amount || 0), 0);

  // 7-day bill/debt totals EXCLUDING items already on deck — the workbook
  // counts an on-deck item once (via the sums above), not twice.
  const in7 = withinWindow(items, 7).filter((it) => !deckSet.has(it.key));
  const bills7 = in7.filter((it) => !isDebtType(it.type)).reduce((s, it) => s + (it.amount || 0), 0);
  const debts7 = in7.filter((it) => isDebtType(it.type)).reduce((s, it) => s + (it.amount || 0), 0);

  const subsFloor = (
    digital.filter((s) => s.active).reduce((t, s) => t + monthlyDigital(s), 0)
    + consumable.filter((s) => s.active).reduce((t, s) => t + monthlyConsumable(s), 0)
  ) / 2;

  const fuelWeekly = fuelWeeklyDynamic(inputs.fuelWeeklyBase);
  const grocWeekly = grocWeeklyDynamic(inputs.grocWeeklyBase);

  const balanceFor = (name) => {
    const a = accounts.find((x) => (x.name || '').trim().toLowerCase() === name.trim().toLowerCase());
    return a ? (a.balance ?? 0) : 0;
  };

  const ctx = {
    bal: balanceFor, inputs, bills7, debts7, onDeckBillSum, onDeckDebtSum, subsFloor, fuelWeekly, grocWeekly,
  };
  const pool = (includePaycheck ? paycheck : 0) + sideGig;
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

  // Need cell — read-only "live" figure for every computed step; the surplus
  // %s and Step 7's flat need are the only fields that stay editable here,
  // matching how the workbook itself hard-codes those two directly in-sheet.
  const renderNeed = ({ step, need }) => {
    if (step.auto) {
      return (
        <span className="inline-flex items-center gap-1.5 justify-end">
          <Redacted on={privacy}><span className="tabular-nums text-zinc-300">{fmtDec(need)}</span></Redacted>
          <span className="rounded bg-amber-900/30 px-1 text-[9px] uppercase tracking-wide text-amber-400" title="Computed from your accounts, Plan Inputs & 7-day totals">live</span>
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
        Needs now compute from your accounts, 7-day bill/debt totals &amp; the Plan Inputs panel below —
        double-check the inputs match your real targets before you move money.
      </WipNotice>

      {/* Available this week */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex items-center gap-2 text-zinc-500 mb-3">
            <Wallet size={15} className="text-emerald-400" /><span className="text-xs">Available this week</span>
          </div>
          <Redacted on={privacy}>
            <p className="text-3xl font-bold text-emerald-400 tabular-nums">{fmt(available)}</p>
          </Redacted>
          <div className="mt-4 space-y-2.5 text-sm">
            {/* Paycheck with include toggle */}
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-zinc-400 cursor-pointer select-none">
                <input type="checkbox" checked={includePaycheck} onChange={toggleInclude}
                  className="h-4 w-4 accent-emerald-500 cursor-pointer" />
                <span className={includePaycheck ? '' : 'line-through text-zinc-600'}>Paycheck</span>
              </label>
              <span className="w-24">
                <Redacted on={privacy}>
                  <AmountEdit value={paycheck} onCommit={savePaycheck} className="text-zinc-200" />
                </Redacted>
              </span>
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
          {!includePaycheck && (
            <p className="mt-3 text-[11px] text-amber-500/80">Paycheck excluded — modeling an off-week on side-gig earnings only.</p>
          )}
        </div>

        {/* To distribute — the pool the waterfall pours (new income this week) */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 flex flex-col justify-center">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <ArrowDownToLine size={15} className="text-cyan-400" /><span className="text-xs">To distribute this week</span>
          </div>
          <Redacted on={privacy}><p className="text-3xl font-bold text-cyan-400 tabular-nums">{fmt(pool)}</p></Redacted>
          <p className="mt-2 text-[11px] text-zinc-500">New income poured through the plan below (paycheck {includePaycheck ? '+' : 'off,'} side-gig). Cash on hand stays put.</p>
          <div className="mt-3 flex items-center gap-4 text-xs">
            <span className="text-zinc-500">Allocated <Redacted on={privacy}><span className="tabular-nums text-emerald-400">{fmtDec(totalAllocated)}</span></Redacted></span>
            <span className="text-zinc-500">Left <Redacted on={privacy}><span className={`tabular-nums ${leftover > 0.005 ? 'text-amber-400' : 'text-zinc-500'}`}>{fmtDec(leftover)}</span></Redacted></span>
          </div>
        </div>
      </div>

      {/* Plan Inputs — the only place non-flat needs get edited (never the table) */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <button
          onClick={() => setInputsOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-zinc-800/30 transition-colors"
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal size={15} className="text-emerald-400" />
            <span className="text-sm font-semibold">Plan Inputs</span>
            <span className="text-xs text-zinc-500">— feeds every &ldquo;live&rdquo; Need below</span>
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
          </div>
        )}
      </section>

      {/* Allocation: steps + per-account rollup */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-4 items-start">
        {/* Steps */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-zinc-800">
            <div>
              <h3 className="text-sm font-semibold">This week&rsquo;s plan</h3>
              <p className="text-xs text-zinc-500 mt-0.5"><span className="text-amber-400">Live</span> needs are computed — edit Plan Inputs above, not the table.</p>
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
                const bal = balanceFor(g.account);
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

      {/* Current balances (accounts) */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-zinc-800">
          <div>
            <h3 className="text-sm font-semibold">Current Balances</h3>
            <p className="text-xs text-zinc-500 mt-0.5">The accounts you track — edit balances inline.</p>
          </div>
          <button onClick={addAccount} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-600 bg-emerald-900/30 text-xs font-medium text-emerald-400 hover:bg-emerald-900/50 transition-colors">
            <Plus size={14} /> Add account
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-2 font-medium">Account</th>
                <th className="px-4 py-2 font-medium text-right">Balance</th>
                <th className="px-4 py-2 font-medium" />
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
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => removeAccount(a.id)} className="opacity-0 group-hover:opacity-40 hover:!opacity-100 text-red-400 transition-opacity"><Trash2 size={13} /></button>
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
      </section>

      <p className="text-xs text-zinc-600">
        Every <span className="text-amber-400">live</span> Need is a formula against your accounts, 7-day bill/debt
        totals, on-deck amounts &amp; the Plan Inputs panel above — matching the workbook. The surplus %s (5a/5b/5c)
        and Step 7&rsquo;s flat need stay directly editable, same as the original sheet.
      </p>
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
