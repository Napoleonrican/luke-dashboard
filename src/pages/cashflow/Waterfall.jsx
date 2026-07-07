import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Wallet, Plus, Trash2, Banknote, PiggyBank, ArrowDownToLine } from 'lucide-react';
import { Redacted } from './CashflowLayout';
import {
  fetchAccounts, upsertAccount, deleteRow, getPref, setPref,
  fetchBills, fetchDebts, fetchDigitalSubs, fetchRunwayManual,
} from '../../lib/fin';
import { fmt, fmtDec } from './format';
import { AmountEdit } from './ModalField';
import EditCell from './EditCell';
import { normalizeSources, withinWindow, isDebtType } from './runway';
import WipNotice from './WipNotice';
import {
  applyOverrides, allocate, byAccount, TIER_META, TIER_ORDER,
} from './waterfallCalc';

const PAYCHECK_PREF = 'waterfall_paycheck';
const INCLUDE_PREF = 'waterfall_include_paycheck';
const SIDEGIG_PREF = 'waterfall_sidegig';
const ALLOC_PREF = 'waterfall_alloc';   // { over, fuelWeekly, grocWeekly }

// The Cash Waterfall — this week's income poured through prioritized steps into
// each account. You set income + balances up top; the plan below shows exactly
// how much to move where, mirroring the workbook's Waterfall sheet.
export default function Waterfall() {
  const { privacy } = useOutletContext();
  const [accounts, setAccounts] = useState([]);
  const [bills, setBills] = useState([]);
  const [debts, setDebts] = useState([]);
  const [digital, setDigital] = useState([]);
  const [manual, setManual] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paycheck, setPaycheck] = useState(0);
  const [includePaycheck, setIncludePaycheck] = useState(true);
  const [sideGig, setSideGig] = useState(0);
  const [over, setOver] = useState({});
  const [fuelWeekly, setFuelWeekly] = useState(40);
  const [grocWeekly, setGrocWeekly] = useState(17);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([fetchAccounts(), fetchBills(), fetchDebts(), fetchDigitalSubs(), fetchRunwayManual()]).then(
      ([acc, b, d, dig, man]) => {
        if (!active) return;
        setAccounts(acc.data || []); setBills(b.data || []); setDebts(d.data || []);
        setDigital(dig.data || []); setManual(man.data || []);
        setLoading(false);
      },
    );
    Promise.all([getPref(PAYCHECK_PREF), getPref(INCLUDE_PREF), getPref(SIDEGIG_PREF), getPref(ALLOC_PREF)]).then(
      ([pc, inc, sg, al]) => {
        if (!active) return;
        if (typeof pc.data === 'number') setPaycheck(pc.data);
        if (typeof inc.data === 'boolean') setIncludePaycheck(inc.data);
        if (typeof sg.data === 'number') setSideGig(sg.data);
        if (al.data && typeof al.data === 'object') {
          if (al.data.over) setOver(al.data.over);
          if (typeof al.data.fuelWeekly === 'number') setFuelWeekly(al.data.fuelWeekly);
          if (typeof al.data.grocWeekly === 'number') setGrocWeekly(al.data.grocWeekly);
        }
        setSynced(true);
      },
    );
    return () => { active = false; };
  }, []);

  const savePaycheck = (v) => { setPaycheck(v); if (synced) setPref(PAYCHECK_PREF, v); };
  const saveSideGig = (v) => { setSideGig(v); if (synced) setPref(SIDEGIG_PREF, v); };
  const toggleInclude = () => setIncludePaycheck((p) => { const n = !p; if (synced) setPref(INCLUDE_PREF, n); return n; });

  const persistAlloc = (next) => { if (synced) setPref(ALLOC_PREF, next); };
  const setNeed = (id, v) => {
    const nextOver = { ...over, [id]: { ...over[id], need: v } };
    setOver(nextOver); persistAlloc({ over: nextOver, fuelWeekly, grocWeekly });
  };
  const setPct = (id, v) => {
    const nextOver = { ...over, [id]: { ...over[id], pct: v } };
    setOver(nextOver); persistAlloc({ over: nextOver, fuelWeekly, grocWeekly });
  };
  const setFuel = (v) => { setFuelWeekly(v); persistAlloc({ over, fuelWeekly: v, grocWeekly }); };
  const setGroc = (v) => { setGrocWeekly(v); persistAlloc({ over, fuelWeekly, grocWeekly: v }); };

  const cashOnHand = accounts.reduce((s, a) => s + (a.balance ?? 0), 0);
  const available = (includePaycheck ? paycheck : 0) + sideGig + cashOnHand;

  // ── Allocation ───────────────────────────────────────────────────────────────
  const items = normalizeSources({ bills, debts, digital, manual });
  const in7 = withinWindow(items, 7);
  const bills7 = in7.filter((it) => !isDebtType(it.type)).reduce((s, it) => s + (it.amount || 0), 0);
  const debts7 = in7.filter((it) => isDebtType(it.type)).reduce((s, it) => s + (it.amount || 0), 0);
  const ctx = { fuelWeekly, grocWeekly, bills7, debts7 };
  const pool = (includePaycheck ? paycheck : 0) + sideGig;
  const steps = applyOverrides(over);
  const { rows, leftover } = allocate(steps, pool, ctx);
  const accountPlan = byAccount(rows);
  const totalAllocated = pool - leftover;

  const balanceFor = (name) => {
    const a = accounts.find((x) => (x.name || '').trim().toLowerCase() === name.trim().toLowerCase());
    return a ? (a.balance ?? 0) : null;
  };

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

  // Need cell renderer (kept inline so it can reach setNeed/setPct/privacy).
  const renderNeed = ({ step, need }) => {
    if (step.auto) {
      return (
        <span className="inline-flex items-center gap-1.5 justify-end">
          <Redacted on={privacy}><span className="tabular-nums text-zinc-300">{fmtDec(need)}</span></Redacted>
          <span className="rounded bg-amber-900/30 px-1 text-[9px] uppercase tracking-wide text-amber-400" title="Calculated live from your data">live</span>
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
    return <Redacted on={privacy}><AmountEdit value={step.need} onCommit={(v) => setNeed(step.id, v)} className="text-zinc-300" /></Redacted>;
  };

  return (
    <div className="space-y-6">
      <WipNotice>
        First pass at the allocation engine — the plan pours live from your income,
        balances &amp; 7-day bill/debt totals, but the fixed needs are still being
        dialed in; sanity-check before you move real money.
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

      {/* Allocation: steps + per-account rollup */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-4 items-start">
        {/* Steps */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-zinc-800">
            <div>
              <h3 className="text-sm font-semibold">This week&rsquo;s plan</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Income pours top-down. Needs are editable; <span className="text-amber-400">live</span> ones come from your data.</p>
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
          {/* Essentials inputs (feed the "Weekly Essentials" live need) */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-zinc-800 px-4 py-3 text-xs text-zinc-500">
            <span className="uppercase tracking-wide text-[10px]">Weekly essentials</span>
            <label className="flex items-center gap-2">Fuel
              <span className="w-20"><Redacted on={privacy}><AmountEdit value={fuelWeekly} onCommit={setFuel} className="text-zinc-300" /></Redacted></span>
            </label>
            <label className="flex items-center gap-2">Groceries
              <span className="w-20"><Redacted on={privacy}><AmountEdit value={grocWeekly} onCommit={setGroc} className="text-zinc-300" /></Redacted></span>
            </label>
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
                    {bal != null && (
                      <p className="mt-0.5 text-[11px] text-zinc-500">
                        <Redacted on={privacy}><span className="tabular-nums">{fmtDec(bal)}</span></Redacted>
                        {' → '}
                        <Redacted on={privacy}><span className="tabular-nums text-zinc-300">{fmtDec(bal + g.total)}</span></Redacted>
                      </p>
                    )}
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
        First pass at the allocation engine. The <span className="text-amber-400">live</span> needs (essentials, 7-day
        bills &amp; debts) come straight from your data; the rest are editable and saved as you go. Tell me which fixed
        needs should also auto-derive and I&rsquo;ll wire them up.
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
