import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { fetchFuelLogs, fetchServiceVisits } from '../../lib/vehicles';
import { fmt, fmtDec } from '../cashflow/format';
import { StateRow, LoadErrorRow } from '../cashflow/tableparts';
import { rollups } from './vehicleCalc';

// One hue per chart (magnitude, not identity) — see dataviz skill's
// color-formula: sequential/single-series data gets one consistent hue, never
// a rainbow. Values picked from the existing dashboard's dark-theme palette.
const HUE_MPG = '#10b981';     // emerald — efficiency
const HUE_COST = '#f59e0b';    // amber — spend
const HUE_MAINT = '#8b5cf6';   // violet — maintenance

const monthLabel = (key) => {
  const [y, m] = key.split('-');
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]} '${y.slice(2)}`;
};

const tooltipStyle = { background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 };

export default function Insights() {
  const { vehicleId, setPageMenuItems } = useOutletContext();
  const [fuelLogs, setFuelLogs] = useState([]);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => { if (setPageMenuItems) setPageMenuItems([]); }, [setPageMenuItems]);

  useEffect(() => {
    if (!vehicleId) return;
    let active = true;
    Promise.all([fetchFuelLogs(vehicleId), fetchServiceVisits(vehicleId)]).then(([f, v]) => {
      if (!active) return;
      if (f.error || v.error) setError(f.error || v.error);
      else { setError(null); setFuelLogs(f.data || []); setVisits(v.data || []); }
      setLoading(false);
    });
    return () => { active = false; };
  }, [vehicleId, reloadKey]);

  const reload = () => { setLoading(true); setError(null); setReloadKey((k) => k + 1); };

  if (!vehicleId) return <p className="text-sm text-zinc-500">No vehicle selected yet.</p>;
  if (loading) return <StateRow colSpan={1}>Loading…</StateRow>;
  if (error) return <LoadErrorRow colSpan={1} onRetry={reload} />;

  const r = rollups(fuelLogs, visits);
  const monthData = r.byMonth.slice(-24).map((m) => ({ ...m, label: monthLabel(m.key) }));
  const yearData = r.byYear.map((y) => ({ ...y, label: y.key }));
  const maintYearData = r.maintenanceByYear.map((y) => ({ ...y, label: y.key }));
  const weekData = r.byWeek.slice(-16).map((w) => ({ ...w, label: w.key.slice(5) }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatTile label="Lifetime MPG" value={r.lifetimeMPG != null ? r.lifetimeMPG.toFixed(1) : '—'} tone="text-emerald-400" />
        <StatTile label="$/gallon" value={r.lifetimePricePerGallon != null ? fmtDec(r.lifetimePricePerGallon) : '—'} tone="text-amber-400" />
        <StatTile label="$/mile (fuel)" value={r.fuelCostPerMile != null ? `${(r.fuelCostPerMile).toFixed(3)}` : '—'} tone="text-amber-400" />
        <StatTile label="Maint. $/mile" value={r.maintCostPerMile != null ? `${(r.maintCostPerMile).toFixed(3)}` : '—'} tone="text-violet-400" />
        <StatTile label="Total $/mile" value={r.totalCostPerMile != null ? `${(r.totalCostPerMile).toFixed(3)}` : '—'} tone="text-cyan-400" />
      </div>

      <ChartCard title="MPG per month">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={monthData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#71717a' }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11, fill: '#71717a' }} domain={['dataMin - 2', 'dataMax + 2']} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v?.toFixed(1), 'MPG']} />
            <Line type="monotone" dataKey="mpg" stroke={HUE_MPG} strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Fuel cost per month">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#71717a' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: '#71717a' }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [fmt(v), 'Cost']} />
              <Bar dataKey="cost" fill={HUE_COST} radius={[3, 3, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="$/gallon per month">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={monthData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#71717a' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: '#71717a' }} domain={['dataMin - 0.2', 'dataMax + 0.2']} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [fmtDec(v), '$/gal']} />
              <Line type="monotone" dataKey="pricePerGallon" stroke={HUE_COST} strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Cost per week (recent)">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weekData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#71717a' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: '#71717a' }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [fmt(v), 'Cost']} />
              <Bar dataKey="cost" fill={HUE_COST} radius={[3, 3, 0, 0]} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Maintenance cost per year">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={maintYearData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#71717a' }} />
              <YAxis tick={{ fontSize: 11, fill: '#71717a' }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [fmt(v), 'Maintenance']} />
              <Bar dataKey="cost" fill={HUE_MAINT} radius={[3, 3, 0, 0]} maxBarSize={30} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Gallons per year">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={yearData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#71717a' }} />
            <YAxis tick={{ fontSize: 11, fill: '#71717a' }} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v?.toFixed(1), 'Gallons']} />
            <Bar dataKey="gallons" fill={HUE_MPG} radius={[3, 3, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {monthData.length === 0 && visits.length === 0 && (
        <p className="text-sm text-zinc-600">No fuel or service history yet for this vehicle — charts will populate as you log fill-ups and visits.</p>
      )}
    </div>
  );
}

function StatTile({ label, value, tone = 'text-white' }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <span className={`text-xl font-bold tabular-nums ${tone}`}>{value}</span>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <h3 className="text-sm font-semibold text-zinc-200 mb-3">{title}</h3>
      {children}
    </section>
  );
}
