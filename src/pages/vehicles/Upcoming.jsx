import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, Trash2, X } from 'lucide-react';
import {
  fetchServicePlan, fetchFuelLogs, fetchServiceVisits, fetchServiceItemsForVisits,
  upsertServicePlanRow, deleteRow,
} from '../../lib/vehicles';
import { fmt, fmtDate } from '../cashflow/format';
import { Th, Td, StateRow, LoadErrorRow } from '../cashflow/tableparts';
import { CardList, Card, CardField, CardState, CardLoadError } from '../cashflow/cardparts';
import { makeToggleSort, sortRows } from '../cashflow/sorting';
import { Field, ModalEdit, MoreDetails } from '../cashflow/ModalField';
import { notifyError } from '../cashflow/toast';
import {
  estimatedOdometer, milesPerDay, serviceDue, costPerYear, lastServiceFromLog, avgCostFromLog,
} from './vehicleCalc';

const STATUS_COLOR = {
  overdue: { color: 'hsl(0 85% 70%)', background: 'hsl(0 80% 45% / 0.22)' },
  soon:    { color: 'hsl(45 85% 65%)', background: 'hsl(45 80% 45% / 0.18)' },
  ok:      { color: 'hsl(120 70% 55%)', background: 'hsl(120 70% 45% / 0.15)' },
};
const STATUS_DOT = { overdue: '#ef4444', soon: '#eab308', ok: '#22c55e' };

const SORT_ACCESSORS = {
  service:  (r) => (r.service || '').toLowerCase(),
  interval: (r) => r.interval_miles,
  last:     (r) => r.last_completed_date,
  milesDue: (r) => r.due.milesDue,
  timeDue:  (r) => r.due.timeDue,
  eta:      (r) => r.due.eta,
  avgCost:  (r) => r.avg_cost,
  costYr:   (r) => r.costPerYear,
};

// Default view: soonest-due first — the whole point of this tab is "what
// needs attention next". Nulls (no due date at all) sort last regardless of
// direction, same as sortRows' general null-handling.
const DEFAULT_SORT = { key: 'eta', dir: 'asc' };

export default function Upcoming() {
  const { vehicleId, vehicles, setPageMenuItems } = useOutletContext();
  const [plan, setPlan] = useState([]);
  const [fuelLogs, setFuelLogs] = useState([]);
  const [visits, setVisits] = useState([]);
  const [itemsByVisit, setItemsByVisit] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [sort, setSort] = useState(DEFAULT_SORT);

  useEffect(() => { if (setPageMenuItems) setPageMenuItems([]); }, [setPageMenuItems]);

  useEffect(() => {
    if (!vehicleId) return;
    let active = true;
    Promise.all([
      fetchServicePlan(vehicleId), fetchFuelLogs(vehicleId), fetchServiceVisits(vehicleId),
    ]).then(async ([p, f, v]) => {
      if (!active) return;
      if (p.error || f.error || v.error) { setError(p.error || f.error || v.error); setLoading(false); return; }
      setError(null);
      if (p.data) setPlan(p.data);
      if (f.data) setFuelLogs(f.data);
      setVisits(v.data || []);
      const { data: items } = await fetchServiceItemsForVisits((v.data || []).map((x) => x.id));
      if (!active) return;
      const grouped = {};
      for (const it of items || []) (grouped[it.visit_id] ||= []).push(it);
      setItemsByVisit(grouped);
      setLoading(false);
    });
    return () => { active = false; };
  }, [vehicleId, reloadKey]);

  const reload = () => { setLoading(true); setError(null); setReloadKey((k) => k + 1); };

  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const mpd = milesPerDay(fuelLogs, { override: vehicle?.miles_per_day_override });
  const estOdo = estimatedOdometer(fuelLogs, new Date(), { override: vehicle?.miles_per_day_override });

  const update = async (id, field, value) => {
    const prevValue = plan.find((r) => r.id === id)?.[field];
    setPlan((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    const { error: err } = await upsertServicePlanRow({ id, [field]: value });
    if (err) {
      setPlan((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: prevValue } : r)));
      notifyError('Couldn’t save that change — reverted. Please retry.');
    }
  };

  const add = async () => {
    const { data, error: err } = await upsertServicePlanRow({
      vehicle_id: vehicleId, service: 'New Service', enabled: true, sort_order: plan.length,
    });
    if (err || !data?.[0]) { notifyError('Couldn’t add the service. Please retry.'); return; }
    setPlan((prev) => [...prev, data[0]]);
  };

  const remove = async (id) => {
    const snapshot = plan;
    setPlan((prev) => prev.filter((r) => r.id !== id));
    const { error: err } = await deleteRow('veh_service_plan', id);
    if (err) { setPlan(snapshot); notifyError('Couldn’t delete that service — restored. Please retry.'); }
  };

  // "Last done" prefers a real Service Log entry over the plan row's stored
  // last_completed_date/last_odometer (which is only the workbook-import
  // seed, or a manual placeholder for a service never logged yet) — so
  // logging a visit in the Service Log with a matching line item is what
  // moves this tab's due dates forward, no separate "mark completed" step.
  const rowsWithDue = plan.map((r) => {
    const logged = lastServiceFromLog(r.service, visits, itemsByVisit);
    const merged = logged
      ? { ...r, last_completed_date: logged.date, last_odometer: logged.odometer }
      : r;
    // Avg cost: prefer the real average from logged visits over the manual
    // avg_cost field, which is only a fallback for services never logged yet
    // (or the initial workbook-import figure).
    const avgCostLogged = avgCostFromLog(r.service, visits, itemsByVisit);
    const effectiveAvgCost = avgCostLogged ?? r.avg_cost;
    const withAvgCost = { ...merged, avg_cost: effectiveAvgCost };
    return {
      ...withAvgCost,
      avgCostLogged,
      due: serviceDue(withAvgCost, { estOdo, milesPerDay: mpd }),
      costPerYear: costPerYear(withAvgCost, mpd),
    };
  });
  const toggleSort = makeToggleSort(setSort, () => {});
  const sorted = sortRows(rowsWithDue, sort, SORT_ACCESSORS);
  const dueNowCount = rowsWithDue.filter((r) => r.due.status === 'overdue').length;

  if (!vehicleId) {
    return <p className="text-sm text-zinc-500">No vehicle selected yet.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Estimated odometer" value={estOdo != null ? Math.round(estOdo).toLocaleString() : '—'} tone="text-cyan-400" />
        <StatCard label="Miles / day" value={mpd != null ? mpd.toFixed(1) : '—'} tone="text-zinc-300" />
        <StatCard label="Due now" value={String(dueNowCount)} tone={dueNowCount > 0 ? 'text-red-400' : 'text-emerald-400'} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Upcoming Services</h2>
          <p className="text-xs text-zinc-500 mt-0.5">{plan.length} scheduled services</p>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-600 bg-emerald-900/30 text-sm font-medium text-emerald-400 hover:bg-emerald-900/50 transition-colors">
          <Plus size={15} /> Add service
        </button>
      </div>

      <div className="hidden md:block rounded-xl border border-zinc-800 bg-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-500">
              <Th />
              <Th sortKey="service" sort={sort} onSort={toggleSort}>Service</Th>
              <Th sortKey="interval" sort={sort} onSort={toggleSort} align="right">Interval (mo / mi)</Th>
              <Th sortKey="last" sort={sort} onSort={toggleSort}>Last done</Th>
              <Th sortKey="milesDue" sort={sort} onSort={toggleSort} align="right">Due at (odo)</Th>
              <Th sortKey="timeDue" sort={sort} onSort={toggleSort}>Due by</Th>
              <Th sortKey="eta" sort={sort} onSort={toggleSort}>ETA</Th>
              <Th sortKey="avgCost" sort={sort} onSort={toggleSort} align="right">Avg cost</Th>
              <Th sortKey="costYr" sort={sort} onSort={toggleSort} align="right">Cost/yr</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <StateRow colSpan={10}>Loading…</StateRow>
            ) : error ? (
              <LoadErrorRow colSpan={10} onRetry={reload} />
            ) : sorted.length === 0 ? (
              <StateRow colSpan={10}>No scheduled services yet — add one.</StateRow>
            ) : sorted.map((r) => {
              const sc = STATUS_COLOR[r.due.status];
              return (
                <tr key={r.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 group">
                  <Td><span className="h-2 w-2 rounded-full inline-block" style={{ background: STATUS_DOT[r.due.status] }} title={r.due.status} /></Td>
                  <Td>
                    <button
                      onClick={() => setEditingId(r.id)}
                      className="text-left font-medium text-zinc-200 hover:text-emerald-400 transition-colors"
                    >
                      {r.service || 'Service'}
                    </button>
                  </Td>
                  <Td className="text-right tabular-nums text-zinc-400">
                    {r.interval_months ?? '—'}mo / {r.interval_miles?.toLocaleString() ?? '—'}mi
                  </Td>
                  <Td className="tabular-nums text-zinc-400">
                    {fmtDate(r.last_completed_date)}{r.last_odometer != null && <span className="text-zinc-600"> @ {Math.round(r.last_odometer).toLocaleString()}</span>}
                  </Td>
                  <Td className="text-right tabular-nums text-zinc-300">{r.due.milesDue != null ? Math.round(r.due.milesDue).toLocaleString() : '—'}</Td>
                  <Td className="tabular-nums text-zinc-300">{r.due.timeDue ? fmtDate(r.due.timeDue) : '—'}</Td>
                  <Td className="tabular-nums">
                    <span className="rounded px-1.5 py-0.5 font-medium" style={sc}>{r.due.eta ? fmtDate(r.due.eta) : '—'}</span>
                  </Td>
                  <Td className="text-right tabular-nums text-zinc-400">{r.avg_cost != null ? fmt(r.avg_cost) : '—'}</Td>
                  <Td className="text-right tabular-nums text-zinc-500">{r.costPerYear != null ? fmt(r.costPerYear) : '—'}</Td>
                  <Td className="text-right">
                    <button onClick={() => remove(r.id)} aria-label={`Delete ${r.service || 'service'}`} title="Delete" className="opacity-100 sm:opacity-0 sm:group-hover:opacity-40 hover:!opacity-100 text-red-400 transition-opacity"><Trash2 size={13} /></button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <CardList>
        {loading ? (
          <CardState>Loading…</CardState>
        ) : error ? (
          <CardLoadError onRetry={reload} />
        ) : sorted.length === 0 ? (
          <CardState>No scheduled services yet — add one.</CardState>
        ) : sorted.map((r) => (
          <Card
            key={r.id}
            dotColor={STATUS_DOT[r.due.status]}
            title={r.service || 'Service'}
            deleteLabel={`Delete ${r.service || 'service'}`}
            onOpen={() => setEditingId(r.id)}
            onDelete={() => remove(r.id)}
            headline={<span className="text-sm font-semibold tabular-nums" style={{ color: STATUS_COLOR[r.due.status]?.color }}>{r.due.eta ? fmtDate(r.due.eta) : '—'}</span>}
          >
            <CardField label="Interval">{r.interval_months ?? '—'}mo / {r.interval_miles?.toLocaleString() ?? '—'}mi</CardField>
            <CardField label="Avg cost">{r.avg_cost != null ? fmt(r.avg_cost) : '—'}</CardField>
            <CardField label="Cost/yr">{r.costPerYear != null ? fmt(r.costPerYear) : '—'}</CardField>
            <CardField label="Last done" full>{fmtDate(r.last_completed_date)}{r.last_odometer != null && ` @ ${Math.round(r.last_odometer).toLocaleString()}`}</CardField>
            <CardField label="Due at (odo)">{r.due.milesDue != null ? Math.round(r.due.milesDue).toLocaleString() : '—'}</CardField>
            <CardField label="Due by">{r.due.timeDue ? fmtDate(r.due.timeDue) : '—'}</CardField>
          </Card>
        ))}
      </CardList>

      {editingId && (
        <ServiceModal
          row={plan.find((r) => r.id === editingId)}
          computed={rowsWithDue.find((r) => r.id === editingId)}
          onChange={update}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, tone = 'text-white' }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <span className={`text-xl font-bold tabular-nums ${tone}`}>{value}</span>
    </div>
  );
}

function ServiceModal({ row, computed, onChange, onClose }) {
  if (!row) return null;
  const set = (field) => (v) => onChange(row.id, field, v);
  const avgCostLogged = computed?.avgCostLogged;
  const costPerYearValue = computed?.costPerYear;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h3 className="text-base font-semibold text-white truncate">{row.service || 'Service'}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors"><X size={18} /></button>
        </div>
        <div className="px-5 py-5 space-y-6">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-emerald-500/80 mb-3">Key fields</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
              <Field label="Service"><ModalEdit value={row.service} onCommit={set('service')} /></Field>
              <Field label="Enabled"><ModalEdit type="checkbox" value={row.enabled} onCommit={set('enabled')} /></Field>
              <Field label="Interval (months)"><ModalEdit type="number" value={row.interval_months} onCommit={set('interval_months')} /></Field>
              <Field label="Interval (miles)"><ModalEdit type="number" value={row.interval_miles} onCommit={set('interval_miles')} /></Field>
              <Field label="Avg cost (from Service Log)">
                <span className="text-sm font-semibold text-emerald-400 tabular-nums">
                  {avgCostLogged != null ? fmt(avgCostLogged) : 'Not logged yet'}
                </span>
              </Field>
              <Field label="Cost per year">
                <span className="text-sm font-semibold text-emerald-400 tabular-nums">
                  {costPerYearValue != null ? fmt(costPerYearValue) : '—'}
                </span>
              </Field>
            </div>
          </div>
          <p className="text-xs text-zinc-500 -mt-2">
            Last done and average cost update automatically from the Service Log — log a visit with a
            matching item here, instead of setting them manually.
          </p>
          <MoreDetails>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
              <Field label="Notes"><ModalEdit value={row.notes} onCommit={set('notes')} /></Field>
              <Field label="Avg cost (manual — used until logged)">
                <ModalEdit type="currency" value={row.avg_cost} onCommit={set('avg_cost')} />
              </Field>
              <Field label="Last completed date (manual — used until logged)">
                <ModalEdit type="date" value={row.last_completed_date} onCommit={set('last_completed_date')} />
              </Field>
              <Field label="Last odometer (manual — used until logged)">
                <ModalEdit type="number" value={row.last_odometer} onCommit={set('last_odometer')} />
              </Field>
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
