import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, Trash2, Maximize2, X } from 'lucide-react';
import { fetchFuelLogs, upsertFuelLog, deleteRow } from '../../lib/vehicles';
import { fmt, fmtDec, fmtDate, todayISO } from '../cashflow/format';
import EditCell from '../cashflow/EditCell';
import { Th, Td, StateRow, LoadErrorRow } from '../cashflow/tableparts';
import { CardList, Card, CardField, CardState, CardLoadError } from '../cashflow/cardparts';
import { makeToggleSort, sortRows } from '../cashflow/sorting';
import { Field, ModalEdit, MoreDetails, AmountEdit } from '../cashflow/ModalField';
import { notifyError } from '../cashflow/toast';
import { fuelStats } from './vehicleCalc';

const SORT_ACCESSORS = {
  fill_date: (l) => l.fill_date,
  odometer:  (l) => l.odometer,
  gallons:   (l) => l.gallons,
  total_cost: (l) => l.total_cost,
  ppg:       (l) => l.pricePerGallon,
  miles:     (l) => l.miles,
  mpg:       (l) => l.mpg,
};

export default function FuelLog() {
  const { vehicleId, setPageMenuItems } = useOutletContext();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [sort, setSort] = useState({ key: 'fill_date', dir: 'desc' });

  useEffect(() => { if (setPageMenuItems) setPageMenuItems([]); }, [setPageMenuItems]);

  useEffect(() => {
    if (!vehicleId) return;
    let active = true;
    fetchFuelLogs(vehicleId).then(({ data, error: err }) => {
      if (!active) return;
      if (err) setError(err);
      else { setError(null); setLogs(data || []); }
      setLoading(false);
    });
    return () => { active = false; };
  }, [vehicleId, reloadKey]);

  const reload = () => { setLoading(true); setError(null); setReloadKey((k) => k + 1); };

  const update = async (id, field, value) => {
    const prevValue = logs.find((l) => l.id === id)?.[field];
    setLogs((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
    const { error: err } = await upsertFuelLog({ id, [field]: value });
    if (err) {
      setLogs((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: prevValue } : l)));
      notifyError('Couldn’t save that change — reverted. Please retry.');
    }
  };

  const add = async () => {
    const { data, error: err } = await upsertFuelLog({
      vehicle_id: vehicleId, fill_date: todayISO(), odometer: 0, gallons: 0, total_cost: 0,
    });
    if (err || !data?.[0]) { notifyError('Couldn’t add the fill-up. Please retry.'); return; }
    setLogs((prev) => [data[0], ...prev]);
  };

  const remove = async (id) => {
    const snapshot = logs;
    setLogs((prev) => prev.filter((l) => l.id !== id));
    const { error: err } = await deleteRow('veh_fuel_logs', id);
    if (err) { setLogs(snapshot); notifyError('Couldn’t delete that fill-up — restored. Please retry.'); }
  };

  const stats = fuelStats(logs); // ascending, with derived miles/mpg/ppg
  const byId = new Map(stats.map((s) => [s.id, s]));
  const rows = logs.map((l) => ({ ...l, ...(byId.get(l.id) || {}) }));
  const toggleSort = makeToggleSort(setSort, () => {});
  const sorted = sortRows(rows, sort, SORT_ACCESSORS);

  // Header strip stats
  const last = stats[stats.length - 1];
  const recentWithMpg = stats.filter((s) => s.mpg != null).slice(-10);
  const rollingMpg = recentWithMpg.length ? recentWithMpg.reduce((s, l) => s + l.mpg, 0) / recentWithMpg.length : null;
  const recentPpg = stats.filter((s) => s.pricePerGallon != null).slice(-5);
  const ppgTrend = recentPpg.length ? recentPpg.reduce((s, l) => s + l.pricePerGallon, 0) / recentPpg.length : null;
  const cutoff = todayISO();
  const cutoffDate = new Date(cutoff);
  cutoffDate.setDate(cutoffDate.getDate() - 30);
  const spend30 = stats.filter((s) => new Date(s.fill_date) >= cutoffDate).reduce((s, l) => s + (l.total_cost || 0), 0);

  if (!vehicleId) {
    return <p className="text-sm text-zinc-500">No vehicle selected yet.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Last fill" value={last ? fmtDate(last.fill_date) : '—'} tone="text-zinc-300" />
        <StatCard label="Rolling MPG" value={rollingMpg != null ? rollingMpg.toFixed(1) : '—'} tone="text-emerald-400" />
        <StatCard label="$/gal trend" value={ppgTrend != null ? fmtDec(ppgTrend) : '—'} tone="text-amber-400" />
        <StatCard label="Spend (30d)" value={fmt(spend30)} tone="text-cyan-400" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Fuel Log</h2>
          <p className="text-xs text-zinc-500 mt-0.5">{logs.length} fill-ups</p>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-600 bg-emerald-900/30 text-sm font-medium text-emerald-400 hover:bg-emerald-900/50 transition-colors">
          <Plus size={15} /> Add fill-up
        </button>
      </div>

      <div className="hidden md:block rounded-xl border border-zinc-800 bg-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-500">
              <Th sortKey="fill_date" sort={sort} onSort={toggleSort}>Date</Th>
              <Th sortKey="odometer" sort={sort} onSort={toggleSort} align="right">Odometer</Th>
              <Th sortKey="gallons" sort={sort} onSort={toggleSort} align="right">Gallons</Th>
              <Th sortKey="total_cost" sort={sort} onSort={toggleSort} align="right">Total</Th>
              <Th sortKey="ppg" sort={sort} onSort={toggleSort} align="right">$/gal</Th>
              <Th sortKey="miles" sort={sort} onSort={toggleSort} align="right">Miles</Th>
              <Th sortKey="mpg" sort={sort} onSort={toggleSort} align="right">MPG</Th>
              <Th>Notes</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <StateRow colSpan={9}>Loading…</StateRow>
            ) : error ? (
              <LoadErrorRow colSpan={9} onRetry={reload} />
            ) : sorted.length === 0 ? (
              <StateRow colSpan={9}>No fill-ups yet — add one.</StateRow>
            ) : sorted.map((l) => (
              <tr key={l.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 group">
                <Td className="tabular-nums"><EditCell type="date" value={l.fill_date} onSave={(v) => update(l.id, 'fill_date', v)} display={fmtDate} className="text-zinc-300" /></Td>
                <Td className="text-right tabular-nums"><EditCell type="number" value={l.odometer} onSave={(v) => update(l.id, 'odometer', v)} className="text-zinc-400" /></Td>
                <Td className="text-right tabular-nums"><EditCell type="number" value={l.gallons} onSave={(v) => update(l.id, 'gallons', v)} className="text-zinc-400" /></Td>
                <Td className="text-right"><AmountEdit value={l.total_cost} onCommit={(v) => update(l.id, 'total_cost', v)} className="text-zinc-200 font-medium" /></Td>
                <Td className="text-right tabular-nums text-zinc-500">{l.pricePerGallon != null ? fmtDec(l.pricePerGallon) : '—'}</Td>
                <Td className="text-right tabular-nums text-zinc-500">{l.miles != null ? Math.round(l.miles) : '—'}</Td>
                <Td className="text-right tabular-nums text-zinc-300">{l.mpg != null ? l.mpg.toFixed(1) : '—'}</Td>
                <Td>
                  <span className="flex items-center gap-2">
                    <button onClick={() => setEditingId(l.id)} title="Open full editor" className="text-zinc-600 hover:text-emerald-400 transition-colors shrink-0"><Maximize2 size={13} /></button>
                    <EditCell value={l.notes} onSave={(v) => update(l.id, 'notes', v)} className="text-zinc-500" />
                  </span>
                </Td>
                <Td className="text-right">
                  <button onClick={() => remove(l.id)} aria-label="Delete fill-up" title="Delete" className="opacity-100 sm:opacity-0 sm:group-hover:opacity-40 hover:!opacity-100 text-red-400 transition-opacity"><Trash2 size={13} /></button>
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
          <CardState>No fill-ups yet — add one.</CardState>
        ) : sorted.map((l) => (
          <Card
            key={l.id}
            dotColor="#f59e0b"
            title={fmtDate(l.fill_date)}
            deleteLabel="Delete fill-up"
            onOpen={() => setEditingId(l.id)}
            onDelete={() => remove(l.id)}
            headline={<span className="text-sm font-semibold text-emerald-400 tabular-nums">{fmt(l.total_cost)}</span>}
          >
            <CardField label="Odometer">{l.odometer != null ? Math.round(l.odometer).toLocaleString() : '—'}</CardField>
            <CardField label="Gallons">{l.gallons ?? '—'}</CardField>
            <CardField label="$/gal">{l.pricePerGallon != null ? fmtDec(l.pricePerGallon) : '—'}</CardField>
            <CardField label="MPG">{l.mpg != null ? l.mpg.toFixed(1) : '—'}</CardField>
          </Card>
        ))}
      </CardList>

      {editingId && (
        <FuelModal log={logs.find((l) => l.id === editingId)} onChange={update} onClose={() => setEditingId(null)} />
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

function FuelModal({ log, onChange, onClose }) {
  if (!log) return null;
  const set = (field) => (v) => onChange(log.id, field, v);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h3 className="text-base font-semibold text-white">{fmtDate(log.fill_date)}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors"><X size={18} /></button>
        </div>
        <div className="px-5 py-5 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
            <Field label="Date"><ModalEdit type="date" value={log.fill_date} onCommit={set('fill_date')} /></Field>
            <Field label="Odometer"><ModalEdit type="number" value={log.odometer} onCommit={set('odometer')} /></Field>
            <Field label="Gallons"><ModalEdit type="number" value={log.gallons} onCommit={set('gallons')} /></Field>
            <Field label="Total cost"><ModalEdit type="currency" value={log.total_cost} onCommit={set('total_cost')} /></Field>
            <Field label="Partial fill"><ModalEdit type="checkbox" value={log.partial_fill} onCommit={set('partial_fill')} /></Field>
          </div>
          <MoreDetails>
            <div className="grid grid-cols-1 gap-y-4">
              <Field label="Notes"><ModalEdit value={log.notes} onCommit={set('notes')} /></Field>
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
