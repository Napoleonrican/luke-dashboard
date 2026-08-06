import { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, Trash2, X } from 'lucide-react';
import {
  fetchServiceVisits, fetchServiceItemsForVisits, fetchServicePlan, upsertServiceVisit,
  upsertServiceItem, deleteRow,
} from '../../lib/vehicles';
import { fmt, fmtDate, todayISO } from '../cashflow/format';
import EditCell from '../cashflow/EditCell';
import { Th, Td, StateRow, LoadErrorRow } from '../cashflow/tableparts';
import { CardList, Card, CardField, CardState, CardLoadError } from '../cashflow/cardparts';
import { makeToggleSort, sortRows } from '../cashflow/sorting';
import { Field, ModalEdit, MoreDetails, AmountEdit } from '../cashflow/ModalField';
import { notifyError } from '../cashflow/toast';
import { summarizeItems } from './vehicleCalc';

const SORT_ACCESSORS = {
  service_date: (v) => v.service_date,
  odometer:     (v) => v.odometer,
  summary:      (v) => (v.summary || '').toLowerCase(),
  items:        (v) => v.itemCount,
  total_cost:   (v) => v.total_cost,
};

// Every real shop visit tends to carry a labor charge and a shop-supplies/tax
// line, so new visits seed these two automatically instead of making Luke
// re-add them every time. These aren't scheduled maintenance (no interval),
// so they don't belong on the Upcoming tab's plan.
const ALWAYS_ON_VISIT = ['Labor', 'Shop Supplies, Taxes, & Misc.'];

// Dropdown catalog = the vehicle's scheduled services + the always-on items +
// a standing "General Repair" catch-all — so a genuine one-off never needs
// free-text entry (no "Custom…" escape hatch to maintain).
const CATALOG_EXTRAS = [...ALWAYS_ON_VISIT, 'General Repair'];

export default function ServiceLog() {
  const { vehicleId, setPageMenuItems } = useOutletContext();
  const [visits, setVisits] = useState([]);
  const [itemsByVisit, setItemsByVisit] = useState({});
  const [planRows, setPlanRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [sort, setSort] = useState(null);

  useEffect(() => { if (setPageMenuItems) setPageMenuItems([]); }, [setPageMenuItems]);

  useEffect(() => {
    if (!vehicleId) return;
    let active = true;
    fetchServiceVisits(vehicleId).then(async ({ data, error: err }) => {
      if (!active) return;
      if (err) { setError(err); setLoading(false); return; }
      setError(null);
      setVisits(data || []);
      const ids = (data || []).map((v) => v.id);
      const { data: items } = await fetchServiceItemsForVisits(ids);
      if (!active) return;
      const grouped = {};
      for (const it of items || []) {
        (grouped[it.visit_id] ||= []).push(it);
      }
      setItemsByVisit(grouped);
      setLoading(false);
    });
    fetchServicePlan(vehicleId).then(({ data }) => { if (active) setPlanRows(data || []); });
    return () => { active = false; };
  }, [vehicleId, reloadKey]);

  const reload = () => { setLoading(true); setError(null); setReloadKey((k) => k + 1); };

  const update = async (id, field, value) => {
    const prevValue = visits.find((v) => v.id === id)?.[field];
    setVisits((prev) => prev.map((v) => (v.id === id ? { ...v, [field]: value } : v)));
    const { error: err } = await upsertServiceVisit({ id, [field]: value });
    if (err) {
      setVisits((prev) => prev.map((v) => (v.id === id ? { ...v, [field]: prevValue } : v)));
      notifyError('Couldn’t save that change — reverted. Please retry.');
    }
  };

  const add = async () => {
    const { data, error: err } = await upsertServiceVisit({
      vehicle_id: vehicleId, service_date: todayISO(), total_cost: 0, sort_order: visits.length,
    });
    if (err || !data?.[0]) { notifyError('Couldn’t add the visit. Please retry.'); return; }
    const visit = data[0];
    setVisits((prev) => [visit, ...prev]);
    const seeded = await Promise.all(
      ALWAYS_ON_VISIT.map((service_type, i) => upsertServiceItem({ visit_id: visit.id, service_type, cost: 0, sort_order: i })),
    );
    const seededItems = seeded.map((r) => r.data?.[0]).filter(Boolean);
    if (seededItems.length) {
      setItemsByVisit((prev) => ({ ...prev, [visit.id]: seededItems }));
      update(visit.id, 'summary', summarizeItems(seededItems));
    }
    setEditingId(visit.id);
  };

  const remove = async (id) => {
    const snapshot = visits;
    setVisits((prev) => prev.filter((v) => v.id !== id));
    const { error: err } = await deleteRow('veh_service_visits', id);
    if (err) { setVisits(snapshot); notifyError('Couldn’t delete that visit — restored. Please retry.'); }
  };

  // Called by the modal whenever its line items change — recomputes and
  // persists the visit total AND summary (the top-3-by-cost line items) so
  // the log table always reflects what's actually been logged, with no
  // manual name to keep in sync.
  const onItemsChange = (visitId, items) => {
    setItemsByVisit((prev) => ({ ...prev, [visitId]: items }));
    const total = Math.round(items.reduce((s, i) => s + (i.cost || 0), 0) * 100) / 100;
    update(visitId, 'total_cost', total);
    update(visitId, 'summary', summarizeItems(items));
  };

  const rows = visits.map((v) => ({ ...v, itemCount: (itemsByVisit[v.id] || []).length }));
  const toggleSort = makeToggleSort(setSort, () => {});
  const sorted = sortRows(rows, sort, SORT_ACCESSORS);

  if (!vehicleId) {
    return <p className="text-sm text-zinc-500">No vehicle selected yet.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Service Log</h2>
          <p className="text-xs text-zinc-500 mt-0.5">{visits.length} visits</p>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-600 bg-emerald-900/30 text-sm font-medium text-emerald-400 hover:bg-emerald-900/50 transition-colors">
          <Plus size={15} /> Add visit
        </button>
      </div>

      <div className="hidden md:block rounded-xl border border-zinc-800 bg-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-500">
              <Th sortKey="service_date" sort={sort} onSort={toggleSort}>Date</Th>
              <Th sortKey="odometer" sort={sort} onSort={toggleSort} align="right">Odometer</Th>
              <Th sortKey="summary" sort={sort} onSort={toggleSort}>Summary</Th>
              <Th sortKey="items" sort={sort} onSort={toggleSort} align="right">Items</Th>
              <Th sortKey="total_cost" sort={sort} onSort={toggleSort} align="right">Total</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <StateRow colSpan={6}>Loading…</StateRow>
            ) : error ? (
              <LoadErrorRow colSpan={6} onRetry={reload} />
            ) : sorted.length === 0 ? (
              <StateRow colSpan={6}>No service visits yet — add one.</StateRow>
            ) : sorted.map((v) => (
              <tr key={v.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 group">
                <Td className="tabular-nums"><EditCell type="date" value={v.service_date} onSave={(x) => update(v.id, 'service_date', x)} display={fmtDate} className="text-zinc-300" /></Td>
                <Td className="text-right tabular-nums"><EditCell type="number" value={v.odometer} onSave={(x) => update(v.id, 'odometer', x)} className="text-zinc-400" /></Td>
                <Td>
                  <button onClick={() => setEditingId(v.id)} className="text-left font-medium text-zinc-200 hover:text-emerald-400 transition-colors">
                    {v.summary || 'Service visit'}
                  </button>
                </Td>
                <Td className="text-right tabular-nums text-zinc-500">{v.itemCount}</Td>
                <Td className="text-right"><AmountEdit value={v.total_cost} onCommit={(x) => update(v.id, 'total_cost', x)} className="text-zinc-200 font-medium" /></Td>
                <Td className="text-right">
                  <button onClick={() => remove(v.id)} aria-label="Delete visit" title="Delete" className="opacity-100 sm:opacity-0 sm:group-hover:opacity-40 hover:!opacity-100 text-red-400 transition-opacity"><Trash2 size={13} /></button>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CardList>
        {loading ? (
          <CardState>Loading…</CardState>
        ) : error ? (
          <CardLoadError onRetry={reload} />
        ) : sorted.length === 0 ? (
          <CardState>No service visits yet — add one.</CardState>
        ) : sorted.map((v) => (
          <Card
            key={v.id}
            dotColor="#8b5cf6"
            title={v.summary || 'Service visit'}
            deleteLabel="Delete visit"
            onOpen={() => setEditingId(v.id)}
            onDelete={() => remove(v.id)}
            headline={<span className="text-sm font-semibold text-emerald-400 tabular-nums">{fmt(v.total_cost)}</span>}
          >
            <CardField label="Date">{fmtDate(v.service_date)}</CardField>
            <CardField label="Odometer">{v.odometer != null ? Math.round(v.odometer).toLocaleString() : '—'}</CardField>
            <CardField label="Items">{v.itemCount}</CardField>
          </Card>
        ))}
      </CardList>

      {editingId && (
        <VisitModal
          visit={visits.find((v) => v.id === editingId)}
          items={itemsByVisit[editingId] || []}
          planRows={planRows}
          onChangeVisit={update}
          onChangeItems={(items) => onItemsChange(editingId, items)}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}

// Detail surface: visit key fields on top, then a repeating line-item editor
// whose sum drives the visit total (and, via the parent's onItemsChange,
// the summary), then notes. Each item's service picks from a dropdown (the
// vehicle's scheduled services + Labor/Shop Supplies/General Repair) so the
// text matches what the Upcoming tab looks for exactly — no typos, no
// near-duplicates, and no free-text escape hatch to maintain.
function VisitModal({ visit, items, planRows, onChangeVisit, onChangeItems, onClose }) {
  const catalog = useMemo(() => {
    const names = new Set([...planRows.map((r) => r.service).filter(Boolean), ...CATALOG_EXTRAS]);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [planRows]);

  if (!visit) return null;
  const set = (field) => (v) => onChangeVisit(visit.id, field, v);

  // These follow the same optimistic-update-with-rollback pattern as the
  // visit-level update/add/remove above. Rolling back matters more here than it
  // looks: onChangeItems is what recomputes and persists the visit's total_cost
  // and summary, so an item write that fails silently would leave a total saved
  // against line items that were never stored — the log would disagree with
  // itself on the next reload. Reverting to the pre-edit `items` array also
  // walks the derived total back to the right number.
  const updateItem = async (id, field, value) => {
    const snapshot = items;
    onChangeItems(items.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
    const { error: err } = await upsertServiceItem({ id, [field]: value });
    if (err) {
      onChangeItems(snapshot);
      notifyError('Couldn’t save that change — reverted. Please retry.');
    }
  };
  const addItem = async () => {
    const { data, error: err } = await upsertServiceItem({
      visit_id: visit.id, service_type: '', cost: 0, sort_order: items.length,
    });
    if (err || !data?.[0]) { notifyError('Couldn’t add that line item. Please retry.'); return; }
    onChangeItems([...items, data[0]]);
  };
  const removeItem = async (id) => {
    const snapshot = items;
    onChangeItems(items.filter((i) => i.id !== id));
    const { error: err } = await deleteRow('veh_service_items', id);
    if (err) {
      onChangeItems(snapshot);
      notifyError('Couldn’t delete that line item — restored. Please retry.');
    }
  };

  const itemsTotal = items.reduce((s, i) => s + (i.cost || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h3 className="text-base font-semibold text-white truncate">{visit.summary || 'Service visit'}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors"><X size={18} /></button>
        </div>
        <div className="px-5 py-5 space-y-6">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-emerald-500/80 mb-3">Key fields</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
              <Field label="Date"><ModalEdit type="date" value={visit.service_date} onCommit={set('service_date')} /></Field>
              <Field label="Odometer"><ModalEdit type="number" value={visit.odometer} onCommit={set('odometer')} /></Field>
              <Field label="Summary (from line items below)">
                <span className="text-sm text-zinc-300">{visit.summary || '—'}</span>
              </Field>
              <Field label="Total (derived from items below)">
                <span className="text-sm font-semibold text-emerald-400 tabular-nums">{fmt(itemsTotal)}</span>
              </Field>
              <Field label="DIY"><ModalEdit type="checkbox" value={visit.is_diy} onCommit={set('is_diy')} /></Field>
            </div>
          </div>

          <div className="border-t border-zinc-800 pt-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">Line items</p>
              <button onClick={addItem} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-600 bg-emerald-900/30 text-xs font-medium text-emerald-400 hover:bg-emerald-900/50 transition-colors">
                <Plus size={12} /> Add item
              </button>
            </div>
            <div className="space-y-2">
              {items.length === 0 ? (
                <p className="text-sm text-zinc-600">No line items yet — add one and pick what was done.</p>
              ) : items.map((i) => {
                // A legacy imported item whose name isn't in the current
                // catalog still gets a free-text box so it displays as-is;
                // everything else — including a brand-new blank row — gets
                // the dropdown.
                const legacyFreeText = i.service_type && !catalog.includes(i.service_type);
                return (
                  <div key={i.id} className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2.5 space-y-1.5">
                    <div className="flex items-center gap-2">
                      {legacyFreeText ? (
                        <EditCell value={i.service_type} onSave={(v) => updateItem(i.id, 'service_type', v)} className="flex-1 min-w-0 text-zinc-200 font-medium" placeholder="service type" />
                      ) : (
                        <select
                          value={i.service_type || ''}
                          onChange={(e) => updateItem(i.id, 'service_type', e.target.value)}
                          className="flex-1 min-w-0 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-sm text-white focus:border-emerald-600 focus:outline-none"
                        >
                          <option value="">— choose a service —</option>
                          {catalog.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      )}
                      <div className="w-24 shrink-0">
                        <AmountEdit value={i.cost} onCommit={(v) => updateItem(i.id, 'cost', v)} className="text-zinc-300" />
                      </div>
                      <button onClick={() => removeItem(i.id)} aria-label="Delete item" className="shrink-0 text-red-400/70 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
                    </div>
                    <EditCell value={i.notes} onSave={(v) => updateItem(i.id, 'notes', v)} className="block w-full text-zinc-500 text-xs" placeholder="notes" />
                  </div>
                );
              })}
            </div>
          </div>

          <MoreDetails>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
              <Field label="Notes"><ModalEdit value={visit.notes} onCommit={set('notes')} /></Field>
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
