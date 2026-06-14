import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Thermometer, Droplets, BatteryLow, Cloud, Wind, LoaderCircle, Power, Snowflake } from 'lucide-react';
import { fmtTemp, timeAgo } from './useClimateData';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hasDay = (mask, i) => (mask & (1 << i)) !== 0;
const toMinutes = (t) => {
  const [h, m] = String(t ?? '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
function fmtTime12(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

// Mirror the executor's step-function rule: of today's enabled blocks (by day mask),
// the active one is the most recent whose time_local <= now; if none today yet, it's
// the last enabled block from the most recent prior day (overnight wrap). The "next"
// block is the soonest upcoming enabled block, scanning forward across days.
function computeActiveAndNext(schedule) {
  const enabled = (schedule ?? []).filter((r) => r.enabled !== false);
  if (enabled.length === 0) return { active: null, next: null };
  const now = new Date();
  const nowDow = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Active: walk back up to 7 days to find the most recent applicable block.
  let active = null;
  for (let back = 0; back < 7 && !active; back++) {
    const dow = (nowDow - back + 7) % 7;
    const cands = enabled
      .filter((r) => hasDay(r.days, dow))
      .filter((r) => (back === 0 ? toMinutes(r.time_local) <= nowMin : true))
      .sort((a, b) => toMinutes(a.time_local) - toMinutes(b.time_local));
    if (cands.length) active = cands[cands.length - 1];
  }

  // Next: walk forward up to 7 days for the soonest upcoming block.
  let next = null;
  for (let fwd = 0; fwd < 8 && !next; fwd++) {
    const dow = (nowDow + fwd) % 7;
    const cands = enabled
      .filter((r) => hasDay(r.days, dow))
      .filter((r) => (fwd === 0 ? toMinutes(r.time_local) > nowMin : true))
      .sort((a, b) => toMinutes(a.time_local) - toMinutes(b.time_local));
    if (cands.length) next = { row: cands[0], dow, today: fwd === 0 };
  }
  return { active, next };
}

function blockSummary(r) {
  if (!r) return '—';
  if (r.action === 'off') return 'Off';
  const t = r.temp_f != null ? `${r.temp_f}°F` : '';
  return `${t} ${r.mode ?? ''}${r.fan ? ` · Fan ${r.fan}` : ''}`.trim();
}

export default function Overview() {
  const {
    sensors, latest, weather, weatherLoading, unit,
    schedule, executorEnabled, loading,
  } = useOutletContext();

  const { active, next } = useMemo(() => computeActiveAndNext(schedule), [schedule]);

  if (loading) {
    return <div className="text-sm text-zinc-500 py-16 text-center">Loading readings…</div>;
  }
  if (sensors.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
        No sensors yet. Start the local collector (run-collector.bat) and readings will appear here.
      </div>
    );
  }

  const colorOf = (i) => ['#38bdf8', '#f472b6', '#a3e635', '#fbbf24', '#c084fc', '#fb7185'][i % 6];

  return (
    <div className="flex flex-col gap-6">
      {/* AC right now / next change */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Snowflake size={16} className="text-sky-400" />
          <span className="text-sm font-semibold text-zinc-100">AC right now</span>
          <span
            className={`ml-auto text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border flex items-center gap-1 ${
              executorEnabled
                ? 'text-emerald-400 border-emerald-500/30'
                : 'text-zinc-500 border-zinc-600/40'
            }`}
            title={executorEnabled
              ? 'The dashboard schedule is driving the AC.'
              : 'Manual / SmartHQ control — the executor is not applying this schedule.'}
          >
            <Power size={11} /> {executorEnabled ? 'Dashboard control' : 'Manual control'}
          </span>
        </div>

        {active ? (
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums text-zinc-100">{blockSummary(active)}</span>
            <span className="text-xs text-zinc-500">since {fmtTime12(active.time_local)}</span>
          </div>
        ) : (
          <div className="text-sm text-zinc-500">No active schedule block.</div>
        )}

        <div className="text-xs text-zinc-500 mt-2">
          {next ? (
            <>
              Next: <span className="text-zinc-300">{blockSummary(next.row)}</span> at{' '}
              {fmtTime12(next.row.time_local)}
              {!next.today && <span> ({DAY_NAMES[next.dow]})</span>}
            </>
          ) : (
            'No upcoming blocks scheduled.'
          )}
          {!executorEnabled && (
            <span className="block text-amber-500/80 mt-1">
              Executor is off — this is what the schedule <em>would</em> apply if enabled (Settings).
            </span>
          )}
        </div>
      </div>

      {/* Live sensor tiles + outdoor */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {sensors.map((s, i) => {
          const r = latest[s.mac];
          const color = colorOf(i);
          const stale = r && Date.now() - new Date(r.ts).getTime() > 10 * 60 * 1000;
          return (
            <div key={s.mac} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-sm font-semibold text-zinc-100 truncate">{s.label || s.name}</span>
                </div>
              </div>
              <div className="flex items-baseline gap-1">
                <Thermometer size={18} className="text-zinc-500" />
                <span className="text-3xl font-bold tabular-nums text-zinc-100">
                  {r ? fmtTemp(r.temp_c, unit) : '—'}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-zinc-400">
                <span className="flex items-center gap-1">
                  <Droplets size={13} className="text-sky-400" />
                  {r?.humidity != null ? `${r.humidity}%` : '—'}
                </span>
                <span className="flex items-center gap-1">
                  <BatteryLow size={13} className={r?.battery != null && r.battery < 20 ? 'text-red-400' : 'text-zinc-500'} />
                  {r?.battery != null ? `${r.battery}%` : '—'}
                </span>
                <span className={`ml-auto ${stale ? 'text-amber-400' : 'text-zinc-600'}`}>
                  {r ? timeAgo(r.ts) : 'no data'}
                </span>
              </div>
            </div>
          );
        })}

        {/* Outdoor weather tile */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Cloud size={14} className="text-sky-400" />
            <span className="text-sm font-semibold text-zinc-100">Outdoor</span>
          </div>
          {weatherLoading ? (
            <div className="flex items-center gap-2 text-zinc-500 text-sm">
              <LoaderCircle size={14} className="animate-spin" /> Loading…
            </div>
          ) : weather ? (
            <>
              <div className="flex items-baseline gap-1 mb-2">
                <Cloud size={18} className="text-zinc-500" />
                <span className="text-3xl font-bold tabular-nums text-zinc-100">
                  {fmtTemp(weather.tempC, unit)}
                </span>
              </div>
              <div className="flex flex-col gap-1 text-xs text-zinc-400">
                <span>Feels like {fmtTemp(weather.feelsLikeC, unit)}</span>
                <span className="flex items-center gap-1">
                  <Droplets size={12} className="text-sky-400" />
                  {weather.humidity}% humidity
                </span>
                {weather.dewPointC != null && <span>Dew point {fmtTemp(weather.dewPointC, unit)}</span>}
                <span className="flex items-center gap-1">
                  <Wind size={12} />
                  {Math.round(weather.windMph)} mph
                </span>
              </div>
            </>
          ) : (
            <div className="text-xs text-zinc-500 leading-relaxed">Allow location access for local weather</div>
          )}
        </div>
      </div>

      <p className="text-[11px] text-zinc-600">
        Rename a sensor or change °F/°C and refresh cadence in <span className="text-zinc-400">Settings</span>.
      </p>
    </div>
  );
}
