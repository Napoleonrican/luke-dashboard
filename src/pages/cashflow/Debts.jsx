import { useState, useEffect } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { Plus, Trash2, Columns3, Maximize2, X, ArrowUpRight } from 'lucide-react';
import { Redacted } from './CashflowLayout';
import { fetchDebts, upsertDebt, deleteRow, getPref, setPref } from '../../lib/fin';
import {
  fmt, fmtDec, fmtDate, todayISO, daysUntil,
  daysToColor, aprColor, paymentsRemainingColor, payoffColor,
  paymentsRemaining, expectedPayoffDate,
} from './format';
import EditCell from './EditCell';
import { UpdatedCell, DaysBadge } from './cells';
import { Th, Td, StateRow, LoadErrorRow } from './tableparts';
import { CardList, Card, CardField, CardState, CardLoadError } from './cardparts';
import { makeToggleSort, sortRows } from './sorting';
import { Field, ModalEdit, MoreDetails, AmountEdit } from './ModalField';
import { notifyError } from './toast';

const CREDIT_TYPES = ['BNPL', 'Loan', 'Credit Card'];
const TYPE_COLOR = { BNPL: '#a855f7', Loan: '#f59e0b', 'Credit Card': '#3b82f6' };
const typeColor = (t) => TYPE_COLOR[t] || '#94a3b8';

const SORT_PREF_KEY = 'debts_sort';

const fmtApr = (a) => (a == null ? '—' : `${(a * 100).toFixed(2)}%`);

// Calculated fields, derived from what you enter (never edited directly):
//   • Available Credit = Limit − Balance, but only for a Credit Card (a loan/
//     BNPL has no revolving "available credit").
//   • Total Due = Limit + Finance Charge (the original total owed over the life).
// Returned as null when their inputs are absent, so they read as "—".
function derivedFields(d) {
  const isCC = d.credit_type === 'Credit Card';
  const available_credit = isCC && d.credit_limit != null
    ? (d.credit_limit ?? 0) - (d.balance ?? 0)
    : null;
  const total_due = (d.credit_limit == null && d.finance_charge == null)
    ? null
    : (d.credit_limit ?? 0) + (d.finance_charge ?? 0);
  return { available_credit, total_due };
}
// Editing any of these re-derives Available Credit / Total Due.
const DERIVE_TRIGGERS = new Set(['credit_limit', 'finance_charge', 'balance', 'credit_type']);

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
  total_due:           (d) => derivedFields(d).total_due,
  balance:             (d) => d.balance,
  available_credit:    (d) => derivedFields(d).available_credit,
  next_due_date:       (d) => d.next_due_date,
  days:                (d) => daysUntil(d.next_due_date),
  day_due:             (d) => d.day_due,
  normal_payment:      (d) => d.normal_payment,
  pending_withdrawal:  (d) => (d.pending_withdrawal ? 1 : 0),
  paydown_priority:    (d) => d.paydown_priority,
  payments_remaining:  (d) => paymentsRemaining(d),
  expected_payoff_date:(d) => expectedPayoffDate(d),
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
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [sort, setSort] = useState(null);

  useEffect(() => {
    let active = true;
    fetchDebts().then(({ data, error }) => {
      if (!active) return;
      if (error) setError(error);
      else { setError(null); if (data) setDebts(data); }
      setLoading(false);
    });
    getPref(SORT_PREF_KEY).then(({ data }) => { if (active && data?.key) setSort(data); });
    return () => { active = false; };
  }, [reloadKey]);

  const reload = () => { setLoading(true); setError(null); setReloadKey((k) => k + 1); };

  const toggleSort = makeToggleSort(setSort, (next) => setPref(SORT_PREF_KEY, next));
  const sortedDebts = sortRows(debts, sort, SORT_ACCESSORS);

  const update = async (id, field, value) => {
    const prev = debts.find((d) => d.id === id);
    const prevRow = prev ? { ...prev } : null;
    // When a trigger field changes, recompute the derived fields and persist
    // them in the same write so the stored values (which the Payoff Calculator
    // reads) stay consistent.
    const patch = { [field]: value };
    if (DERIVE_TRIGGERS.has(field)) Object.assign(patch, derivedFields({ ...prev, [field]: value }));
    setDebts((arr) => arr.map((d) => d.id === id ? { ...d, ...patch } : d));
    const { error } = await upsertDebt({ id, ...patch });
    if (error) {
      if (prevRow) setDebts((arr) => arr.map((d) => d.id === id ? prevRow : d));
      notifyError('Couldn’t save that change — reverted. Please retry.');
    }
  };

  const add = async () => {
    const { data, error } = await upsertDebt({
      purchase: 'New Debt', credit_type: 'BNPL', balance: 0, normal_payment: 0,
      pending_withdrawal: false, updated_on: todayISO(), sort_order: debts.length,
    });
    if (error || !data?.[0]) { notifyError('Couldn’t add the debt. Please retry.'); return; }
    setDebts((prev) => [...prev, data[0]]);
    setEditingId(data[0].id);   // open the full editor straight away
  };

  const remove = async (id) => {
    const snapshot = debts;
    setDebts((prev) => prev.filter((d) => d.id !== id));
    const { error } = await deleteRow('fin_debts', id);
    if (error) { setDebts(snapshot); notifyError('Couldn’t delete that debt — restored. Please retry.'); }
  };

  const totalBal  = debts.reduce((s, d) => s + (d.balance ?? 0), 0);
  const totalMins = debts.reduce((s, d) => s + (d.normal_payment ?? 0), 0);
  const colSpan = showAll ? 23 : 16;

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
          {/* Column toggle only affects the table, which is hidden on phones —
              so it's desktop-only, matching where the card view takes over. */}
          <button
            onClick={() => setShowAll((v) => !v)}
            className={`hidden md:flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
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

      {/* Table (desktop) — hidden on phones, where the card list below takes over */}
      <div className="hidden md:block rounded-xl border border-zinc-800 bg-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-500">
              <Th sortKey="updated_on" sort={sort} onSort={toggleSort} className={STICKY_HEAD_1}>Updated</Th>
              <Th sortKey="purchase" sort={sort} onSort={toggleSort} className={STICKY_HEAD_2}>Purchase</Th>
              <Th sortKey="credit_type" sort={sort} onSort={toggleSort}>Credit Type</Th>
              <Th sortKey="lender" sort={sort} onSort={toggleSort}>Lender</Th>
              <Th sortKey="balance" sort={sort} onSort={toggleSort} align="right">Balance</Th>
              <Th sortKey="normal_payment" sort={sort} onSort={toggleSort} align="right">Normal Pmt</Th>
              <Th sortKey="next_due_date" sort={sort} onSort={toggleSort}>Next Due</Th>
              <Th sortKey="days" sort={sort} onSort={toggleSort} align="right">Days</Th>
              <Th sortKey="day_due" sort={sort} onSort={toggleSort} align="right">Day Due</Th>
              <Th sortKey="pending_withdrawal" sort={sort} onSort={toggleSort} align="right">Pending</Th>
              <Th sortKey="paydown_priority" sort={sort} onSort={toggleSort} align="right">Priority</Th>
              <Th sortKey="payments_remaining" sort={sort} onSort={toggleSort} align="right">Pmts Rem.</Th>
              <Th sortKey="expected_payoff_date" sort={sort} onSort={toggleSort}>Exp. Payoff</Th>
              <Th sortKey="last_date" sort={sort} onSort={toggleSort}>Last Date</Th>
              <Th sortKey="new_min" sort={sort} onSort={toggleSort} align="right">New Min.</Th>
              {showAll && <>
                <Th sortKey="origination_date" sort={sort} onSort={toggleSort}>Origination</Th>
                <Th sortKey="apr" sort={sort} onSort={toggleSort} align="right">APR</Th>
                <Th sortKey="term_months" sort={sort} onSort={toggleSort} align="right">Term</Th>
                <Th sortKey="finance_charge" sort={sort} onSort={toggleSort} align="right">Finance Chg</Th>
                <Th sortKey="credit_limit" sort={sort} onSort={toggleSort} align="right">Limit</Th>
                <Th sortKey="total_due" sort={sort} onSort={toggleSort} align="right">Total Due</Th>
                <Th sortKey="available_credit" sort={sort} onSort={toggleSort} align="right">Avail. Credit</Th>
              </>}
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <StateRow colSpan={colSpan}>Loading…</StateRow>
            ) : error ? (
              <LoadErrorRow colSpan={colSpan} onRetry={reload} />
            ) : debts.length === 0 ? (
              <StateRow colSpan={colSpan}>No debts yet — add one or run the seed.</StateRow>
            ) : sortedDebts.map((d) => {
              const pr = paymentsRemaining(d);
              const prC = paymentsRemainingColor(pr);
              const ep = expectedPayoffDate(d);
              const epC = payoffColor(ep);
              return (
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
                <Td className="text-right"><Redacted on={privacy}><AmountEdit value={d.balance} onCommit={(v) => update(d.id, 'balance', v)} className="text-zinc-200 font-medium" /></Redacted></Td>
                <Td className="text-right"><Redacted on={privacy}><AmountEdit value={d.normal_payment} onCommit={(v) => update(d.id, 'normal_payment', v)} className="text-zinc-200" /></Redacted></Td>
                <Td><EditCell type="date" value={d.next_due_date} onSave={(v) => update(d.id, 'next_due_date', v)} display={fmtDate} className="text-zinc-300 tabular-nums" /></Td>
                <Td className="text-right"><DaysBadge iso={d.next_due_date} /></Td>
                <Td className="text-right"><EditCell type="number" value={d.day_due} onSave={(v) => update(d.id, 'day_due', v)} className="text-zinc-400 tabular-nums" /></Td>
                <Td className="text-right">
                  <input type="checkbox" checked={!!d.pending_withdrawal} onChange={(e) => update(d.id, 'pending_withdrawal', e.target.checked)} className="h-4 w-4 accent-emerald-500 cursor-pointer" />
                </Td>
                <Td className="text-right"><EditCell type="number" value={d.paydown_priority} onSave={(v) => update(d.id, 'paydown_priority', v)} className="text-zinc-400 tabular-nums" /></Td>
                <Td className="text-right" title="Calculated from balance, payment & APR">
                  <span style={prC ? { color: prC.color } : undefined} className="tabular-nums">{pr == null ? '—' : Math.round(pr)}</span>
                </Td>
                <Td title="Calculated payoff (NPER) or Last Date, whichever is sooner">
                  <span style={epC ? { color: epC.color } : undefined} className="tabular-nums">{fmtDate(ep)}</span>
                </Td>
                <Td><EditCell type="date" value={d.last_date} onSave={(v) => update(d.id, 'last_date', v)} display={fmtDate} className="text-zinc-500 tabular-nums" /></Td>
                <Td className="text-right"><Redacted on={privacy}><AmountEdit value={d.new_min} onCommit={(v) => update(d.id, 'new_min', v)} className="text-zinc-400" nullable /></Redacted></Td>
                {showAll && <>
                  <Td><EditCell type="date" value={d.origination_date} onSave={(v) => update(d.id, 'origination_date', v)} display={fmtDate} className="text-zinc-500 tabular-nums" /></Td>
                  <Td className="text-right"><ColorCell value={d.apr} type="number" colorFn={aprColor} display={fmtApr} onSave={(v) => update(d.id, 'apr', v)} /></Td>
                  <Td className="text-right"><EditCell type="number" value={d.term_months} onSave={(v) => update(d.id, 'term_months', v)} className="text-zinc-500 tabular-nums" /></Td>
                  <Td className="text-right"><Redacted on={privacy}><AmountEdit value={d.finance_charge} onCommit={(v) => update(d.id, 'finance_charge', v)} className="text-zinc-500" nullable /></Redacted></Td>
                  <Td className="text-right"><Redacted on={privacy}><AmountEdit value={d.credit_limit} onCommit={(v) => update(d.id, 'credit_limit', v)} className="text-zinc-500" nullable /></Redacted></Td>
                  <Td className="text-right" title="Calculated: Limit + Finance Charge">
                    <Redacted on={privacy}><span className="tabular-nums text-zinc-500">{derivedFields(d).total_due == null ? '—' : fmtDec(derivedFields(d).total_due)}</span></Redacted>
                  </Td>
                  <Td className="text-right" title="Calculated: Limit − Balance (credit cards only)">
                    <Redacted on={privacy}><span className="tabular-nums text-zinc-400">{derivedFields(d).available_credit == null ? '—' : fmtDec(derivedFields(d).available_credit)}</span></Redacted>
                  </Td>
                </>}
                <Td className="text-right">
                  <button onClick={() => remove(d.id)} aria-label={`Delete ${d.purchase || 'debt'}`} title="Delete" className="opacity-100 sm:opacity-0 sm:group-hover:opacity-40 hover:!opacity-100 text-red-400 transition-opacity"><Trash2 size={13} /></button>
                </Td>
              </tr>
              );
            })}
          </tbody>
          {!loading && debts.length > 0 && (
            <tfoot>
              <tr className="border-t border-zinc-800 text-zinc-400">
                <Td className="font-medium text-zinc-300" colSpan={4}>Total</Td>
                <Td className="text-right font-semibold text-red-400"><Redacted on={privacy}><span className="tabular-nums">{fmtDec(totalBal)}</span></Redacted></Td>
                <Td className="text-right font-semibold text-emerald-400"><Redacted on={privacy}><span className="tabular-nums">{fmtDec(totalMins)}</span></Redacted></Td>
                <Td colSpan={showAll ? 17 : 10} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Card list (phones) — stacked, read-first; tap a card to open its full
          editor (single-column on mobile), or use the trash icon to delete. */}
      <CardList>
        {loading ? (
          <CardState>Loading…</CardState>
        ) : error ? (
          <CardLoadError onRetry={reload} />
        ) : debts.length === 0 ? (
          <CardState>No debts yet — add one or run the seed.</CardState>
        ) : sortedDebts.map((d) => {
          const pr = paymentsRemaining(d);
          const prC = paymentsRemainingColor(pr);
          const ep = expectedPayoffDate(d);
          const epC = payoffColor(ep);
          return (
            <Card
              key={d.id}
              dotColor={typeColor(d.credit_type)}
              title={d.purchase || 'Debt'}
              deleteLabel={`Delete ${d.purchase || 'debt'}`}
              onOpen={() => setEditingId(d.id)}
              onDelete={() => remove(d.id)}
              headline={
                <Redacted on={privacy}>
                  <span className="text-sm font-semibold text-zinc-100 tabular-nums whitespace-nowrap">{fmt(d.balance)}</span>
                </Redacted>
              }
            >
              <CardField label="Credit Type">{d.credit_type || '—'}</CardField>
              <CardField label="Lender">{d.lender || '—'}</CardField>
              <CardField label="Next Due" full>
                <span className="inline-flex items-center gap-2">
                  <span className="tabular-nums">{fmtDate(d.next_due_date)}</span>
                  <DaysBadge iso={d.next_due_date} />
                </span>
              </CardField>
              <CardField label="Normal Pmt">
                <Redacted on={privacy}>{fmtDec(d.normal_payment)}</Redacted>
              </CardField>
              <CardField label="New Min.">
                <Redacted on={privacy}>{d.new_min == null ? '—' : fmtDec(d.new_min)}</Redacted>
              </CardField>
              <CardField label="Pmts Rem.">
                <span style={prC ? { color: prC.color } : undefined}>{pr == null ? '—' : Math.round(pr)}</span>
              </CardField>
              <CardField label="Exp. Payoff">
                <span style={epC ? { color: epC.color } : undefined}>{fmtDate(ep)}</span>
              </CardField>
            </Card>
          );
        })}
      </CardList>

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
  const calc = derivedFields(debt);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: typeColor(debt.credit_type) }} />
            <h3 className="text-base font-semibold text-white truncate">{debt.purchase || 'Debt'}</h3>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {/* Updated date + freshness dot + "mark today" refresh, same control
                as the table — kept in the header so it's always visible. */}
            <span className="flex items-center gap-1.5 text-xs text-zinc-500">
              <span className="hidden sm:inline">Updated</span>
              <UpdatedCell value={debt.updated_on} onSave={set('updated_on')} />
            </span>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors"><X size={18} /></button>
          </div>
        </div>

        <div className="px-5 py-5 space-y-6">
          {/* Key fields — what you touch most, plus the read-only calcs for context */}
          <div>
            <p className="text-[11px] uppercase tracking-wide text-emerald-500/80 mb-3">Key fields</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
              <Field label="Purchase"><ModalEdit value={debt.purchase} onCommit={set('purchase')} /></Field>
              <Field label="Lender"><ModalEdit value={debt.lender} onCommit={set('lender')} /></Field>
              <Field label="Credit Type"><ModalEdit type="select" value={debt.credit_type} onCommit={set('credit_type')} options={CREDIT_TYPES} /></Field>
              <Field label="Balance"><Redacted on={privacy}><ModalEdit type="currency" value={debt.balance} onCommit={set('balance')} /></Redacted></Field>
              <Field label="Normal Payment"><Redacted on={privacy}><ModalEdit type="currency" value={debt.normal_payment} onCommit={set('normal_payment')} /></Redacted></Field>
              <Field label="Next Due Date"><ModalEdit type="date" value={debt.next_due_date} onCommit={set('next_due_date')} /></Field>
              <Field label="Day Due"><ModalEdit type="number" value={debt.day_due} onCommit={set('day_due')} /></Field>
              <Field label="Paydown Priority"><ModalEdit type="number" value={debt.paydown_priority} onCommit={set('paydown_priority')} /></Field>
              <Field label="Pending Withdrawal"><ModalEdit type="checkbox" value={debt.pending_withdrawal} onCommit={set('pending_withdrawal')} /></Field>
              <Field label="Days to Next Payment">
                <span className="rounded px-2 py-1 text-sm font-medium tabular-nums inline-block" style={dc ? { color: dc.color, background: dc.background } : undefined}>
                  {days == null ? '—' : days < 0 ? `${Math.abs(days)}d overdue` : `${days} days`}
                </span>
              </Field>
              <Field label="Payments Remaining (calculated)">
                <span className="text-sm font-semibold text-zinc-200 tabular-nums">
                  {paymentsRemaining(debt) == null ? '—' : Math.round(paymentsRemaining(debt))}
                </span>
              </Field>
              <Field label="Expected Payoff Date (calculated)">
                <span className="text-sm font-semibold text-zinc-200 tabular-nums">{fmtDate(expectedPayoffDate(debt))}</span>
              </Field>
            </div>
          </div>

          {/* Loan origination details — the fixed terms set when the debt opened,
              plus the calculated Total Due they feed. Collapsed by default. */}
          <MoreDetails label="Loan origination details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
              <Field label="Origination Date"><ModalEdit type="date" value={debt.origination_date} onCommit={set('origination_date')} /></Field>
              <Field label="APR (e.g. 0.2999 = 29.99%)"><ModalEdit type="number" value={debt.apr} onCommit={set('apr')} /></Field>
              <Field label="Term (Months)"><ModalEdit type="number" value={debt.term_months} onCommit={set('term_months')} /></Field>
              <Field label="Finance Charge"><Redacted on={privacy}><ModalEdit type="currency" value={debt.finance_charge} onCommit={set('finance_charge')} /></Redacted></Field>
              <Field label="Limit"><Redacted on={privacy}><ModalEdit type="currency" value={debt.credit_limit} onCommit={set('credit_limit')} /></Redacted></Field>
              <Field label="Total Due (calculated · Limit + Finance Charge)">
                <Redacted on={privacy}>
                  <span className="text-sm font-semibold text-zinc-200 tabular-nums">{calc.total_due == null ? '—' : fmtDec(calc.total_due)}</span>
                </Redacted>
              </Field>
            </div>
          </MoreDetails>

          {/* More details — the less-touched fields. */}
          <MoreDetails>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
              <Field label="Available Credit (calculated · Limit − Balance)">
                <Redacted on={privacy}>
                  <span className="text-sm font-semibold text-zinc-200 tabular-nums">{calc.available_credit == null ? '—' : fmtDec(calc.available_credit)}</span>
                </Redacted>
              </Field>
              <Field label="Last Date"><ModalEdit type="date" value={debt.last_date} onCommit={set('last_date')} /></Field>
              <Field label="New Min."><Redacted on={privacy}><ModalEdit type="currency" value={debt.new_min} onCommit={set('new_min')} /></Redacted></Field>
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
