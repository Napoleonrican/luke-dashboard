import { useState, useEffect } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { Plus, Trash2, Columns3, Maximize2, X, ArrowUpRight } from 'lucide-react';
import { Redacted } from './CashflowLayout';
import { fetchDebts, upsertDebt, deleteRow, getPref, setPref } from '../../lib/fin';
import {
  fmt, fmtDec, fmtDate, todayISO, daysUntil,
  daysToColor, aprColor, paymentsRemainingColor, payoffColor,
} from './format';
import EditCell from './EditCell';
import { UpdatedCell, DaysBadge } from './cells';
import { Th, Td } from './tableparts';
import { makeToggleSort, sortRows } from './sorting';
import { Field, ModalEdit, MoreDetails } from './ModalField';

const CREDIT_TYPES = ['BNPL', 'Loan', 'Credit Card'];
const TYPE_COLOR = { BNPL: '#a855f7', Loan: '#f59e0b', 'Credit Card': '#3b82f6' };
const typeColor = (t) => TYPE_COLOR[t] || '#94a3b8';

const SORT_PREF_KEY = 'debts_sort';

const fmtApr = (a) => (a == null ? '—' : `${(a * 100).toFixed(2)}%`);

const SORT_ACCESSORS = {
  updated_on:          (d) => d.updated_on,
  purchase:            (d) => (d.purchase || '').toLowerCase(),
  credit_type:         (d) => (d.credit_type || '').toLowerCase(),
  lender:              (d) => (d.lender || '').toLowerCase(),
  origination_date:    (d) => d.origination_date,
  apr:                 (d) => d.apr,
  term_months:         (d) => d.term_months,
  finance_charge:      (d) => d.finance_charge,
  credit_limit:        (d) => d.credit_limit,
  total_due:           (d) => d.total_due,
  balance:             (d) => d.balance,
  available_credit:    (d) => d.available_credit,
  next_due_date:       (d) => d.next_due_date,
  days:                (d) => daysUntil(d.next_due_date),
  day_due:             (d) => d.day_due,
  normal_payment:      (d) => d.normal_payment,
  pending_withdrawal:  (d) => (d.pending_withdrawal ? 1 : 0),
  paydown_priority:    (d) => d.paydown_priority,
  payments_remaining:  (d) => d.payments_remaining,
  expected_payoff_date:(d) => d.expected_payoff_date,
  last_date:           (d) => d.last_date,
  new_min:             (d) => d.new_min,
};

// Freeze Updated + Purchase.
const STICKY_1 = 'sticky left-0 z-10 bg-zinc-900 group-hover:bg-zinc-800';
const STICKY_2 = 'sticky left-[128px] z-10 bg-zinc-900 group-hover:bg-zinc-800';
const STICKY_HEAD_1 = 'sticky left-0 z-20 bg-zinc-900';
const STICKY_HEAD_2 = 'sticky left-[128px] z-20 bg-zinc-900';

// A heat-colored, editable numeric/date cell (APR, Pmts Remaining, Payoff).
function ColorCell({ value, type, colorFn, display, onSave, privacy }) {
  const inner = (
    <EditCell
      value={value} type={type} onSave={onSave}
      display={(v) => {
        const c = colorFn(v);
        return <span style={c ? { color: c.color } : undefined} className="tabular-nums">{display(v)}</span>;
      }}
    />
  );
  return privacy ? <Redacted on={privacy}>{inner}</Redacted> : inner;
}

export default function Debts() {
  const { privacy } = useOutletContext();
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [sort, setSort] = useState(null);

  useEffect(() => {
    let active = true;
    fetchDebts().then(({ data }) => { if (active) { if (data) setDebts(data); setLoading(false); } });
    getPref(SORT_PREF_KEY).then(({ data }) => { if (active && data?.key) setSort(data); });
    return () => { active = false; };
  }, []);

  const toggleSort = makeToggleSort(setSort, (next) => setPref(SORT_PREF_KEY, next));
  const sortedDebts = sortRows(debts, sort, SORT_ACCESSORS);

  const update = async (id, field, value) => {
    setDebts((prev) => prev.map((d) => d.id === id ? { ...d, [field]: value } : d));
    await upsertDebt({ id, [field]: value });
  };

  const add = async () => {
    const { data } = await upsertDebt({
      purchase: 'New Debt', credit_type: 'BNPL', balance: 0, normal_payment: 0,
      pending_withdrawal: false, updated_on: todayISO(), sort_order: debts.length,
    });
    if (data?.[0]) setDebts((prev) => [...prev, data[0]]);
  };

  const remove = async (id) => {
    setDebts((prev) => prev.filter((d) => d.id !== id));
    await deleteRow('fin_debts', id);
  };

  const totalBal  = debts.reduce((s, d) => s + (d.balance ?? 0), 0);
  const totalMins = debts.reduce((s, d) => s + (d.normal_payment ?? 0), 0);
  const colSpan = showAll ? 23 : 17;

  return (
    <div className="space-y-4">
      {/* Header / controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-3">
            Debts
            <Link to="/debt-calculator" className="text-xs font-normal text-purple-400 hover:text-purple-300 flex items-center gap-1">
              Payoff Calculator <ArrowUpRight size={13} />
            </Link>
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {debts.length} debts ·{' '}
            <Redacted on={privacy}><span className="text-zinc-400 tabular-nums">{fmt(totalBal)} balance</span></Redacted>
            {' · '}
            <Redacted on={privacy}><span className="text-zinc-400 tabular-nums">{fmtDec(totalMins)}/mo mins</span></Redacted>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAll((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
              showAll ? 'bg-emerald-900/30 border-emerald-600 text-emerald-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Columns3 size={15} /> {showAll ? 'Fewer columns' : 'All columns'}
          </button>
          <button onClick={add} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-600 bg-emerald-900/30 text-sm font-medium text-emerald-400 hover:bg-emerald-900/50 transition-colors">
            <Plus size={15} /> Add debt
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-500">
              <Th sortKey="updated_on" sort={sort} onSort={toggleSort} className={STICKY_HEAD_1}>Updated</Th>
              <Th sortKey="purchase" sort={sort} onSort={toggleSort} className={STICKY_HEAD_2}>Purchase</Th>
              <Th sortKey="credit_type" sort={sort} onSort={toggleSort}>Credit Type</Th>
              <Th sortKey="lender" sort={sort} onSort={toggleSort}>Lender</Th>
              {showAll && <>
                <Th sortKey="origination_date" sort={sort} onSort={toggleSort}>Origination</Th>
                <Th sortKey="apr" sort={sort} onSort={toggleSort} align="right">APR</Th>
                <Th sortKey="term_months" sort={sort} onSort={toggleSort} align="right">Term</Th>
                <Th sortKey="finance_charge" sort={sort} onSort={toggleSort} align="right">Finance Chg</Th>
                <Th sortKey="credit_limit" sort={sort} onSort={toggleSort} align="right">Limit</Th>
                <Th sortKey="total_due" sort={sort} onSort={toggleSort} align="right">Total Due</Th>
              </>}
              <Th sortKey="balance" sort={sort} onSort={toggleSort} align="right">Balance</Th>
              <Th sortKey="available_credit" sort={sort} onSort={toggleSort} align="right">Avail. Credit</Th>
              <Th sortKey="next_due_date" sort={sort} onSort={toggleSort}>Next Due</Th>
              <Th sortKey="days" sort={sort} onSort={toggleSort} align="right">Days</Th>
              <Th sortKey="day_due" sort={sort} onSort={toggleSort} align="right">Day Due</Th>
              <Th sortKey="normal_payment" sort={sort} onSort={toggleSort} align="right">Normal Pmt</Th>
              <Th sortKey="pending_withdrawal" sort={sort} onSort={toggleSort} align="right">Pending</Th>
              <Th sortKey="paydown_priority" sort={sort} onSort={toggleSort} align="right">Priority</Th>
              <Th sortKey="payments_remaining" sort={sort} onSort={toggleSort} align="right">Pmts Rem.</Th>
              <Th sortKey="expected_payoff_date" sort={sort} onSort={toggleSort}>Exp. Payoff</Th>
              <Th sortKey="last_date" sort={sort} onSort={toggleSort}>Last Date</Th>
              <Th sortKey="new_min" sort={sort} onSort={toggleSort} align="right">New Min.</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={colSpan} className="px-3 py-8 text-center text-zinc-600">Loading…</td></tr>
            ) : debts.length === 0 ? (
              <tr><td colSpan={colSpan} className="px-3 py-8 text-center text-zinc-600">No debts yet — add one or run the seed.</td></tr>
            ) : sortedDebts.map((d) => (
              <tr key={d.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 group">
                <Td className={`${STICKY_1} w-[128px]`}><UpdatedCell value={d.updated_on} onSave={(v) => update(d.id, 'updated_on', v)} /></Td>
                <Td className={STICKY_2}>
                  <span className="flex items-center gap-2">
                    <button onClick={() => setEditingId(d.id)} title="Open full editor" className="text-zinc-600 hover:text-emerald-400 transition-colors shrink-0">
                      <Maximize2 size={13} />
                    </button>
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: typeColor(d.credit_type) }} />
                    <EditCell value={d.purchase} onSave={(v) => update(d.id, 'purchase', v)} className="text-zinc-200 font-medium" />
                  </span>
                </Td>
                <Td>
                  <EditCell type="select" value={d.credit_type} onSave={(v) => update(d.id, 'credit_type', v)}
                    options={CREDIT_TYPES.map((c) => ({ value: c, label: c }))} className="text-zinc-400" />
                </Td>
                <Td><EditCell value={d.lender} onSave={(v) => update(d.id, 'lender', v)} className="text-zinc-400" /></Td>
                {showAll && <>
                  <Td><EditCell type="date" value={d.origination_date} onSave={(v) => update(d.id, 'origination_date', v)} display={fmtDate} className="text-zinc-500 tabular-nums" /></Td>
                  <Td className="text-right"><ColorCell value={d.apr} type="number" colorFn={aprColor} display={fmtApr} onSave={(v) => update(d.id, 'apr', v)} /></Td>
                  <Td className="text-right"><EditCell type="number" value={d.term_months} onSave={(v) => update(d.id, 'term_months', v)} className="text-zinc-500 tabular-nums" /></Td>
                  <Td className="text-right"><Redacted on={privacy}><EditCell type="number" value={d.finance_charge} onSave={(v) => update(d.id, 'finance_charge', v)} display={fmtDec} className="text-zinc-500 tabular-nums" /></Redacted></Td>
                  <Td className="text-right"><Redacted on={privacy}><EditCell type="number" value={d.credit_limit} onSave={(v) => update(d.id, 'credit_limit', v)} display={fmtDec} className="text-zinc-500 tabular-nums" /></Redacted></Td>
                  <Td className="text-right"><Redacted on={privacy}><EditCell type="number" value={d.total_due} onSave={(v) => update(d.id, 'total_due', v)} display={fmtDec} className="text-zinc-500 tabular-nums" /></Redacted></Td>
                </>}
                <Td className="text-right"><Redacted on={privacy}><EditCell type="number" value={d.balance} onSave={(v) => update(d.id, 'balance', v)} display={fmtDec} className="text-zinc-200 font-medium tabular-nums" /></Redacted></Td>
                <Td className="text-right"><Redacted on={privacy}><EditCell type="number" value={d.available_credit} onSave={(v) => update(d.id, 'available_credit', v)} display={fmtDec} className="text-zinc-400 tabular-nums" /></Redacted></Td>
                <Td><EditCell type="date" value={d.next_due_date} onSave={(v) => update(d.id, 'next_due_date', v)} display={fmtDate} className="text-zinc-300 tabular-nums" /></Td>
                <Td className="text-right"><DaysBadge iso={d.next_due_date} /></Td>
                <Td className="text-right"><EditCell type="number" value={d.day_due} onSave={(v) => update(d.id, 'day_due', v)} className="text-zinc-400 tabular-nums" /></Td>
                <Td className="text-right"><Redacted on={privacy}><EditCell type="number" value={d.normal_payment} onSave={(v) => update(d.id, 'normal_payment', v)} display={fmtDec} className="text-zinc-200 tabular-nums" /></Redacted></Td>
                <Td className="text-right">
                  <input type="checkbox" checked={!!d.pending_withdrawal} onChange={(e) => update(d.id, 'pending_withdrawal', e.target.checked)} className="h-4 w-4 accent-emerald-500 cursor-pointer" />
                </Td>
                <Td className="text-right"><EditCell type="number" value={d.paydown_priority} onSave={(v) => update(d.id, 'paydown_priority', v)} className="text-zinc-400 tabular-nums" /></Td>
                <Td className="text-right"><ColorCell value={d.payments_remaining} type="number" colorFn={paymentsRemainingColor} display={(v) => (v == null ? '—' : Math.round(v))} onSave={(v) => update(d.id, 'payments_remaining', v)} /></Td>
                <Td><ColorCell value={d.expected_payoff_date} type="date" colorFn={payoffColor} display={fmtDate} onSave={(v) => update(d.id, 'expected_payoff_date', v)} /></Td>
                <Td><EditCell type="date" value={d.last_date} onSave={(v) => update(d.id, 'last_date', v)} display={fmtDate} className="text-zinc-500 tabular-nums" /></Td>
                <Td className="text-right"><Redacted on={privacy}><EditCell type="number" value={d.new_min} onSave={(v) => update(d.id, 'new_min', v)} display={fmtDec} className="text-zinc-400 tabular-nums" /></Redacted></Td>
                <Td className="text-right">
                  <button onClick={() => remove(d.id)} className="opacity-0 group-hover:opacity-40 hover:!opacity-100 text-red-400 transition-opacity"><Trash2 size={13} /></button>
                </Td>
              </tr>
            ))}
          </tbody>
          {!loading && debts.length > 0 && (
            <tfoot>
              <tr className="border-t border-zinc-800 text-zinc-400">
                <Td className="font-medium text-zinc-300" colSpan={showAll ? 10 : 4}>Total</Td>
                <Td className="text-right font-semibold text-red-400"><Redacted on={privacy}><span className="tabular-nums">{fmtDec(totalBal)}</span></Redacted></Td>
                <Td colSpan={4} />
                <Td className="text-right font-semibold text-emerald-400"><Redacted on={privacy}><span className="tabular-nums">{fmtDec(totalMins)}</span></Redacted></Td>
                <Td colSpan={6} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="text-[11px] text-zinc-600 flex flex-wrap gap-4">
        <span><span className="inline-block h-2 w-2 rounded-full align-middle mr-1" style={{ background: 'hsl(0 85% 65%)' }} />Needs attention / high APR / far payoff</span>
        <span><span className="inline-block h-2 w-2 rounded-full align-middle mr-1" style={{ background: 'hsl(120 70% 55%)' }} />Healthy / low APR / near payoff</span>
      </p>

      {editingId && (
        <DebtModal debt={debts.find((d) => d.id === editingId)} privacy={privacy} onChange={update} onClose={() => setEditingId(null)} />
      )}
    </div>
  );
}

// ── Full-row editor (overlay) ─────────────────────────────────────────────────
function DebtModal({ debt, privacy, onChange, onClose }) {
  if (!debt) return null;
  const set = (field) => (v) => onChange(debt.id, field, v);
  const days = daysUntil(debt.next_due_date);
  const dc = daysToColor(days);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: typeColor(debt.credit_type) }} />
            <h3 className="text-base font-semibold text-white truncate">{debt.purchase || 'Debt'}</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors"><X size={18} /></button>
        </div>

        <div className="px-5 py-5 space-y-6">
          {/* Key fields */}
          <div>
            <p className="text-[11px] uppercase tracking-wide text-emerald-500/80 mb-3">Key fields</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
              <Field label="Purchase"><ModalEdit value={debt.purchase} onCommit={set('purchase')} /></Field>
              <Field label="Credit Type"><ModalEdit type="select" value={debt.credit_type} onCommit={set('credit_type')} options={CREDIT_TYPES} /></Field>
              <Field label="Lender"><ModalEdit value={debt.lender} onCommit={set('lender')} /></Field>
              <Field label="Updated"><ModalEdit type="date" value={debt.updated_on} onCommit={set('updated_on')} /></Field>
              <Field label="Balance"><Redacted on={privacy}><ModalEdit type="currency" value={debt.balance} onCommit={set('balance')} /></Redacted></Field>
              <Field label="Available Credit"><Redacted on={privacy}><ModalEdit type="currency" value={debt.available_credit} onCommit={set('available_credit')} /></Redacted></Field>
              <Field label="Next Due Date"><ModalEdit type="date" value={debt.next_due_date} onCommit={set('next_due_date')} /></Field>
              <Field label="Days to Next Payment">
                <span className="rounded px-2 py-1 text-sm font-medium tabular-nums inline-block" style={dc ? { color: dc.color, background: dc.background } : undefined}>
                  {days == null ? '—' : days < 0 ? `${Math.abs(days)}d overdue` : `${days} days`}
                </span>
              </Field>
              <Field label="Day Due"><ModalEdit type="number" value={debt.day_due} onCommit={set('day_due')} /></Field>
              <Field label="Normal Payment"><Redacted on={privacy}><ModalEdit type="currency" value={debt.normal_payment} onCommit={set('normal_payment')} /></Redacted></Field>
              <Field label="Pending Withdrawal"><ModalEdit type="checkbox" value={debt.pending_withdrawal} onCommit={set('pending_withdrawal')} /></Field>
              <Field label="Paydown Priority"><ModalEdit type="number" value={debt.paydown_priority} onCommit={set('paydown_priority')} /></Field>
              <Field label="Payments Remaining"><ModalEdit type="number" value={debt.payments_remaining} onCommit={set('payments_remaining')} /></Field>
              <Field label="Expected Payoff Date"><ModalEdit type="date" value={debt.expected_payoff_date} onCommit={set('expected_payoff_date')} /></Field>
              <Field label="Last Date"><ModalEdit type="date" value={debt.last_date} onCommit={set('last_date')} /></Field>
              <Field label="New Min."><Redacted on={privacy}><ModalEdit type="currency" value={debt.new_min} onCommit={set('new_min')} /></Redacted></Field>
            </div>
          </div>

          {/* Hidden-by-default detail group (Origination Date → Total Due) */}
          <MoreDetails>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
              <Field label="Origination Date"><ModalEdit type="date" value={debt.origination_date} onCommit={set('origination_date')} /></Field>
              <Field label="APR (e.g. 0.2999 = 29.99%)"><ModalEdit type="number" value={debt.apr} onCommit={set('apr')} /></Field>
              <Field label="Term (Months)"><ModalEdit type="number" value={debt.term_months} onCommit={set('term_months')} /></Field>
              <Field label="Finance Charge"><Redacted on={privacy}><ModalEdit type="currency" value={debt.finance_charge} onCommit={set('finance_charge')} /></Redacted></Field>
              <Field label="Limit"><Redacted on={privacy}><ModalEdit type="currency" value={debt.credit_limit} onCommit={set('credit_limit')} /></Redacted></Field>
              <Field label="Total Due"><Redacted on={privacy}><ModalEdit type="currency" value={debt.total_due} onCommit={set('total_due')} /></Redacted></Field>
            </div>
          </MoreDetails>
        </div>

        <div className="flex justify-end border-t border-zinc-800 px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors">Done</button>
        </div>
      </div>
    </div>
  );
}
