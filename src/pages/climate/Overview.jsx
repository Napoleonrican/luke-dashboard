import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Thermometer, Droplets, BatteryFull, BatteryMedium, BatteryLow, BatteryWarning, Cloud, Wind, LoaderCircle, Power, Snowflake, Sparkles, X, CalendarClock, AlertTriangle, Bot, PowerOff } from 'lucide-react';
import { fmtTemp, timeAgo, APARTMENT_COORDS } from './useClimateData';

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

// Tiered battery indicator: pick the icon + color from the charge level relative to
// the low-battery alert threshold. Below threshold reads red (warning), then amber,
// then neutral as it climbs.
function batteryDisplay(pct, threshold) {
  if (pct == null) return { Icon: BatteryLow, color: 'text-zinc-500' };
  if (pct < threshold) return { Icon: BatteryWarning, color: 'text-red-400' };
  if (pct < 30) return { Icon: BatteryLow, color: 'text-amber-400' };
  if (pct < 60) return { Icon: BatteryMedium, color: 'text-zinc-400' };
  return { Icon: BatteryFull, color: 'text-zinc-400' };
}

const MODE_LABELS = {
  COOL: 'Cool', ENERGY_SAVER: 'Eco', TURBO_COOL: 'Turbo Cool',
  FAN_ONLY: 'Fan Only', DRY: 'Dry',
};
const FAN_LABELS = { AUTO: 'Auto', LOW: 'Low', MED: 'Med', HIGH: 'High' };
const SOURCE_LABELS = {
  executor: 'schedule', goal_follower: 'goal follower', comfort_mode: 'comfort mode',
};

function fmtLiveState(s) {
  if (!s) return null;
  if (s.power === false) return 'OFF';
  const parts = [
    s.setpoint_f != null && `${s.setpoint_f}°F`,
    MODE_LABELS[s.mode] ?? s.mode,
    s.fan && `Fan ${FAN_LABELS[s.fan] ?? s.fan}`,
  ].filter(Boolean);
  return parts.join(' · ');
}

// Derive the four control-mode states from the three Supabase signals.
// Priority: comfort mode > executor off > schedule only > fully automatic.
function useControlMode(comfortMode, executorEnabled, goalsText) {
  if (comfortMode)            return 'comfort';
  if (!executorEnabled)       return 'manual';
  if (!goalsText?.trim())     return 'schedule';
  return 'auto';
}

const CONTROL_MODE_CONFIG = {
  comfort: {
    Icon: Sparkles,
    label: 'Comfort Mode Active',
    desc: 'Normal schedule is paused — the executor is following your manual instruction.',
    border: 'border-violet-500/40',
    bg: 'bg-violet-500/10',
    text: 'text-violet-300',
    iconColor: 'text-violet-400',
  },
  manual: {
    Icon: PowerOff,
    label: 'Manual Control',
    desc: 'Dashboard executor is off — the AC is not following the schedule. Enable it in Settings.',
    border: 'border-amber-500/40',
    bg: 'bg-amber-500/10',
    text: 'text-amber-300',
    iconColor: 'text-amber-400',
  },
  schedule: {
    Icon: CalendarClock,
    label: 'Schedule Only',
    desc: 'Following the preset schedule, but no goals are set — the agent has nothing to optimise toward. Add goals to enable Fully Automatic mode.',
    border: 'border-sky-500/40',
    bg: 'bg-sky-500/10',
    text: 'text-sky-300',
    iconColor: 'text-sky-400',
  },
  auto: {
    Icon: Bot,
    label: 'Fully Automatic',
    desc: 'Goals are set and the nightly agent is actively tuning the schedule toward them.',
    border: 'border-emerald-500/40',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-300',
    iconColor: 'text-emerald-400',
  },
};

export default function Overview() {
  const {
    sensors, latest, weather, weatherLoading, unit,
    schedule, executorEnabled, goalsText, lastAcPush, acLiveState, loading,
    comfortMode, activateComfortMode, clearComfortMode,
    alerts,
  } = useOutletContext();

  const controlMode = useControlMode(comfortMode, executorEnabled, goalsText);
  const modeCfg = CONTROL_MODE_CONFIG[controlMode];

  // Sensors currently reporting below the low-battery threshold (for the banner).
  const lowBattery = sensors
    .map((s) => ({ s, batt: latest[s.mac]?.battery }))
    .filter(({ batt }) => batt != null && batt < (alerts?.batteryPct ?? 20));

  const { active, next } = useMemo(() => computeActiveAndNext(schedule), [schedule]);

  // Comfort mode panel state — freeform intent the AI interprets (Layer 3 override)
  const [cmExpanded, setCmExpanded] = useState(false);
  const [intentText, setIntentText] = useState('');
  const [cmRoom, setCmRoom] = useState(null);
  const [cmTemp, setCmTemp] = useState(null);
  const [cmSaving, setCmSaving] = useState(false);

  async function handleActivate() {
    if (!intentText.trim()) return;
    setCmSaving(true);
    await activateComfortMode(intentText.trim(), { goalRoom: cmRoom, goalTempF: cmTemp });
    setCmSaving(false);
    setCmExpanded(false);
    setIntentText('');
    setCmRoom(null);
    setCmTemp(null);
  }

  async function handleClear() {
    setCmSaving(true);
    await clearComfortMode();
    setCmSaving(false);
  }

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
      {/* Low-battery alert banner */}
      {lowBattery.length > 0 && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2">
          <AlertTriangle size={15} className="text-red-400 mt-0.5 shrink-0" />
          <div className="text-sm text-red-300 leading-snug">
            <span className="font-semibold">Low battery</span> — replace soon:{' '}
            {lowBattery.map(({ s, batt }, i) => (
              <span key={s.mac}>
                {i > 0 && ', '}
                {s.label || s.name} <span className="text-red-400/80 tabular-nums">({batt}%)</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Control-mode status banner */}
      <div className={`rounded-xl border ${modeCfg.border} ${modeCfg.bg} p-3 flex items-start gap-2`}>
        <modeCfg.Icon size={15} className={`${modeCfg.iconColor} mt-0.5 shrink-0`} />
        <div className="text-sm leading-snug">
          <span className={`font-semibold ${modeCfg.text}`}>{modeCfg.label}</span>
          <span className={`${modeCfg.text} opacity-80`}> — {modeCfg.desc}</span>
        </div>
      </div>

      {/* AC right now / next change */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Snowflake size={16} className="text-sky-400" />
          <span className="text-sm font-semibold text-zinc-100">AC right now</span>
          {comfortMode ? (
            <span className="ml-auto text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border text-violet-400 border-violet-500/30 flex items-center gap-1">
              <Sparkles size={11} /> Comfort Mode
            </span>
          ) : (
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
          )}
        </div>

        {acLiveState ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums text-zinc-100">
                {fmtLiveState(acLiveState)}
              </span>
            </div>
            <div className="text-xs text-zinc-500 mt-2">
              Confirmed {timeAgo(acLiveState.confirmed_at)}
              {acLiveState.source && ` · set by ${SOURCE_LABELS[acLiveState.source] ?? acLiveState.source}`}
              {next && (
                <>
                  {' · '}Next: <span className="text-zinc-300">{blockSummary(next.row)}</span> at{' '}
                  {fmtTime12(next.row.time_local)}
                  {!next.today && <span> ({DAY_NAMES[next.dow]})</span>}
                </>
              )}
              {!executorEnabled && (
                <span className="block text-amber-500/80 mt-1">
                  Executor is off — schedule not being applied (Settings).
                </span>
              )}
            </div>
          </>
        ) : comfortMode && lastAcPush?.source === 'comfort_mode' ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums text-zinc-100">
                {lastAcPush.detail.replace(/^Comfort mode:\s*/i, '')}
              </span>
            </div>
            <div className="text-xs text-zinc-500 mt-2">
              Last adjusted {new Date(lastAcPush.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} by comfort mode ·{' '}
              <span className="text-zinc-400">schedule paused</span>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* Comfort mode panel */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        {comfortMode ? (
          /* Active state */
          <div className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} className="text-violet-400" />
              <span className="text-sm font-semibold text-violet-300">Comfort Mode Active</span>
              <button
                onClick={handleClear}
                disabled={cmSaving}
                className="ml-auto text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-40 flex items-center gap-1 border border-zinc-700 hover:border-zinc-500 rounded px-2 py-0.5 transition-colors"
              >
                {cmSaving ? <LoaderCircle size={11} className="animate-spin" /> : <X size={11} />}
                Deactivate
              </button>
            </div>
            <p className="text-sm text-zinc-200 leading-snug">{comfortMode.intent_text}</p>
            {(comfortMode.goal_room || comfortMode.goal_temp_f) && (
              <div className="flex gap-2 mt-1.5">
                {comfortMode.goal_room && (
                  <span className="text-[11px] rounded-full bg-violet-600/20 border border-violet-500/30 text-violet-300 px-2 py-0.5">
                    {comfortMode.goal_room === 'living_room' ? 'Living Room' : 'Bedroom'}
                  </span>
                )}
                {comfortMode.goal_temp_f && (
                  <span className="text-[11px] rounded-full bg-violet-600/20 border border-violet-500/30 text-violet-300 px-2 py-0.5">
                    Goal {comfortMode.goal_temp_f}°F
                  </span>
                )}
              </div>
            )}
            <p className="text-[11px] text-zinc-500 mt-1">
              Activated {comfortMode.activated_at ? new Date(comfortMode.activated_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}
              {comfortMode.expires_at
                ? ` · Expires ${new Date(comfortMode.expires_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                : ' · Active until manually cleared'}
            </p>
            <p className="text-[11px] text-zinc-600 mt-1">
              The agent interprets your instruction and adjusts the AC — normal schedule is paused.
            </p>
          </div>
        ) : cmExpanded ? (
          /* Expanded input state — freeform instruction the AI interprets */
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-violet-400" />
              <span className="text-sm font-semibold text-zinc-100">Comfort Mode</span>
              <button
                onClick={() => { setCmExpanded(false); setIntentText(''); }}
                className="ml-auto text-zinc-500 hover:text-zinc-300"
              >
                <X size={14} />
              </button>
            </div>
            <textarea
              value={intentText}
              onChange={(e) => setIntentText(e.target.value)}
              rows={3}
              placeholder={'e.g. "Keep the bedroom around 68°F tonight" or "Get the living room to 72°F"'}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
            />
            {/* Optional structured hints — auto-parsed from text too, but explicit is better */}
            <div className="flex flex-wrap gap-2 mt-2.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-zinc-500">Room</span>
                {[['bedroom', 'Bedroom'], ['living_room', 'Living Room']].map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setCmRoom(cmRoom === val ? null : val)}
                    className={`text-[11px] rounded-full px-2.5 py-0.5 border transition-colors ${cmRoom === val ? 'bg-violet-600/30 border-violet-500 text-violet-300' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-[11px] text-zinc-500 shrink-0">Goal</span>
                <input
                  type="range"
                  min={62}
                  max={86}
                  value={cmTemp ?? 72}
                  onChange={(e) => setCmTemp(Number(e.target.value))}
                  className="flex-1 h-1 accent-violet-500 cursor-pointer"
                />
                <span className="text-[11px] text-zinc-300 tabular-nums w-8 text-right shrink-0">{cmTemp ?? 72}°F</span>
              </div>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1.5">
              The agent checks sensors every few minutes and adjusts the AC toward your instruction. Clears manually.
            </p>
            <div className="flex justify-end mt-3">
              <button
                onClick={handleActivate}
                disabled={!intentText.trim() || cmSaving}
                className="flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 px-3 py-1.5 text-sm font-medium text-white transition-colors"
              >
                {cmSaving && <LoaderCircle size={12} className="animate-spin" />}
                Activate
              </button>
            </div>
          </div>
        ) : (
          /* Collapsed state — following schedule */
          <div className="flex items-center gap-2 px-4 py-3">
            <CalendarClock size={14} className="text-zinc-500" />
            <span className="text-sm text-zinc-400">Following Schedule</span>
            <button
              onClick={() => setCmExpanded(true)}
              className="ml-auto text-xs text-violet-400 hover:text-violet-300 border border-zinc-700 hover:border-zinc-600 rounded px-2 py-0.5 transition-colors"
            >
              Enable Comfort Mode
            </button>
          </div>
        )}
      </div>

      {/* Live sensor tiles + outdoor */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {sensors.map((s, i) => {
          const r = latest[s.mac];
          const color = colorOf(i);
          const stale = r && Date.now() - new Date(r.ts).getTime() > 10 * 60 * 1000;
          const battThreshold = alerts?.batteryPct ?? 20;
          const lowBatt = r?.battery != null && r.battery < battThreshold;
          const { Icon: BattIcon, color: battColor } = batteryDisplay(r?.battery, battThreshold);
          return (
            <div
              key={s.mac}
              className={`rounded-xl border bg-zinc-900 p-4 ${
                lowBatt ? 'border-red-500/50 ring-1 ring-red-500/30' : 'border-zinc-800'
              }`}
            >
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
                <span className={`flex items-center gap-1 ${lowBatt ? 'text-red-400 font-semibold' : ''}`}>
                  <BattIcon size={13} className={battColor} />
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
            <span className="text-xs text-zinc-500">· {APARTMENT_COORDS.label}</span>
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
            <div className="text-xs text-zinc-500 leading-relaxed">{APARTMENT_COORDS.label} weather unavailable</div>
          )}
        </div>
      </div>

      <p className="text-[11px] text-zinc-600">
        Rename a sensor or change °F/°C and refresh cadence in <span className="text-zinc-400">Settings</span>.
      </p>
    </div>
  );
}
