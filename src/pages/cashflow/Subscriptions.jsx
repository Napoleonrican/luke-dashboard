import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, Trash2, Columns3, Maximize2, X, Camera, ArrowUp, ArrowDown } from 'lucide-react';
import { Redacted } from './CashflowLayout';
import {
  fetchDigitalSubs, fetchConsumableSubs, fetchSubSnapshots,
  upsertDigitalSub, upsertConsumableSub, insertSubSnapshot,
  deleteRow, getPref, setPref,
} from '../../lib/fin';
import {
  fmt, fmtDec, fmtDate, todayISO, FREQUENCIES, scaleColor, aboveAvgColor,
} from './format';
import EditCell from './EditCell';
import { UpdatedCell, DaysBadge } from './cells';
import { Th, Td } from './tableparts';
import { makeToggleSort, sortRows } from './sorting';
import { Field, ModalEdit, MoreDetails, AmountEdit } from './ModalField';
import {
  monthlyDigital, monthlyConsumable, categoryBreakdown, buildSnapshot, diffSnapshots,
  weeksOf, costPerType, ordersPerYear, costPerYear,
} from './subsAgg';

const VIEW_PREF = 'subs_view';            // 'digital' | 'consumable'
const ACTIVE_PREF = 'subs_active_only';   // boolean
const DIG_SORT = 'digsubs_sort';
const CON_SORT = 'conssubs_sort';

const STICKY_1 = 'sticky left-0 z-10 bg-zinc-900 group-hover:bg-zinc-800';
const STICKY_HEAD_1 = 'sticky left-0 z-20 bg-zinc-900';

const DIG_ACCESSORS = {
  updated_on:    (s) => s.updated_on,
  priority:      (s) => s.priority,
  active:        (s) => (s.active ? 1 : 0),
  name:          (s) => (s.name || '').toLowerCase(),
  category:      (s) => (s.category || '').toLowerCase(),
  day_due:       (s) => s.day_due,
  next_due_date: (s) => s.next_due_date,
  frequency:     (s) => (s.frequency || '').toLowerCase(),
  amount:        (s) => s.amount,
  account:       (s) => (s.account || '').toLowerCase(),
  monthly:       (s) => monthlyDigital(s),
};

const CON_ACCESSORS = {
  updated_on:     (s) => s.updated_on,
  priority:       (s) => s.priority,
  store:          (s) => (s.store || '').toLowerCase(),
  name:           (s) => (s.name || '').toLowerCase(),
  category:       (s) => (s.category || '').toLowerCase(),
  count:          (s) => s.count,
  unit:           (s) => (s.unit || '').toLowerCase(),
  active:         (s) => (s.active ? 1 : 0),
  cost_per_order: (s) => s.cost_per_order,
  weeks:          (s) => weeksOf(s),
  cost_per_type:  (s) => costPerType(s),
  orders_per_yr:  (s) => ordersPerYear(s),
  cost_per_year:  (s) => costPerYear(s),
  monthly:        (s) => monthlyConsumable(s),
};

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Subscriptions() {
  const { privacy } = useOutletContext();
  const [digital, setDigital] = useState([]);
  const [consumable, setConsumable] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('digital');
  const [activeOnly, setActiveOnly] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([fetchDigitalSubs(), fetchConsumableSubs(), fetchSubSnapshots()]).then(
      ([d, c, snap]) => {
        if (!active) return;
        if (d.data) setDigital(d.data);
        if (c.data) setConsumable(c.data);
        if (snap.data) setSnapshots(snap.data);
        setLoading(false);
      },
    );
    getPref(VIEW_PREF).then(({ data }) => { if (active && (data === 'digital' || data === 'consumable')) setView(data); });
    getPref(ACTIVE_PREF).then(({ data }) => { if (active && typeof data === 'boolean') setActiveOnly(data); });
    return () => { active = false; };
  }, []);

  const switchView = (v) => { setView(v); setPref(VIEW_PREF, v); };
  const toggleActiveOnly = () => setActiveOnly((p) => { const next = !p; setPref(ACTIVE_PREF, next); return next; });

  const takeSnapshot = async () => {
    const snap = buildSnapshot(digital, consumable);
    const { data } = await insertSubSnapshot(snap);
    if (data?.[0]) setSnapshots((prev) => [data[0], ...prev]);
  };

  return (
    <div className="space-y-6">
      <SummaryStats
        privacy={privacy}
        digital={digital}
        consumable={consumable}
        snapshots={snapshots}
        onSnapshot={takeSnapshot}
      />

      {/* Segmented toggle + active filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-zinc-700 bg-zinc-900 p-0.5">
          {[['digital', 'Digital'], ['consumable', 'Consumable']].map(([v, label]) => (
            <button
              key={v}
              onClick={() => switchView(v)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                view === v ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={toggleActiveOnly}
          className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
            activeOnly
              ? 'bg-emerald-900/30 border-emerald-600 text-emerald-400'
              : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {activeOnly ? 'Showing active only' : 'Showing all'}
        </button>
      </div>

      {view === 'digital' ? (
        <DigitalTable rows={digital} setRows={setDigital} privacy={privacy} loading={loading} activeOnly={activeOnly} />
      ) : (
        <ConsumableTable rows={consumable} setRows={setConsumable} privacy={privacy} loading={loading} activeOnly={activeOnly} />
      )}
    </div>
  );
}

// ── Digital subscriptions table ───────────────────────────────────────────────
// Column order mirrors the workbook: Updated · Priority · Active · Bill ·
// Category · Day Due · Next Due · Days · Amt. · Frequency · Mon.
function DigitalTable({ rows, setRows, privacy, loading, activeOnly }) {
  const [showAll, setShowAll] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [sort, setSort] = useState(null);

  useEffect(() => { getPref(DIG_SORT).then(({ data }) => { if (data?.key) setSort(data); }); }, []);
  const toggleSort = makeToggleSort(setSort, (next) => setPref(DIG_SORT, next));

  const update = async (id, field, value) => {
    setRows((prev) => prev.map((s) => s.id === id ? { ...s, [field]: value } : s));
    await upsertDigitalSub({ id, [field]: value });
  };
  const add = async () => {
    const { data } = await upsertDigitalSub({
      name: 'New Subscription', amount: 0, frequency: 'Monthly', active: true,
      updated_on: todayISO(), sort_order: rows.length,
    });
    if (data?.[0]) setRows((prev) => [...prev, data[0]]);
  };
  const remove = async (id) => {
    setRows((prev) => prev.filter((s) => s.id !== id));
    await deleteRow('fin_digital_subscriptions', id);
  };

  const visible = activeOnly ? rows.filter((s) => s.active) : rows;
  const sorted = sortRows(visible, sort, DIG_ACCESSORS);
  const monthlyTotal = rows.filter((s) => s.active).reduce((t, s) => t + monthlyDigital(s), 0);
  const colSpan = showAll ? 12 : 11;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Digital Subscriptions</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {visible.length} shown ·{' '}
            <Redacted on={privacy}><span className="text-zinc-400 tabular-nums">{fmtDec(monthlyTotal)}/mo active</span></Redacted>
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
            <Plus size={15} /> Add subscription
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-500">
              <Th sortKey="updated_on" sort={sort} onSort={toggleSort} className={STICKY_HEAD_1}>Updated</Th>
              <Th sortKey="priority" sort={sort} onSort={toggleSort} align="right">Priority</Th>
              <Th sortKey="active" sort={sort} onSort={toggleSort} align="center">Active</Th>
              <Th sortKey="name" sort={sort} onSort={toggleSort}>Subscription</Th>
              <Th sortKey="category" sort={sort} onSort={toggleSort}>Category</Th>
              <Th sortKey="day_due" sort={sort} onSort={toggleSort} align="right">Day Due</Th>
              <Th sortKey="next_due_date" sort={sort} onSort={toggleSort}>Next Due</Th>
              <Th sortKey="days" sort={sort} onSort={toggleSort} align="right">Days</Th>
              <Th sortKey="amount" sort={sort} onSort={toggleSort} align="right">Amt.</Th>
              <Th sortKey="frequency" sort={sort} onSort={toggleSort}>Freq.</Th>
              {showAll && <Th sortKey="account" sort={sort} onSort={toggleSort}>Payment Source</Th>}
              <Th sortKey="monthly" sort={sort} onSort={toggleSort} align="right">Mon.</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={colSpan} className="px-3 py-8 text-center text-zinc-600">Loading…</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={colSpan} className="px-3 py-8 text-center text-zinc-600">No subscriptions — add one or run the seed.</td></tr>
            ) : sorted.map((s) => (
              <tr key={s.id} className={`border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 group ${s.active ? '' : 'opacity-50'}`}>
                <Td className={`${STICKY_1} w-[128px]`}><UpdatedCell value={s.updated_on} onSave={(v) => update(s.id, 'updated_on', v)} /></Td>
                <Td className="text-right"><EditCell type="number" value={s.priority} onSave={(v) => update(s.id, 'priority', v)} className="text-zinc-500 tabular-nums" /></Td>
                <Td className="text-center">
                  <input type="checkbox" checked={!!s.active} onChange={(e) => update(s.id, 'active', e.target.checked)} className="h-4 w-4 accent-emerald-500 cursor-pointer" />
                </Td>
                <Td>
                  <span className="flex items-center gap-2">
                    <button onClick={() => setEditingId(s.id)} title="Open full editor" className="text-zinc-600 hover:text-emerald-400 transition-colors shrink-0">
                      <Maximize2 size={13} />
                    </button>
                    <span className="h-2 w-2 rounded-full shrink-0 bg-pink-500" />
                    <EditCell value={s.name} onSave={(v) => update(s.id, 'name', v)} className="text-zinc-200 font-medium" />
                  </span>
                </Td>
                <Td><EditCell value={s.category} onSave={(v) => update(s.id, 'category', v)} className="text-zinc-400" /></Td>
                <Td className="text-right"><EditCell type="number" value={s.day_due} onSave={(v) => update(s.id, 'day_due', v)} className="text-zinc-500 tabular-nums" /></Td>
                <Td><EditCell type="date" value={s.next_due_date} onSave={(v) => update(s.id, 'next_due_date', v)} display={fmtDate} className="text-zinc-300 tabular-nums" /></Td>
                <Td className="text-right"><DaysBadge iso={s.next_due_date} /></Td>
                <Td className="text-right"><Redacted on={privacy}><AmountEdit value={s.amount} onCommit={(v) => update(s.id, 'amount', v)} className="text-zinc-400" /></Redacted></Td>
                <Td>
                  <EditCell type="select" value={s.frequency} onSave={(v) => update(s.id, 'frequency', v)}
                    options={FREQUENCIES.map((f) => ({ value: f, label: f }))} className="text-zinc-500" />
                </Td>
                {showAll && <Td><EditCell value={s.account} onSave={(v) => update(s.id, 'account', v)} className="text-zinc-500" /></Td>}
                <Td className="text-right"><Redacted on={privacy}><span className="text-zinc-200 font-medium tabular-nums">{fmtDec(monthlyDigital(s))}</span></Redacted></Td>
                <Td className="text-right">
                  <button onClick={() => remove(s.id)} className="opacity-0 group-hover:opacity-40 hover:!opacity-100 text-red-400 transition-opacity"><Trash2 size={13} /></button>
                </Td>
              </tr>
            ))}
          </tbody>
          {!loading && sorted.length > 0 && (
            <tfoot>
              <tr className="border-t border-zinc-800 text-zinc-400">
                <Td className="font-medium text-zinc-300" colSpan={showAll ? 11 : 10}>Active total</Td>
                <Td className="text-right font-semibold text-emerald-400"><Redacted on={privacy}><span className="tabular-nums">{fmtDec(monthlyTotal)}</span></Redacted></Td>
                <Td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {editingId && (
        <DigitalModal sub={rows.find((s) => s.id === editingId)} privacy={privacy} onChange={update} onClose={() => setEditingId(null)} />
      )}
    </div>
  );
}

// ── Consumable subscriptions table ────────────────────────────────────────────
// Displayed order: Updated · Priority · Store · Item · Amt. · Freq.(Wks) ·
// Cost Per Type · Cost/Year. The rest (Category, Count, Type, Active, Orders/Yr,
// Mon.) live behind "All columns". Heat scales: Cost Per Type (range), Cost/Year
// (above the average is flagged).
function ConsumableTable({ rows, setRows, privacy, loading, activeOnly }) {
  const [showAll, setShowAll] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [sort, setSort] = useState(null);

  useEffect(() => { getPref(CON_SORT).then(({ data }) => { if (data?.key) setSort(data); }); }, []);
  const toggleSort = makeToggleSort(setSort, (next) => setPref(CON_SORT, next));

  const update = async (id, field, value) => {
    setRows((prev) => prev.map((s) => s.id === id ? { ...s, [field]: value } : s));
    await upsertConsumableSub({ id, [field]: value });
  };
  // Frequency is entered/edited in weeks; stored as days.
  const updateWeeks = (id, weeks) => update(id, 'order_frequency_days', Math.max(1, Math.round((weeks || 0) * 7)));
  const add = async () => {
    const { data } = await upsertConsumableSub({
      name: 'New Item', store: 'Amazon', cost_per_order: 0, order_frequency_days: 28,
      active: true, updated_on: todayISO(), sort_order: rows.length,
    });
    if (data?.[0]) setRows((prev) => [...prev, data[0]]);
  };
  const remove = async (id) => {
    setRows((prev) => prev.filter((s) => s.id !== id));
    await deleteRow('fin_consumable_subscriptions', id);
  };

  const visible = activeOnly ? rows.filter((s) => s.active) : rows;
  const sorted = sortRows(visible, sort, CON_ACCESSORS);
  const monthlyTotal = rows.filter((s) => s.active).reduce((t, s) => t + monthlyConsumable(s), 0);

  // Conditional-formatting reference values (across all rows, for a stable scale).
  const cpts = rows.map(costPerType).filter((v) => v != null);
  const cptMin = cpts.length ? Math.min(...cpts) : null;
  const cptMax = cpts.length ? Math.max(...cpts) : null;
  const cpys = rows.map(costPerYear).filter((v) => v != null);
  const cpyAvg = cpys.length ? cpys.reduce((a, b) => a + b, 0) / cpys.length : null;
  const colSpan = showAll ? 13 : 9;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Consumable Subscriptions</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {visible.length} shown ·{' '}
            <Redacted on={privacy}><span className="text-zinc-400 tabular-nums">{fmtDec(monthlyTotal)}/mo est. active</span></Redacted>
            {cpyAvg != null && <> · <Redacted on={privacy}><span className="text-zinc-500 tabular-nums">{fmt(cpyAvg)}/yr avg</span></Redacted></>}
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
            <Plus size={15} /> Add item
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-500">
              <Th sortKey="updated_on" sort={sort} onSort={toggleSort} className={STICKY_HEAD_1}>Updated</Th>
              <Th sortKey="priority" sort={sort} onSort={toggleSort} align="right">Priority</Th>
              <Th sortKey="store" sort={sort} onSort={toggleSort}>Store</Th>
              <Th sortKey="name" sort={sort} onSort={toggleSort}>Item</Th>
              {showAll && <>
                <Th sortKey="category" sort={sort} onSort={toggleSort}>Category</Th>
                <Th sortKey="active" sort={sort} onSort={toggleSort} align="center">Active</Th>
                <Th sortKey="count" sort={sort} onSort={toggleSort} align="right">Count</Th>
                <Th sortKey="unit" sort={sort} onSort={toggleSort}>Type</Th>
              </>}
              <Th sortKey="cost_per_order" sort={sort} onSort={toggleSort} align="right">Amt.</Th>
              <Th sortKey="weeks" sort={sort} onSort={toggleSort} align="right">Freq. (Wks)</Th>
              <Th sortKey="cost_per_type" sort={sort} onSort={toggleSort} align="right">Cost / Type</Th>
              {showAll && <Th sortKey="orders_per_yr" sort={sort} onSort={toggleSort} align="right">Orders/Yr</Th>}
              <Th sortKey="cost_per_year" sort={sort} onSort={toggleSort} align="right">Cost / Year</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={colSpan} className="px-3 py-8 text-center text-zinc-600">Loading…</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={colSpan} className="px-3 py-8 text-center text-zinc-600">No items — add one or run the seed.</td></tr>
            ) : sorted.map((s) => {
              const cpt = costPerType(s);
              const cpy = costPerYear(s);
              const cptC = scaleColor(cpt, cptMin, cptMax);
              const cpyC = aboveAvgColor(cpy, cpyAvg);
              return (
                <tr key={s.id} className={`border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 group ${s.active ? '' : 'opacity-50'}`}>
                  <Td className={`${STICKY_1} w-[128px]`}><UpdatedCell value={s.updated_on} onSave={(v) => update(s.id, 'updated_on', v)} /></Td>
                  <Td className="text-right"><EditCell type="number" value={s.priority} onSave={(v) => update(s.id, 'priority', v)} className="text-zinc-500 tabular-nums" /></Td>
                  <Td><EditCell value={s.store} onSave={(v) => update(s.id, 'store', v)} className="text-zinc-400" /></Td>
                  <Td>
                    <span className="flex items-center gap-2">
                      <button onClick={() => setEditingId(s.id)} title="Open full editor" className="text-zinc-600 hover:text-emerald-400 transition-colors shrink-0">
                        <Maximize2 size={13} />
                      </button>
                      <span className="h-2 w-2 rounded-full shrink-0 bg-emerald-500" />
                      <EditCell value={s.name} onSave={(v) => update(s.id, 'name', v)} className="text-zinc-200 font-medium" />
                    </span>
                  </Td>
                  {showAll && <>
                    <Td><EditCell value={s.category} onSave={(v) => update(s.id, 'category', v)} className="text-zinc-400" /></Td>
                    <Td className="text-center">
                      <input type="checkbox" checked={!!s.active} onChange={(e) => update(s.id, 'active', e.target.checked)} className="h-4 w-4 accent-emerald-500 cursor-pointer" />
                    </Td>
                    <Td className="text-right"><EditCell type="number" value={s.count} onSave={(v) => update(s.id, 'count', v)} className="text-zinc-500 tabular-nums" /></Td>
                    <Td><EditCell value={s.unit} onSave={(v) => update(s.id, 'unit', v)} className="text-zinc-500" /></Td>
                  </>}
                  <Td className="text-right"><Redacted on={privacy}><AmountEdit value={s.cost_per_order} onCommit={(v) => update(s.id, 'cost_per_order', v)} className="text-zinc-300" /></Redacted></Td>
                  <Td className="text-right"><EditCell type="number" value={Math.round(weeksOf(s))} onSave={(v) => updateWeeks(s.id, v)} className="text-zinc-400 tabular-nums" /></Td>
                  <Td className="text-right">
                    <Redacted on={privacy}>
                      <span style={cptC ? { color: cptC.color } : undefined} className="tabular-nums">{cpt == null ? '—' : fmtDec(cpt)}</span>
                    </Redacted>
                  </Td>
                  {showAll && <Td className="text-right tabular-nums text-zinc-500">{ordersPerYear(s) == null ? '—' : Math.round(ordersPerYear(s) * 10) / 10}</Td>}
                  <Td className="text-right">
                    <Redacted on={privacy}>
                      <span style={cpyC ? { color: cpyC.color, background: cpyC.background } : undefined} className="rounded px-1.5 py-0.5 tabular-nums font-medium">{cpy == null ? '—' : fmt(cpy)}</span>
                    </Redacted>
                  </Td>
                  <Td className="text-right">
                    <button onClick={() => remove(s.id)} className="opacity-0 group-hover:opacity-40 hover:!opacity-100 text-red-400 transition-opacity"><Trash2 size={13} /></button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
          {!loading && sorted.length > 0 && (
            <tfoot>
              <tr className="border-t border-zinc-800 text-zinc-400">
                <Td className="font-medium text-zinc-300" colSpan={showAll ? 12 : 8}>Active / yr · /mo est.</Td>
                <Td className="text-right font-semibold text-emerald-400" colSpan={2}>
                  <Redacted on={privacy}><span className="tabular-nums">{fmt(cpys.reduce((a, b) => a + b, 0))} · {fmtDec(monthlyTotal)}</span></Redacted>
                </Td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="text-[11px] text-zinc-600 flex flex-wrap gap-4">
        <span><span className="inline-block h-2 w-2 rounded-full align-middle mr-1" style={{ background: 'hsl(0 85% 65%)' }} />Cost/Type high · Cost/Year above average</span>
        <span><span className="inline-block h-2 w-2 rounded-full align-middle mr-1" style={{ background: 'hsl(120 70% 55%)' }} />Cost/Type low</span>
      </p>

      {editingId && (
        <ConsumableModal sub={rows.find((s) => s.id === editingId)} privacy={privacy} onChange={update} onUpdateWeeks={updateWeeks} onClose={() => setEditingId(null)} />
      )}
    </div>
  );
}

// ── Digital full-row editor (overlay) ─────────────────────────────────────────
function DigitalModal({ sub, privacy, onChange, onClose }) {
  if (!sub) return null;
  const set = (field) => (v) => onChange(sub.id, field, v);

  return (
    <ModalShell title={sub.name || 'Subscription'} dot="bg-pink-500" onClose={onClose}>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-emerald-500/80 mb-3">Key fields</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
          <Field label="Subscription"><ModalEdit value={sub.name} onCommit={set('name')} /></Field>
          <Field label="Category"><ModalEdit value={sub.category} onCommit={set('category')} /></Field>
          <Field label="Active"><ModalEdit type="checkbox" value={sub.active} onCommit={set('active')} /></Field>
          <Field label="Updated"><ModalEdit type="date" value={sub.updated_on} onCommit={set('updated_on')} /></Field>
          <Field label="Amount"><Redacted on={privacy}><ModalEdit type="currency" value={sub.amount} onCommit={set('amount')} /></Redacted></Field>
          <Field label="Frequency"><ModalEdit type="select" value={sub.frequency} onCommit={set('frequency')} options={FREQUENCIES} /></Field>
          <Field label="Next Due Date"><ModalEdit type="date" value={sub.next_due_date} onCommit={set('next_due_date')} /></Field>
          <Field label="Monthly (derived)">
            <Redacted on={privacy}><span className="text-sm font-semibold text-emerald-400 tabular-nums">{fmtDec(monthlyDigital(sub))}</span></Redacted>
          </Field>
        </div>
      </div>
      <MoreDetails>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
          <Field label="Priority"><ModalEdit type="number" value={sub.priority} onCommit={set('priority')} /></Field>
          <Field label="Day Due (debit day)"><ModalEdit type="number" value={sub.day_due} onCommit={set('day_due')} /></Field>
          <Field label="Payment Source"><ModalEdit value={sub.account} onCommit={set('account')} /></Field>
          <Field label="Notes"><ModalEdit value={sub.notes} onCommit={set('notes')} /></Field>
        </div>
      </MoreDetails>
    </ModalShell>
  );
}

// ── Consumable full-row editor (overlay) ──────────────────────────────────────
function ConsumableModal({ sub, privacy, onChange, onUpdateWeeks, onClose }) {
  if (!sub) return null;
  const set = (field) => (v) => onChange(sub.id, field, v);

  return (
    <ModalShell title={sub.name || 'Item'} dot="bg-emerald-500" onClose={onClose}>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-emerald-500/80 mb-3">Key fields</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
          <Field label="Item"><ModalEdit value={sub.name} onCommit={set('name')} /></Field>
          <Field label="Store"><ModalEdit value={sub.store} onCommit={set('store')} /></Field>
          <Field label="Category"><ModalEdit value={sub.category} onCommit={set('category')} /></Field>
          <Field label="Active"><ModalEdit type="checkbox" value={sub.active} onCommit={set('active')} /></Field>
          <Field label="Updated"><ModalEdit type="date" value={sub.updated_on} onCommit={set('updated_on')} /></Field>
          <Field label="Amt. (cost per order)"><Redacted on={privacy}><ModalEdit type="currency" value={sub.cost_per_order} onCommit={set('cost_per_order')} /></Redacted></Field>
          <Field label="Frequency (weeks)"><ModalEdit type="number" value={Math.round(weeksOf(sub))} onCommit={(v) => onUpdateWeeks(sub.id, v)} /></Field>
          <Field label="Cost / Year (derived)">
            <Redacted on={privacy}><span className="text-sm font-semibold text-emerald-400 tabular-nums">{costPerYear(sub) == null ? '—' : fmt(costPerYear(sub))}</span></Redacted>
          </Field>
        </div>
      </div>
      <MoreDetails>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
          <Field label="Priority"><ModalEdit type="number" value={sub.priority} onCommit={set('priority')} /></Field>
          <Field label="Count"><ModalEdit type="number" value={sub.count} onCommit={set('count')} /></Field>
          <Field label="Type (unit)"><ModalEdit value={sub.unit} onCommit={set('unit')} /></Field>
          <Field label="Cost / Type (derived)">
            <Redacted on={privacy}><span className="text-sm font-semibold text-zinc-300 tabular-nums">{costPerType(sub) == null ? '—' : fmtDec(costPerType(sub))}</span></Redacted>
          </Field>
          <Field label="Monthly est. (derived)">
            <Redacted on={privacy}><span className="text-sm font-semibold text-zinc-300 tabular-nums">{fmtDec(monthlyConsumable(sub))}</span></Redacted>
          </Field>
          <Field label="Notes"><ModalEdit value={sub.notes} onCommit={set('notes')} /></Field>
        </div>
      </MoreDetails>
    </ModalShell>
  );
}

// Shared modal chrome for the subscription editors.
function ModalShell({ title, dot, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${dot}`} />
            <h3 className="text-base font-semibold text-white truncate">{title}</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors"><X size={18} /></button>
        </div>
        <div className="px-5 py-5 space-y-6">{children}</div>
        <div className="flex justify-end border-t border-zinc-800 px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors">Done</button>
        </div>
      </div>
    </div>
  );
}

// ── Summary: totals, by-category spend, monthly snapshots (digital+consumable) ─
function SummaryStats({ privacy, digital, consumable, snapshots, onSnapshot }) {
  const digitalTotal = digital.filter((s) => s.active).reduce((t, s) => t + monthlyDigital(s), 0);
  const consumableTotal = consumable.filter((s) => s.active).reduce((t, s) => t + monthlyConsumable(s), 0);
  const grandTotal = digitalTotal + consumableTotal;

  const breakdown = categoryBreakdown(digital, consumable);
  const maxCat = breakdown.length ? breakdown[0].total : 0;

  const latest = snapshots[0] ?? null;
  const current = buildSnapshot(digital, consumable);
  const diff = diffSnapshots(current, latest);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Digital / mo" value={fmt(digitalTotal)} privacy={privacy} tone="text-pink-400" />
        <StatCard label="Consumables / mo" value={fmt(consumableTotal)} privacy={privacy} tone="text-emerald-400" />
        <StatCard label="Total subs / mo" value={fmt(grandTotal)} privacy={privacy} tone="text-blue-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Spend by category (active, both tables) */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">Spend by category</h2>
            <span className="text-[11px] text-zinc-600">active · digital + consumable · monthly</span>
          </div>
          {breakdown.length === 0 ? (
            <p className="text-sm text-zinc-600">No active subscriptions yet.</p>
          ) : (
            <div className="space-y-2.5">
              {breakdown.map(({ category, total }) => (
                <div key={category}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-zinc-300 truncate mr-2">{category}</span>
                    <span className="flex items-center gap-2 shrink-0 tabular-nums text-zinc-400">
                      <span className="text-[11px] text-zinc-600">{grandTotal ? Math.round((total / grandTotal) * 100) : 0}%</span>
                      <Redacted on={privacy}>{fmtDec(total)}</Redacted>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-pink-500 to-violet-500" style={{ width: `${maxCat ? (total / maxCat) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Change over time (monthly snapshots) */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">Change over time</h2>
            <button onClick={onSnapshot} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-600 bg-emerald-900/30 text-xs font-medium text-emerald-400 hover:bg-emerald-900/50 transition-colors">
              <Camera size={13} /> Snapshot this month
            </button>
          </div>

          {!latest ? (
            <p className="text-sm text-zinc-600">No snapshots yet. Take one to start tracking how your subscriptions change month to month.</p>
          ) : (
            <div className="space-y-4">
              <div className="text-xs text-zinc-500">
                Compared to <span className="text-zinc-300">{latest.label || fmtDate(latest.taken_on)}</span> ({fmtDate(latest.taken_on)})
              </div>

              {diff && (
                <>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-zinc-400">Monthly change:</span>
                    <Redacted on={privacy}>
                      <span className={`inline-flex items-center gap-1 font-semibold tabular-nums ${
                        diff.totalDelta > 0.005 ? 'text-red-400' : diff.totalDelta < -0.005 ? 'text-emerald-400' : 'text-zinc-400'
                      }`}>
                        {diff.totalDelta > 0.005 ? <ArrowUp size={13} /> : diff.totalDelta < -0.005 ? <ArrowDown size={13} /> : null}
                        {fmtDec(Math.abs(diff.totalDelta))}
                      </span>
                    </Redacted>
                  </div>

                  <DeltaList title="Added" items={diff.added} tone="text-emerald-400" privacy={privacy} />
                  <DeltaList title="Dropped" items={diff.removed} tone="text-red-400" privacy={privacy} />
                  {diff.changed.length > 0 && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">Price changed</p>
                      <ul className="space-y-1">
                        {diff.changed.map((i) => (
                          <li key={`${i.kind}:${i.name}`} className="flex items-center justify-between text-sm">
                            <span className="text-zinc-300 truncate mr-2">{i.name}</span>
                            <Redacted on={privacy}><span className="tabular-nums text-zinc-400 text-xs">{fmtDec(i.from)} → {fmtDec(i.to)}</span></Redacted>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}

              <p className="text-[11px] text-zinc-600">{snapshots.length} snapshot{snapshots.length === 1 ? '' : 's'} saved.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function DeltaList({ title, items, tone, privacy }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">{title} ({items.length})</p>
      <ul className="space-y-1">
        {items.map((i) => (
          <li key={`${i.kind}:${i.name}`} className="flex items-center justify-between text-sm">
            <span className={`truncate mr-2 ${tone}`}>{i.name}<span className="text-[10px] text-zinc-600 ml-1.5">{i.kind}</span></span>
            <Redacted on={privacy}><span className="tabular-nums text-zinc-500 text-xs">{fmtDec(i.monthly)}/mo</span></Redacted>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatCard({ label, value, privacy, tone = 'text-white' }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <Redacted on={privacy}><span className={`text-xl font-bold tabular-nums ${tone}`}>{value}</span></Redacted>
    </div>
  );
}
