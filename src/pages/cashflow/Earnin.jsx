import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, Trash2, Wallet, CalendarDays, CalendarRange, TrendingDown } from 'lucide-react';
import { Redacted } from './CashflowLayout';
import {
  fetchEarninTransactions, upsertEarninTransaction, deleteRow,
  fetchAccounts, upsertPendingTransfer, accountNameMatches,
} from '../../lib/fin';
import { fmt, fmtDec, fmtDate, todayISO, daysSince } from './format';
import { AmountEdit } from './ModalField';
import EditCell from './EditCell';
import { Th, Td, StateRow, LoadErrorRow } from './tableparts';
import { notifyError } from './toast';

const KINDS = ['advance', 'repay'];
const KIND_LABEL = { advance: 'Advance', repay: 'Repay' };
const KIND_COLOR = { advance: '#f59e0b', repay: '#10b981' };
// Advances land IN Bill Pay Checking; repayments go OUT of it back to Earnin —
// same account-by-name convention the Waterfall uses (balanceFor('Bill Pay Checking')).
const BILL_PAY_NAME = 'Bill Pay Checking';
const DIRECTION_FOR_KIND = { advance: 'in', repay: 'out' };

// A log of Earnin advances/repayments — feeds the Waterfall's allocation
// engine live (its Plan Inputs "payback owed" figure is this log's running
// balance) and Current Balances (via the Pending checkbox on each row). This
// is the place to track usage down over time until a Monarch export can
// backfill history.
export default function Earnin() {
  const { privacy } = useOutletContext();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [billPayAccountId, setBillPayAccountId] = useState(null);
  // Draft for the add-entry modal: { kind, txn_date, amount, pending, notes }.
  const [addDraft, setAddDraft] = useState(null);

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
      const bp = (data || []).find((a) => accountNameMatches(a, BILL_PAY_NAME));
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

  // ── Reliance averages ──────────────────────────────────────────────────────
  // The point of this tab is driving Earnin usage DOWN, so the headline numbers
  // are rates, not lifetime totals. Averages divide by the whole elapsed span
  // (first advance → today), not just the weeks a draw happened — a quiet
  // fortnight should pull the average down, otherwise it only ever reports what
  // a borrowing week costs and never whether you're borrowing less often.
  const advances = rows.filter((r) => r.kind === 'advance');
  const totalAdvanced = advances.reduce((s, r) => s + (r.amount ?? 0), 0);

  const firstAdvanceISO = advances.reduce(
    (min, r) => (r.txn_date && (!min || r.txn_date < min) ? r.txn_date : min), null,
  );
  // Inclusive of today, so a single same-day advance reads as 1 day, not 0.
  const spanDays = firstAdvanceISO ? Math.max(1, (daysSince(firstAdvanceISO) ?? 0) + 1) : 0;
  const avgPerWeek = spanDays ? totalAdvanced / (spanDays / 7) : 0;
  const avgPerMonth = avgPerWeek * (52 / 12);

  // Trailing 30 days vs the 30 before it — is reliance climbing or easing?
  const advancedWithin = (fromDaysAgo, toDaysAgo) => advances.reduce((s, r) => {
    const ago = daysSince(r.txn_date);
    return ago != null && ago >= toDaysAgo && ago < fromDaysAgo ? s + (r.amount ?? 0) : s;
  }, 0);
  const last30 = advancedWithin(30, 0);
  const prior30 = advancedWithin(60, 30);
  const hasPrior = spanDays > 30;
  const delta30 = last30 - prior30;

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

  // Adding goes through a modal so every field on the row (amount, date,
  // pending, notes) is filled in up front, instead of landing a $0 row you then
  // have to edit cell by cell.
  const openAdd = (kind) => setAddDraft({
    kind,
    txn_date: todayISO(),
    // Repay defaults to the full running balance — you're paying back what
    // Earnin's owed as of right now, not starting from zero.
    amount: kind === 'repay' ? Math.max(0, currentOwed) : 0,
    pending: false,
    notes: '',
  });

  const saveAdd = async (draft) => {
    const { data, error } = await upsertEarninTransaction({
      txn_date: draft.txn_date, kind: draft.kind, amount: draft.amount, notes: draft.notes || null,
    });
    if (error || !data?.[0]) { notifyError('Couldn’t add that entry. Please retry.'); return; }
    let row = data[0];
    // Marking pending in the modal creates the same linked transfer the row's
    // Pending checkbox would — the entry still saves if that part fails.
    if (draft.pending) {
      if (!billPayAccountId) {
        notifyError(`Entry saved, but no "${BILL_PAY_NAME}" account exists to mark it pending.`);
      } else {
        const { data: pt, error: ptErr } = await upsertPendingTransfer({
          account_id: billPayAccountId,
          direction: DIRECTION_FOR_KIND[draft.kind],
          amount: draft.amount,
          expected_date: draft.txn_date,
          label: `Earnin ${KIND_LABEL[draft.kind]}`,
        });
        if (ptErr || !pt?.[0]) {
          notifyError('Entry saved, but couldn’t mark it pending. Tick Pending on the row to retry.');
        } else {
          await upsertEarninTransaction({ id: row.id, pending_transfer_id: pt[0].id });
          row = { ...row, pending_transfer_id: pt[0].id };
        }
      }
    }
    setRows((prev) => [row, ...prev]);
    setAddDraft(null);
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Currently owed" value={fmt(currentOwed)} privacy={privacy} tone="text-amber-400" icon={Wallet} />
        <Stat
          label="Avg / week" value={fmt(avgPerWeek)} privacy={privacy} tone="text-orange-400" icon={CalendarDays}
          hint={spanDays ? `Advances ÷ ${spanDays >= 14 ? `${Math.round(spanDays / 7)} weeks` : `${spanDays}d`} tracked` : 'No advances logged yet'}
          title="Total advanced divided by the whole span since your first advance — quiet weeks count too, so this reflects how often you draw, not just how much a borrowing week costs."
        />
        <Stat
          label="Avg / month" value={fmt(avgPerMonth)} privacy={privacy} tone="text-orange-400" icon={CalendarRange}
          hint="Weekly average × 52/12"
          title="The weekly average scaled to a month — comparable to a monthly bill."
        />
        <Stat
          label="Last 30 days" value={fmt(last30)} privacy={privacy} tone="text-zinc-100" icon={TrendingDown}
          hint={hasPrior
            ? (Math.abs(delta30) < 0.005
              ? 'Flat vs prior 30d'
              : `${delta30 < 0 ? '↓' : '↑'} ${fmt(Math.abs(delta30))} vs prior 30d`)
            : 'Not enough history to compare'}
          hintTone={hasPrior && Math.abs(delta30) >= 0.005 ? (delta30 < 0 ? 'text-emerald-400' : 'text-red-400') : undefined}
          title="Advances drawn in the trailing 30 days, compared with the 30 days before that. Down is progress."
        />
      </div>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-zinc-800">
          <div>
            <h3 className="text-sm font-semibold">Transactions</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Newest first — running balance reads top to bottom.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => openAdd('advance')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-700/60 bg-amber-900/20 text-xs font-medium text-amber-400 hover:bg-amber-900/40 transition-colors">
              <Plus size={14} /> Advance
            </button>
            <button onClick={() => openAdd('repay')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-600 bg-emerald-900/30 text-xs font-medium text-emerald-400 hover:bg-emerald-900/50 transition-colors">
              <Plus size={14} /> Repay
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {/* Notes takes `w-full` so it absorbs the table's slack — otherwise
                  the browser spreads it across the numeric columns and they drift
                  away from their headings. */}
              <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                <Th>Date</Th>
                <Th>Type</Th>
                <Th align="right">Amount</Th>
                <Th align="right">Balance</Th>
                <Th align="center">Pending</Th>
                <Th className="w-full">Notes</Th>
                <Th className="w-10" />
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
        &ldquo;Currently owed&rdquo; here is derived from this log (advances add, repayments subtract) and feeds the
        Waterfall&rsquo;s Plan Inputs &ldquo;Earnin — payback owed&rdquo; figure live — no manual copying needed.
      </p>

      {addDraft && (
        <AddEntryModal
          draft={addDraft}
          privacy={privacy}
          onChange={setAddDraft}
          onCancel={() => setAddDraft(null)}
          onSave={saveAdd}
        />
      )}
    </div>
  );
}

// Add-entry dialog for a new advance/repayment — captures every field the row
// carries (type, date, amount, pending, notes) so a new entry lands complete
// rather than as a $0 placeholder you edit cell by cell.
function AddEntryModal({ draft, privacy, onChange, onCancel, onSave }) {
  const [saving, setSaving] = useState(false);
  const set = (field) => (v) => onChange({ ...draft, [field]: v });
  const submit = async () => { setSaving(true); await onSave(draft); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl p-5" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: KIND_COLOR[draft.kind] }} />
          <h3 className="text-sm font-semibold text-zinc-100">New Earnin {KIND_LABEL[draft.kind]}</h3>
        </div>

        <div className="space-y-3">
          <ModalRow label="Type">
            <select
              value={draft.kind}
              onChange={(e) => set('kind')(e.target.value)}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 focus:border-amber-600 focus:outline-none"
            >
              {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </ModalRow>

          <ModalRow label="Amount">
            <Redacted on={privacy}>
              <AmountEdit value={draft.amount} onCommit={(v) => set('amount')(v ?? 0)} className="text-zinc-100 font-medium" />
            </Redacted>
          </ModalRow>

          <ModalRow label="Date">
            <input
              type="date" value={draft.txn_date || ''} onChange={(e) => set('txn_date')(e.target.value)}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 tabular-nums focus:border-amber-600 focus:outline-none"
            />
          </ModalRow>

          <ModalRow
            label="Pending"
            hint={`Adds a pending ${DIRECTION_FOR_KIND[draft.kind] === 'in' ? 'inflow to' : 'outflow from'} ${BILL_PAY_NAME}`}
          >
            <input
              type="checkbox" checked={!!draft.pending} onChange={(e) => set('pending')(e.target.checked)}
              className="h-4 w-4 accent-cyan-500 cursor-pointer"
            />
          </ModalRow>

          <div>
            <p className="text-xs text-zinc-400 mb-1">Notes</p>
            <input
              type="text" value={draft.notes || ''} onChange={(e) => set('notes')(e.target.value)}
              placeholder="Optional"
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-amber-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} disabled={saving}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            className="rounded-lg border border-emerald-600 bg-emerald-900/30 px-3.5 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-900/50 transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : `Add ${KIND_LABEL[draft.kind]}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalRow({ label, hint, children }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-zinc-400">
        {label}
        {hint && <span className="block text-[10px] text-zinc-600">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

function Stat({ label, value, privacy, tone = 'text-white', icon: Icon, hint, hintTone, title }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4" title={title}>
      <p className="text-xs text-zinc-500 mb-1 flex items-center gap-1.5">
        {Icon && <Icon size={13} className={tone} />}{label}
      </p>
      {privacy !== undefined
        ? <Redacted on={privacy}><span className={`text-xl font-bold tabular-nums ${tone}`}>{value}</span></Redacted>
        : <span className={`text-xl font-bold tabular-nums ${tone}`}>{value}</span>}
      {hint && <p className={`mt-1.5 text-[11px] ${hintTone || 'text-zinc-600'}`}>{hint}</p>}
    </div>
  );
}
