import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, Trash2, ArrowDownCircle, ArrowUpCircle, Wallet } from 'lucide-react';
import { Redacted } from './CashflowLayout';
import { fetchEarninTransactions, upsertEarninTransaction, deleteRow } from '../../lib/fin';
import { fmt, fmtDec, fmtDate, todayISO } from './format';
import { AmountEdit } from './ModalField';
import EditCell from './EditCell';
import { Th, Td, StateRow, LoadErrorRow } from './tableparts';
import { notifyError } from './toast';
import WipNotice from './WipNotice';

const KINDS = ['advance', 'repay'];
const KIND_LABEL = { advance: 'Advance', repay: 'Repay' };
const KIND_COLOR = { advance: '#f59e0b', repay: '#10b981' };

// A standalone log of Earnin advances/repayments — not wired into the
// Waterfall's allocation engine yet (that still uses the single manual
// "payback owed" figure in Waterfall's Plan Inputs). This is the place to
// track usage down over time until a Monarch export can backfill history.
export default function Earnin() {
  const { privacy } = useOutletContext();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    fetchEarninTransactions().then(({ data, error }) => {
      if (!active) return;
      if (error) setError(error);
      else { setError(null); if (data) setRows(data); }
      setLoading(false);
    });
    return () => { active = false; };
  }, [reloadKey]);

  const reload = () => { setLoading(true); setError(null); setReloadKey((k) => k + 1); };

  // Rows come back newest-first (for display); running balance reads
  // oldest-first, so walk a reversed copy and map the result back.
  const withBalance = (() => {
    const chrono = [...rows].sort((a, b) => (a.txn_date + a.created_at).localeCompare(b.txn_date + b.created_at));
    let running = 0;
    const balanceById = new Map();
    for (const r of chrono) {
      running += r.kind === 'advance' ? (r.amount ?? 0) : -(r.amount ?? 0);
      balanceById.set(r.id, running);
    }
    return rows.map((r) => ({ ...r, balanceAfter: balanceById.get(r.id) ?? 0 }));
  })();

  const currentOwed = withBalance[0]?.balanceAfter ?? 0;
  const totalAdvanced = rows.filter((r) => r.kind === 'advance').reduce((s, r) => s + (r.amount ?? 0), 0);
  const totalRepaid = rows.filter((r) => r.kind === 'repay').reduce((s, r) => s + (r.amount ?? 0), 0);

  const update = async (id, field, value) => {
    const prevValue = rows.find((r) => r.id === id)?.[field];
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: value } : r));
    const { error } = await upsertEarninTransaction({ id, [field]: value });
    if (error) {
      setRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: prevValue } : r));
      notifyError('Couldn’t save that change — reverted. Please retry.');
    }
  };

  const add = async (kind) => {
    const { data, error } = await upsertEarninTransaction({
      txn_date: todayISO(), kind, amount: 0,
    });
    if (error || !data?.[0]) { notifyError('Couldn’t add that entry. Please retry.'); return; }
    setRows((prev) => [data[0], ...prev]);
  };

  const remove = async (id) => {
    const prevRows = rows;
    setRows((prev) => prev.filter((r) => r.id !== id));
    const { error } = await deleteRow('fin_earnin_transactions', id);
    if (error) { setRows(prevRows); notifyError('Couldn’t delete that entry. Please retry.'); }
  };

  return (
    <div className="space-y-6">
      <WipNotice>
        Manual transaction log for now — until a Monarch export can backfill history. Not wired
        into the Waterfall&rsquo;s allocation engine yet; that still uses its own manual &ldquo;payback owed&rdquo; field.
      </WipNotice>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Currently owed" value={fmt(currentOwed)} privacy={privacy} tone="text-amber-400" icon={Wallet} />
        <Stat label="Total advanced" value={fmt(totalAdvanced)} privacy={privacy} tone="text-orange-400" icon={ArrowDownCircle} />
        <Stat label="Total repaid" value={fmt(totalRepaid)} privacy={privacy} tone="text-emerald-400" icon={ArrowUpCircle} />
        <Stat label="Entries" value={String(rows.length)} />
      </div>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-zinc-800">
          <div>
            <h3 className="text-sm font-semibold">Transactions</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Newest first — running balance reads top to bottom.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => add('advance')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-700/60 bg-amber-900/20 text-xs font-medium text-amber-400 hover:bg-amber-900/40 transition-colors">
              <Plus size={14} /> Advance
            </button>
            <button onClick={() => add('repay')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-600 bg-emerald-900/30 text-xs font-medium text-emerald-400 hover:bg-emerald-900/50 transition-colors">
              <Plus size={14} /> Repay
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                <Th>Date</Th>
                <Th>Type</Th>
                <Th align="right">Amount</Th>
                <Th align="right">Balance</Th>
                <Th>Notes</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <StateRow colSpan={6}>Loading…</StateRow>
              ) : error ? (
                <LoadErrorRow colSpan={6} onRetry={reload} />
              ) : withBalance.length === 0 ? (
                <StateRow colSpan={6}>No transactions yet — log your first advance or repayment above.</StateRow>
              ) : withBalance.map((r) => (
                <tr key={r.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 group">
                  <Td><EditCell type="date" value={r.txn_date} onSave={(v) => update(r.id, 'txn_date', v)} display={fmtDate} className="text-zinc-300 tabular-nums" /></Td>
                  <Td>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: KIND_COLOR[r.kind] }} />
                      <EditCell type="select" value={r.kind} onSave={(v) => update(r.id, 'kind', v)}
                        options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} className="text-zinc-300" />
                    </span>
                  </Td>
                  <Td className="text-right">
                    <Redacted on={privacy}><AmountEdit value={r.amount} onCommit={(v) => update(r.id, 'amount', v)} className="text-zinc-200" /></Redacted>
                  </Td>
                  <Td className="text-right">
                    <Redacted on={privacy}><span className="tabular-nums text-zinc-400">{fmtDec(r.balanceAfter)}</span></Redacted>
                  </Td>
                  <Td><EditCell value={r.notes} onSave={(v) => update(r.id, 'notes', v)} className="text-zinc-500" placeholder="—" /></Td>
                  <Td className="text-right">
                    <button onClick={() => remove(r.id)} className="opacity-0 group-hover:opacity-40 hover:!opacity-100 text-red-400 transition-opacity"><Trash2 size={13} /></button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-zinc-600">
        &ldquo;Currently owed&rdquo; here is derived from this log (advances add, repayments subtract).
        Once you&rsquo;re comfortable it&rsquo;s accurate, copy it into the Waterfall tab&rsquo;s Plan Inputs
        &ldquo;Earnin — payback owed&rdquo; field — the two aren&rsquo;t linked automatically yet.
      </p>
    </div>
  );
}

function Stat({ label, value, privacy, tone = 'text-white', icon: Icon }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs text-zinc-500 mb-1 flex items-center gap-1.5">
        {Icon && <Icon size={13} className={tone} />}{label}
      </p>
      {privacy !== undefined
        ? <Redacted on={privacy}><span className={`text-xl font-bold tabular-nums ${tone}`}>{value}</span></Redacted>
        : <span className={`text-xl font-bold tabular-nums ${tone}`}>{value}</span>}
    </div>
  );
}
