import { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ChevronDown, Check } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { fetchFuelLogs, fetchServiceVisits } from '../../lib/vehicles';
import { fmt, fmtDec } from '../cashflow/format';
import { StateRow, LoadErrorRow } from '../cashflow/tableparts';
import { rollups, mpgByYearMonth } from './vehicleCalc';

// One hue per chart (magnitude, not identity) — see dataviz skill's
// color-formula: sequential/single-series data gets one consistent hue, never
// a rainbow. Values picked from the existing dashboard's dark-theme palette.
const HUE_MPG = '#10b981';     // emerald — efficiency
const HUE_COST = '#f59e0b';    // amber — spend
const HUE_MAINT = '#8b5cf6';   // violet — maintenance

// The MPG-by-year chart is the one place multiple series share an axis (one
// per checked year), so it's the one deliberate exception to "one hue" —
// each year needs to stay visually distinct across its solid trend line and
// its dashed average-line twin.
const YEAR_PALETTE = ['#10b981', '#38bdf8', '#f59e0b', '#f472b6', '#a78bfa', '#fb7185', '#facc15', '#34d399'];
const colorForYear = (year, years) => YEAR_PALETTE[years.indexOf(year) % YEAR_PALETTE.length];

const monthLabel = (key) => {
  const [y, m] = key.split('-');
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]} '${y.slice(2)}`;
};

const tooltipStyle = { background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 };

// Recharts' 'dataMin - N' string domains fall back to raw data extremes (with
// no padding logic of their own) whenever a series has fewer than two finite
// points, which is what produced the runaway axis labels — a lone reliable
// value with nothing to range against. Computing the domain ourselves from
// only the finite values, with a real fallback, keeps the axis sane even when
// a month has just one data point.
function niceDomain(values, pad, fallback = [0, 1]) {
  const finite = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!finite.length) return fallback;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (min === max) return [min - pad, max + pad];
  return [min - pad, max + pad];
}

export default function Insights() {
  const { vehicleId, setPageMenuItems } = useOutletContext();
  const [fuelLogs, setFuelLogs] = useState([]);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedYears, setSelectedYears] = useState(() => new Set([new Date().getFullYear()]));

  useEffect(() => { if (setPageMenuItems) setPageMenuItems([]); }, [setPageMenuItems]);

  useEffect(() => {
    if (!vehicleId) return;
    let active = true;
    Promise.all([fetchFuelLogs(vehicleId), fetchServiceVisits(vehicleId)]).then(([f, v]) => {
      if (!active) return;
      if (f.error || v.error) { setError(f.error || v.error); setLoading(false); return; }
      setError(null);
      const logs = f.data || [];
      setFuelLogs(logs);
      setVisits(v.data || []);
      // Default the year picker to the current year, but if this vehicle's
      // log doesn't cover it (e.g. retired before this year), fall back to
      // its most recent year instead of defaulting to an empty chart.
      const { years } = mpgByYearMonth(logs);
      if (years.length && !years.includes(new Date().getFullYear())) {
        setSelectedYears(new Set([years[years.length - 1]]));
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [vehicleId, reloadKey]);

  const reload = () => { setLoading(true); setError(null); setReloadKey((k) => k + 1); };
  const toggleYear = (y) => setSelectedYears((prev) => {
    const next = new Set(prev);
    if (next.has(y)) next.delete(y); else next.add(y);
    return next;
  });

  if (!vehicleId) return <p className="text-sm text-zinc-500">No vehicle selected yet.</p>;
  if (loading) return <StateRow colSpan={1}>Loading…</StateRow>;
  if (error) return <LoadErrorRow colSpan={1} onRetry={reload} />;

  const r = rollups(fuelLogs, visits);
  const monthData = r.byMonth.slice(-24).map((m) => ({ ...m, label: monthLabel(m.key) }));
  const yearData = r.byYear.map((y) => ({ ...y, label: y.key }));
  const maintYearData = r.maintenanceByYear.map((y) => ({ ...y, label: y.key }));
  const weekData = r.byWeek.slice(-16).map((w) => ({ ...w, label: w.key.slice(5) }));

  const ppgDomain = niceDomain(monthData.map((m) => m.pricePerGallon), 0.2, [0, 5]);

  const { years: mpgYears, rows: mpgRows } = mpgByYearMonth(fuelLogs);
  const activeYears = mpgYears.filter((y) => selectedYears.has(y));
  const avgMpgByYear = Object.fromEntries(r.byYear.map((y) => [Number(y.key), y.mpg]));
  const mpgMultiDomain = niceDomain(
    [
      ...mpgRows.flatMap((row) => activeYears.map((y) => row[y])),
      ...activeYears.map((y) => avgMpgByYear[y]),
    ],
    2, [0, 40],
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatTile label="Lifetime MPG" value={r.lifetimeMPG != null ? r.lifetimeMPG.toFixed(1) : '—'} tone="text-emerald-400" />
        <StatTile label="$/gallon" value={r.lifetimePricePerGallon != null ? fmtDec(r.lifetimePricePerGallon) : '—'} tone="text-amber-400" />
        <StatTile label="$/mile (fuel)" value={r.fuelCostPerMile != null ? `${(r.fuelCostPerMile).toFixed(3)}` : '—'} tone="text-amber-400" />
        <StatTile label="Maint. $/mile" value={r.maintCostPerMile != null ? `${(r.maintCostPerMile).toFixed(3)}` : '—'} tone="text-violet-400" />
        <StatTile label="Total $/mile" value={r.totalCostPerMile != null ? `${(r.totalCostPerMile).toFixed(3)}` : '—'} tone="text-cyan-400" />
      </div>

      <div>
        <p className="text-xs text-zinc-500 mb-2">What to expect</p>
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Avg / fill-up" value={r.avgCostPerFillup != null ? fmt(r.avgCostPerFillup) : '—'} tone="text-amber-400" />
          <StatTile label="Avg / week" value={r.avgCostPerWeek != null ? fmt(r.avgCostPerWeek) : '—'} tone="text-amber-400" />
          <StatTile label="Avg / month" value={r.avgCostPerMonth != null ? fmt(r.avgCostPerMonth) : '—'} tone="text-amber-400" />
        </div>
      </div>

      <ChartCard
        title="MPG by month"
        action={<YearMultiSelect years={mpgYears} selected={selectedYears} onToggle={toggleYear} />}
      >
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={mpgRows} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#71717a' }} />
            <YAxis tick={{ fontSize: 11, fill: '#71717a' }} domain={mpgMultiDomain} tickFormatter={(v) => v.toFixed(0)} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [v != null ? v.toFixed(1) : '—', name]} />
            {activeYears.map((y) => (
              <Line key={y} type="monotone" dataKey={String(y)} name={String(y)} stroke={colorForYear(y, mpgYears)} strokeWidth={2} dot={false} connectNulls />
            ))}
            {activeYears.map((y) => (avgMpgByYear[y] != null && (
              <ReferenceLine key={`avg-${y}`} y={avgMpgByYear[y]} stroke={colorForYear(y, mpgYears)} strokeDasharray="4 4" strokeOpacity={0.7} />
            )))}
          </LineChart>
        </ResponsiveContainer>
        {activeYears.length === 0 ? (
          <p className="text-xs text-zinc-600 mt-2">Pick a year above to see its MPG by month.</p>
        ) : (
          <p className="text-[11px] text-zinc-600 flex flex-wrap gap-4 mt-2">
            {activeYears.map((y) => (
              <span key={y} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: colorForYear(y, mpgYears) }} />
                {y}{avgMpgByYear[y] != null && <span className="text-zinc-700">· avg {avgMpgByYear[y].toFixed(1)} (dashed)</span>}
              </span>
            ))}
          </p>
        )}
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
              <YAxis tick={{ fontSize: 11, fill: '#71717a' }} domain={ppgDomain} tickFormatter={(v) => v.toFixed(2)} />
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

function ChartCard({ title, action, children }) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

// Popover checklist of the years present in this vehicle's fuel log —
// same interaction pattern as Service Log's schedule dropdown (click to
// open, checkbox toggles, closes on outside click/Escape).
function YearMultiSelect({ years, selected, onToggle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!years.length) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium transition-colors ${
          open ? 'border-zinc-500 bg-zinc-800 text-zinc-200' : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-200'
        }`}
      >
        Years <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-40 max-h-64 overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-1.5 shadow-xl shadow-black/40">
          {years.map((y) => {
            const isChecked = selected.has(y);
            const color = colorForYear(y, years);
            return (
              <button
                key={y}
                onClick={() => onToggle(y)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800"
              >
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded border"
                  style={{ borderColor: color, background: isChecked ? color : 'transparent' }}
                >
                  {isChecked && <Check size={11} className="text-white" />}
                </span>
                {y}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
