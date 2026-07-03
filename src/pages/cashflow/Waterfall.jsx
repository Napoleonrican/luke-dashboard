import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Wallet, Plus, Trash2, Banknote, PiggyBank } from 'lucide-react';
import { Redacted } from './CashflowLayout';
import { fetchAccounts, upsertAccount, deleteRow, getPref, setPref } from '../../lib/fin';
import { fmt, fmtDec } from './format';
import { AmountEdit } from './ModalField';
import EditCell from './EditCell';
import WipNotice from './WipNotice';

const PAYCHECK_PREF = 'waterfall_paycheck';
const INCLUDE_PREF = 'waterfall_include_paycheck';
const SIDEGIG_PREF = 'waterfall_sidegig';

// The Cash Waterfall — starts with the two things it needs before any allocation
// logic: your live account balances and this week's income (paycheck, with a
// toggle for off-weeks, plus side-gig earnings). "Available this week" rolls
// those together; the account-routing engine builds on this next.
export default function Waterfall() {
  const { privacy } = useOutletContext();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paycheck, setPaycheck] = useState(0);
  const [includePaycheck, setIncludePaycheck] = useState(true);
  const [sideGig, setSideGig] = useState(0);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    let active = true;
    fetchAccounts().then(({ data }) => { if (active) { setAccounts(data || []); setLoading(false); } });
    Promise.all([getPref(PAYCHECK_PREF), getPref(INCLUDE_PREF), getPref(SIDEGIG_PREF)]).then(
      ([pc, inc, sg]) => {
        if (!active) return;
        if (typeof pc.data === 'number') setPaycheck(pc.data);
        if (typeof inc.data === 'boolean') setIncludePaycheck(inc.data);
        if (typeof sg.data === 'number') setSideGig(sg.data);
        setSynced(true);
      },
    );
    return () => { active = false; };
  }, []);

  const savePaycheck = (v) => { setPaycheck(v); if (synced) setPref(PAYCHECK_PREF, v); };
  const saveSideGig = (v) => { setSideGig(v); if (synced) setPref(SIDEGIG_PREF, v); };
  const toggleInclude = () => setIncludePaycheck((p) => { const n = !p; if (synced) setPref(INCLUDE_PREF, n); return n; });

  const cashOnHand = accounts.reduce((s, a) => s + (a.balance ?? 0), 0);
  const available = (includePaycheck ? paycheck : 0) + sideGig + cashOnHand;

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

  return (
    <div className="space-y-6">
      <WipNotice>
        Work in progress — your balances and income are live, but the allocation
        engine that routes &ldquo;Available&rdquo; into each account isn&rsquo;t built yet.
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

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 flex flex-col justify-center">
          <p className="text-xs text-zinc-500 mb-2">How &ldquo;Available&rdquo; is built</p>
          <div className="space-y-1.5 text-sm text-zinc-400">
            <Row k={includePaycheck ? 'Paycheck' : 'Paycheck (off)'} v={includePaycheck ? paycheck : 0} privacy={privacy} muted={!includePaycheck} />
            <Row k="Side-gig earnings" v={sideGig} privacy={privacy} />
            <Row k="Cash on hand" v={cashOnHand} privacy={privacy} />
            <div className="flex justify-between border-t border-zinc-800 pt-1.5 font-semibold text-zinc-200">
              <span>Available</span>
              <Redacted on={privacy}><span className="tabular-nums text-emerald-400">{fmtDec(available)}</span></Redacted>
            </div>
          </div>
        </div>
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
        Next up: the allocation engine that routes &ldquo;Available&rdquo; into each account using the 14-day
        bill &amp; debt totals from the Runway tab.
      </p>
    </div>
  );
}

function Row({ k, v, privacy, muted }) {
  return (
    <div className={`flex justify-between ${muted ? 'text-zinc-600' : ''}`}>
      <span>{k}</span>
      <Redacted on={privacy}><span className="tabular-nums">{fmtDec(v)}</span></Redacted>
    </div>
  );
}
