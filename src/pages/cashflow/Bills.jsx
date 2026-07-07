import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, Trash2, Columns3, Maximize2, X } from 'lucide-react';
import { Redacted } from './CashflowLayout';
import { fetchBills, upsertBill, deleteRow, getPref, setPref } from '../../lib/fin';
import {
  fmtDec, fmtPct, fmtDate, todayISO, daysUntil, monthlyOf, daysToColor, FREQUENCIES,
} from './format';
import EditCell from './EditCell';
import { UpdatedCell, DaysBadge } from './cells';
import { Th, Td, StateRow, LoadErrorRow } from './tableparts';
import { makeToggleSort, sortRows } from './sorting';
import { Field, ModalEdit, MoreDetails, AmountEdit } from './ModalField';
import { notifyError } from './toast';

// Subscriptions live on their own tab (and feed the Summary from there), so
// they're intentionally not a Bills category — keeping it here double-counted
// them in the Summary's Subscription group. Legacy rows fall back to the gray dot.
const CAT_COLOR = { Bill: '#3b82f6', Operating: '#10b981' };
const catColor = (c) => CAT_COLOR[c] || '#94a3b8';
const CATEGORIES = ['Bill', 'Operating'];

const SORT_PREF_KEY = 'bills_sort';

// Accessors so each column sorts by the right underlying value (derived columns
// like Days and Mon. sort by their computed figure). Null/blank sorts last.
const SORT_ACCESSORS = {
  updated_on:    (b) => b.updated_on,
  name:          (b) => (b.name || '').toLowerCase(),
  category:      (b) => (b.category || '').toLowerCase(),
  category2:     (b) => (b.category2 || '').toLowerCase(),
  category3:     (b) => (b.category3 || '').toLowerCase(),
  priority:      (b) => b.priority,
  day_due:       (b) => b.day_due,
  account:       (b) => (b.account || '').toLowerCase(),
  next_due_date: (b) => b.next_due_date,
  days:          (b) => daysUntil(b.next_due_date),
  total_updated: (b) => b.total_updated,
  yoy_change:    (b) => b.yoy_change,
  frequency:     (b) => (b.frequency || '').toLowerCase(),
  amount:        (b) => b.amount,
  monthly:       (b) => monthlyOf(b.amount, b.frequency),
};

// Sticky-column class helpers — freeze Updated + Bill so they stay visible when
// the table scrolls horizontally (e.g. with "All columns" on).
const STICKY_1 = 'sticky left-0 z-10 bg-zinc-900 group-hover:bg-zinc-800';
const STICKY_2 = 'sticky left-[128px] z-10 bg-zinc-900 group-hover:bg-zinc-800';
const STICKY_HEAD_1 = 'sticky left-0 z-20 bg-zinc-900';
const STICKY_HEAD_2 = 'sticky left-[128px] z-20 bg-zinc-900';

export default function Bills() {
  const { privacy } = useOutletContext();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [sort, setSort] = useState(null);   // { key, dir } — null = DB order

  useEffect(() => {
    let active = true;
    fetchBills().then(({ data, error }) => {
      if (!active) return;
      if (error) setError(error);
      else { setError(null); if (data) setBills(data); }
      setLoading(false);
    });
    getPref(SORT_PREF_KEY).then(({ data }) => { if (active && data?.key) setSort(data); });
    return () => { active = false; };
  }, [reloadKey]);

  const reload = () => { setLoading(true); setError(null); setReloadKey((k) => k + 1); };

  // Click a header: sort asc → desc → off. Persisted cross-device via fin_prefs.
  const toggleSort = makeToggleSort(setSort, (next) => setPref(SORT_PREF_KEY, next));

  const sortedBills = sortRows(bills, sort, SORT_ACCESSORS);

  const update = async (id, field, value) => {
    const prevValue = bills.find((b) => b.id === id)?.[field];
    setBills((prev) => prev.map((b) => b.id === id ? { ...b, [field]: value } : b));
    const { error } = await upsertBill({ id, [field]: value });
    if (error) {
      setBills((prev) => prev.map((b) => b.id === id ? { ...b, [field]: prevValue } : b));
      notifyError('Couldn’t save that change — reverted. Please retry.');
    }
  };

  const add = async () => {
    const { data, error } = await upsertBill({
      name: 'New Bill', amount: 0, frequency: 'Monthly', category: 'Bill',
      updated_on: todayISO(), sort_order: bills.length,
    });
    if (error || !data?.[0]) { notifyError('Couldn’t add the bill. Please retry.'); return; }
    setBills((prev) => [...prev, data[0]]);
  };

  const remove = async (id) => {
    const snapshot = bills;
    setBills((prev) => prev.filter((b) => b.id !== id));
    const { error } = await deleteRow('fin_bills', id);
    if (error) { setBills(snapshot); notifyError('Couldn’t delete that bill — restored. Please retry.'); }
  };

  const monthlyTotal = bills.reduce((s, b) => s + monthlyOf(b.amount, b.frequency), 0);

  return (
    <div className="space-y-4">
      {/* Header / controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Monthly Bills</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {bills.length} bills ·{' '}
            <Redacted on={privacy}><span className="text-zinc-400 tabular-nums">{fmtDec(monthlyTotal)}/mo</span></Redacted>
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
            <Plus size={15} /> Add bill
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-500">
              <Th sortKey="updated_on" sort={sort} onSort={toggleSort} className={STICKY_HEAD_1}>Updated</Th>
              <Th sortKey="name" sort={sort} onSort={toggleSort} className={STICKY_HEAD_2}>Bill</Th>
              <Th sortKey="category" sort={sort} onSort={toggleSort}>Category</Th>
              {showAll && <>
                <Th sortKey="category2" sort={sort} onSort={toggleSort}>Cat 2</Th>
                <Th sortKey="category3" sort={sort} onSort={toggleSort}>Cat 3</Th>
                <Th sortKey="priority" sort={sort} onSort={toggleSort} align="right">Priority</Th>
                <Th sortKey="day_due" sort={sort} onSort={toggleSort} align="right">Day Due</Th>
                <Th sortKey="account" sort={sort} onSort={toggleSort}>Payment Source</Th>
              </>}
              <Th sortKey="next_due_date" sort={sort} onSort={toggleSort}>Next Due</Th>
              <Th sortKey="days" sort={sort} onSort={toggleSort} align="right">Days</Th>
              {showAll && <>
                <Th sortKey="total_updated" sort={sort} onSort={toggleSort}>Total Updated</Th>
                <Th sortKey="yoy_change" sort={sort} onSort={toggleSort} align="right">YoY</Th>
                <Th sortKey="frequency" sort={sort} onSort={toggleSort}>Freq.</Th>
                <Th sortKey="amount" sort={sort} onSort={toggleSort} align="right">Amt.</Th>
              </>}
              <Th sortKey="monthly" sort={sort} onSort={toggleSort} align="right">Mon.</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <StateRow colSpan={showAll ? 16 : 8}>Loading…</StateRow>
            ) : error ? (
              <LoadErrorRow colSpan={showAll ? 16 : 8} onRetry={reload} />
            ) : bills.length === 0 ? (
              <StateRow colSpan={showAll ? 16 : 8}>No bills yet — add one or run the seed.</StateRow>
            ) : sortedBills.map((b) => (
              <tr key={b.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 group">
                <Td className={`${STICKY_1} w-[128px]`}><UpdatedCell value={b.updated_on} onSave={(v) => update(b.id, 'updated_on', v)} /></Td>
                <Td className={STICKY_2}>
                  <span className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingId(b.id)}
                      title="Open full editor"
                      className="text-zinc-600 hover:text-emerald-400 transition-colors shrink-0"
                    >
                      <Maximize2 size={13} />
                    </button>
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: catColor(b.category) }} />
                    <EditCell value={b.name} onSave={(v) => update(b.id, 'name', v)} className="text-zinc-200 font-medium" />
                  </span>
                </Td>
                <Td>
                  <EditCell
                    type="select" value={b.category} onSave={(v) => update(b.id, 'category', v)}
                    options={CATEGORIES.map((c) => ({ value: c, label: c }))} className="text-zinc-400"
                  />
                </Td>
                {showAll && <>
                  <Td><EditCell value={b.category2} onSave={(v) => update(b.id, 'category2', v)} className="text-zinc-500" /></Td>
                  <Td><EditCell value={b.category3} onSave={(v) => update(b.id, 'category3', v)} className="text-zinc-500" /></Td>
                  <Td className="text-right"><EditCell type="number" value={b.priority} onSave={(v) => update(b.id, 'priority', v)} className="text-zinc-500 tabular-nums" /></Td>
                  <Td className="text-right"><EditCell type="number" value={b.day_due} onSave={(v) => update(b.id, 'day_due', v)} className="text-zinc-500 tabular-nums" /></Td>
                  <Td><EditCell value={b.account} onSave={(v) => update(b.id, 'account', v)} className="text-zinc-500" /></Td>
                </>}
                <Td><EditCell type="date" value={b.next_due_date} onSave={(v) => update(b.id, 'next_due_date', v)} display={fmtDate} className="text-zinc-300 tabular-nums" /></Td>
                <Td className="text-right"><DaysBadge iso={b.next_due_date} /></Td>
                {showAll && <>
                  <Td><EditCell type="date" value={b.total_updated} onSave={(v) => update(b.id, 'total_updated', v)} display={fmtDate} className="text-zinc-500 tabular-nums" /></Td>
                  <Td className="text-right"><EditCell type="number" value={b.yoy_change} onSave={(v) => update(b.id, 'yoy_change', v)} display={fmtPct} className="text-zinc-500 tabular-nums" /></Td>
                  <Td>
                    <EditCell
                      type="select" value={b.frequency} onSave={(v) => update(b.id, 'frequency', v)}
                      options={FREQUENCIES.map((f) => ({ value: f, label: f }))} className="text-zinc-500"
                    />
                  </Td>
                  <Td className="text-right">
                    <Redacted on={privacy}>
                      <AmountEdit value={b.amount} onCommit={(v) => update(b.id, 'amount', v)} className="text-zinc-400" />
                    </Redacted>
                  </Td>
                </>}
                <Td className="text-right">
                  <Redacted on={privacy}><span className="text-zinc-200 font-medium tabular-nums">{fmtDec(monthlyOf(b.amount, b.frequency))}</span></Redacted>
                </Td>
                <Td className="text-right">
                  <button
                    onClick={() => remove(b.id)}
                    aria-label={`Delete ${b.name || 'bill'}`}
                    title="Delete"
                    className="opacity-100 sm:opacity-0 sm:group-hover:opacity-40 hover:!opacity-100 text-red-400 transition-opacity"
                  >
                    <Trash2 size={13} />
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
          {!loading && bills.length > 0 && (
            <tfoot>
              <tr className="border-t border-zinc-800 text-zinc-400">
                <Td className="font-medium text-zinc-300" colSpan={showAll ? 14 : 5}>Total</Td>
                <Td className="text-right font-semibold text-emerald-400">
                  <Redacted on={privacy}><span className="tabular-nums">{fmtDec(monthlyTotal)}</span></Redacted>
                </Td>
                <Td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="text-[11px] text-zinc-600 flex flex-wrap gap-4">
        <span><span className="inline-block h-2 w-2 rounded-full align-middle mr-1" style={{ background: 'hsl(0 85% 65%)' }} />Needs attention soon / stale</span>
        <span><span className="inline-block h-2 w-2 rounded-full align-middle mr-1" style={{ background: 'hsl(60 80% 60%)' }} />Coming up</span>
        <span><span className="inline-block h-2 w-2 rounded-full align-middle mr-1" style={{ background: 'hsl(120 70% 55%)' }} />Plenty of runway / fresh</span>
      </p>

      {editingId && (
        <BillModal
          bill={bills.find((b) => b.id === editingId)}
          privacy={privacy}
          onChange={update}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}

// ── Full-row editor (overlay) ─────────────────────────────────────────────────
// The fields the user asked to keep front-and-center sit at the top; the
// later-in-year / workbook-detail fields collapse below.
function BillModal({ bill, privacy, onChange, onClose }) {
  if (!bill) return null;
  const set = (field) => (v) => onChange(bill.id, field, v);
  const days = daysUntil(bill.next_due_date);
  const dc = daysToColor(days);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: catColor(bill.category) }} />
            <h3 className="text-base font-semibold text-white truncate">{bill.name || 'Bill'}</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors"><X size={18} /></button>
        </div>

        <div className="px-5 py-5 space-y-6">
          {/* Priority fields */}
          <div>
            <p className="text-[11px] uppercase tracking-wide text-emerald-500/80 mb-3">Key fields</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
              <Field label="Bill"><ModalEdit value={bill.name} onCommit={set('name')} /></Field>
              <Field label="Category">
                <ModalEdit type="select" value={bill.category} onCommit={set('category')} options={CATEGORIES} />
              </Field>
              <Field label="Updated">
                <ModalEdit type="date" value={bill.updated_on} onCommit={set('updated_on')} />
              </Field>
              <Field label="Next Due Date">
                <ModalEdit type="date" value={bill.next_due_date} onCommit={set('next_due_date')} />
              </Field>
              <Field label="Days to Next Payment">
                <span className="rounded px-2 py-1 text-sm font-medium tabular-nums inline-block"
                  style={dc ? { color: dc.color, background: dc.background } : undefined}>
                  {days == null ? '—' : days < 0 ? `${Math.abs(days)}d overdue` : `${days} days`}
                </span>
              </Field>
              <Field label="Monthly (derived)">
                <Redacted on={privacy}>
                  <span className="text-sm font-semibold text-emerald-400 tabular-nums">{fmtDec(monthlyOf(bill.amount, bill.frequency))}</span>
                </Redacted>
              </Field>
            </div>
          </div>

          {/* Secondary / detail fields */}
          <MoreDetails>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
              <Field label="Amount (per frequency)">
                <Redacted on={privacy}><ModalEdit type="currency" value={bill.amount} onCommit={set('amount')} /></Redacted>
              </Field>
              <Field label="Frequency">
                <ModalEdit type="select" value={bill.frequency} onCommit={set('frequency')} options={FREQUENCIES} />
              </Field>
              <Field label="Payment Source"><ModalEdit value={bill.account} onCommit={set('account')} /></Field>
              <Field label="Day Due (debit day)"><ModalEdit type="number" value={bill.day_due} onCommit={set('day_due')} /></Field>
              <Field label="Priority"><ModalEdit type="number" value={bill.priority} onCommit={set('priority')} /></Field>
              <Field label="Category 2"><ModalEdit value={bill.category2} onCommit={set('category2')} /></Field>
              <Field label="Category 3"><ModalEdit value={bill.category3} onCommit={set('category3')} /></Field>
              <Field label="Total Updated"><ModalEdit type="date" value={bill.total_updated} onCommit={set('total_updated')} /></Field>
              <Field label="YoY Change (e.g. 0.18 = 18%)"><ModalEdit type="number" value={bill.yoy_change} onCommit={set('yoy_change')} /></Field>
            </div>
          </MoreDetails>
        </div>

        <div className="flex justify-end border-t border-zinc-800 px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
