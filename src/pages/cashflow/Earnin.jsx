import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, Trash2, ArrowDownCircle, ArrowUpCircle, Wallet } from 'lucide-react';
import { Redacted } from './CashflowLayout';
import {
  fetchEarninTransactions, upsertEarninTransaction, deleteRow,
  fetchAccounts, upsertPendingTransfer,
} from '../../lib/fin';
import { fmt, fmtDec, fmtDate, todayISO } from './format';
import { AmountEdit } from './ModalField';
import EditCell from './EditCell';
import { Th, Td, StateRow, LoadErrorRow } from './tableparts';
import { notifyError } from './toast';
import WipNotice from './WipNotice';

const KINDS = ['advance', 'repay'];
const KIND_LABEL = { advance: 'Advance', repay: 'Repay' };
const KIND_COLOR = { advance: '#f59e0b', repay: '#10b981' };
// Advances land IN Bill Pay Checking; repayments go OUT of it back to Earnin —
// same account-by-name convention the Waterfall uses (balanceFor('Bill Pay Checking')).
const BILL_PAY_NAME = 'Bill Pay Checking';
const DIRECTION_FOR_KIND = { advance: 'in', repay: 'out' };

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
  const [billPayAccountId, setBillPayAccountId] = useState(null);

  useEffect(() => {
    let active = true;
    fetchEarninTransactions().then(({ data, error }) => {
      if (!active) return;
      if (error) setError(error);
      else { setError(null); if (data) setRows(data); }
      setLoading(false);
    });
    fetchAccounts().then(({ data }) => {
      if (!active) return;
      const bp = (data || []).find((a) => a.name === BILL_PAY_NAME);
      setBillPayAccountId(bp?.id ?? null);
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
    const row = rows.find((r) => r.id === id);
    const prevValue = row?.[field];
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: value } : r));
    const { error } = await upsertEarninTransaction({ id, [field]: value });
    if (error) {
      setRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: prevValue } : r));
      notifyError('Couldn’t save that change — reverted. Please retry.');
      return;
    }
    // Keep a linked pending transfer's amount/date in sync with the row that
    // spawned it, so editing here doesn't leave a stale figure on the
    // Current Balances projection.
    if (row?.pending_transfer_id && (field === 'amount' || field === 'txn_date')) {
      await upsertPendingTransfer({
        id: row.pending_transfer_id,
        ...(field === 'amount' ? { amount: value } : { expected_date: value }),
      });
    }
  };

  // Mark/unmark a row "pending" — creates or removes the linked row in
  // fin_pending_transfers, which Current Balances already reads for its
  // projected-balance lines. Advances land IN Bill Pay Checking; repayments
  // go OUT of it.
  const togglePending = async (row, checked) => {
    if (!billPayAccountId) {
      notifyError(`No "${BILL_PAY_NAME}" account found — add one on the Waterfall tab first.`);
      return;
    }
    if (checked) {
      const { data, error } = await upsertPendingTransfer({
        account_id: billPayAccountId,
        direction: DIRECTION_FOR_KIND[row.kind],
        amount: row.amount,
        expected_date: row.txn_date,
        label: `Earnin ${KIND_LABEL[row.kind]}`,
      });
      if (error || !data?.[0]) { notifyError('Couldn’t mark that pending. Please retry.'); return; }
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, pending_transfer_id: data[0].id } : r));
      await upsertEarninTransaction({ id: row.id, pending_transfer_id: data[0].id });
    } else {
      const linkedId = row.pending_transfer_id;
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, pending_transfer_id: null } : r));
      const { error } = await upsertEarninTransaction({ id: row.id, pending_transfer_id: null });
      if (error) {
        setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, pending_transfer_id: linkedId } : r));
        notifyError('Couldn’t clear pending. Please retry.');
        return;
      }
      await deleteRow('fin_pending_transfers', linkedId);
    }
  };

  const add = async (kind) => {
    // Repay defaults to the full running balance — you're paying back what
    // Earnin's owed as of right now, not starting from zero.
    const amount = kind === 'repay' ? Math.max(0, currentOwed) : 0;
    const { data, error } = await upsertEarninTransaction({
      txn_date: todayISO(), kind, amount,
    });
    if (error || !data?.[0]) { notifyError('Couldn’t add that entry. Please retry.'); return; }
    setRows((prev) => [data[0], ...prev]);
  };

  const remove = async (id) => {
    const prevRows = rows;
    const linkedId = rows.find((r) => r.id === id)?.pending_transfer_id;
    setRows((prev) => prev.filter((r) => r.id !== id));
    const { error } = await deleteRow('fin_earnin_transactions', id);
    if (error) { setRows(prevRows); notifyError('Couldn’t delete that entry. Please retry.'); return; }
    if (linkedId) await deleteRow('fin_pending_transfers', linkedId);
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
                <Th className="text-center">Pending</Th>
                <Th>Notes</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <StateRow colSpan={7}>Loading…</StateRow>
              ) : error ? (
                <LoadErrorRow colSpan={7} onRetry={reload} />
              ) : withBalance.length === 0 ? (
                <StateRow colSpan={7}>No transactions yet — log your first advance or repayment above.</StateRow>
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
                  <Td className="text-center">
                    <input
                      type="checkbox"
                      checked={!!r.pending_transfer_id}
                      onChange={(e) => togglePending(r, e.target.checked)}
                      className="h-4 w-4 accent-cyan-500 cursor-pointer"
                      title={r.pending_transfer_id
                        ? `Showing as pending ${DIRECTION_FOR_KIND[r.kind]} on ${BILL_PAY_NAME}`
                        : `Mark pending — adds this as a ${DIRECTION_FOR_KIND[r.kind] === 'in' ? 'pending inflow to' : 'pending outflow from'} ${BILL_PAY_NAME}`}
                    />
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
        Check <span className="text-cyan-400">Pending</span> on a row before the money&rsquo;s actually landed/cleared —
        it adds a real pending transfer on {BILL_PAY_NAME} (advances in, repayments out), so the Waterfall&rsquo;s
        Current Balances shows the projected total. Uncheck it once the transaction posts for real.
      </p>

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
