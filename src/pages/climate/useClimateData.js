import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

// Shared climate data + view preferences for the Climate master-detail pages.
// ClimateLayout calls this once and passes the result down via <Outlet context>,
// so Overview (live tiles) and History (chart) share a single Supabase fetch and
// the same unit / range / sensor-visibility prefs.

export const RANGES = [
  { key: '1h',  label: '1H',  hours: 1,       useLiveTable: true  }, // raw sensor_readings (~12 points @ 5-min cadence)
  { key: '12h', label: '12H', hours: 12,      bucketSecs: 300  },    // ~144 points from sensor_history
  { key: '24h', label: '24H', hours: 24,      bucketSecs: 600  },    // ~144 points
  { key: '7d',  label: '7D',  hours: 24 * 7,  bucketSecs: 3600 },    // ~168 points
];

export const REFRESH_OPTIONS = [
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '5m', value: 300 },
  { label: '15m', value: 900 },
  { label: 'Off', value: 0 },
];

// Distinct line colors assigned per sensor in load order.
export const PALETTE = ['#38bdf8', '#f472b6', '#a3e635', '#fbbf24', '#c084fc', '#fb7185'];
export const OUTDOOR_COLOR = '#f59e0b'; // amber — distinct from the sensor palette

// Outdoor weather is for the APARTMENT, not the viewing device. Hardwire the
// coordinates (Lisbon Falls, ME) so the reading is correct wherever Luke opens the
// dashboard. Same location the agent's daily_brief.py uses.
export const APARTMENT_COORDS = { lat: 43.9997, lon: -70.0631, label: 'Lisbon Falls, ME' };

export const cToF = (c) => (c == null ? null : c * 9 / 5 + 32);
export const fToC = (f) => (f == null ? null : (f - 32) * 5 / 9);
export const fmtTemp = (c, unit) =>
  c == null ? '—' : unit === 'F' ? `${cToF(c).toFixed(1)}°F` : `${c.toFixed(1)}°C`;

export function timeAgo(iso) {
  if (!iso) return 'never';
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

// Tiny localStorage helpers so the views remember how Luke left them.
const lsGet = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
};
const lsSet = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
};

// Generate x-axis ticks on ROUND local-clock boundaries spanning the data, so
// labels read 1:00, 1:15… (not 7:46, 8:02…) and align with the gridlines.
export function makeXTicks(data, rangeKey) {
  if (!data || data.length === 0) return [];
  const minMs = data[0].ts;
  const maxMs = data[data.length - 1].ts;
  const d = new Date(minMs);
  let step;
  if (rangeKey === '1h') {
    d.setSeconds(0, 0);
    d.setMinutes(Math.floor(d.getMinutes() / 10) * 10);   // floor to :00/:10/:20…
    step = 10 * 60 * 1000;                                 // every 10 min
  } else if (rangeKey === '12h') {
    d.setMinutes(0, 0, 0);                                 // floor to the hour
    step = 60 * 60 * 1000;                                 // every 1 h
  } else if (rangeKey === '24h') {
    d.setMinutes(0, 0, 0);
    d.setHours(Math.floor(d.getHours() / 3) * 3);          // floor to 0/3/6/9…
    step = 3 * 60 * 60 * 1000;                             // every 3 h
  } else { // 7d
    d.setHours(0, 0, 0, 0);                                // local midnight
    step = 24 * 60 * 60 * 1000;                            // every day
  }
  const ticks = [];
  let t = d.getTime();
  while (t < minMs) t += step;                             // first boundary inside the data
  for (; t <= maxMs; t += step) ticks.push(t);
  return ticks;
}

// Inject an `outdoor` temp (°C) onto each chart row by matching the nearest
// hourly Open-Meteo sample. Samples more than ~90 min from a row are left null.
export function mergeOutdoor(rows, outdoor) {
  if (!outdoor || outdoor.length === 0) return rows;
  let i = 0;
  return rows.map((row) => {
    while (i + 1 < outdoor.length && outdoor[i + 1].ts <= row.ts) i++;
    let best = outdoor[i];
    if (i + 1 < outdoor.length && Math.abs(outdoor[i + 1].ts - row.ts) < Math.abs(best.ts - row.ts)) {
      best = outdoor[i + 1];
    }
    const near = best && Math.abs(best.ts - row.ts) <= 90 * 60 * 1000;
    return { ...row, outdoor: near ? best.tempC : null };
  });
}

export function useClimateData() {
  const [sensors, setSensors] = useState([]);          // [{mac,name,label}]
  const [latest, setLatest] = useState({});            // mac -> {temp_c,humidity,battery,ts,rssi}
  const [chartData, setChartData] = useState([]);      // [{ts, temp_<mac>, humidity_<mac>, ...}]
  const [rangeKey, setRangeKey] = useState(() => {
    const r = lsGet('thermo_range', '24h');
    return RANGES.some((x) => x.key === r) ? r : '24h';   // ignore a stale key like '6h'
  });
  const [unit, setUnit] = useState(() => lsGet('thermo_unit', 'F'));
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  // Auto-refresh interval (seconds; 0 = off), remembered between visits.
  const [refreshInterval, setRefreshInterval] = useState(() => {
    const stored = localStorage.getItem('thermo_refresh_interval');
    return stored !== null ? parseInt(stored, 10) : 60;
  });

  // Which metrics to plot, and which sensors to show on the graph (all remembered).
  const [showTemp, setShowTemp] = useState(() => lsGet('thermo_show_temp', true));
  const [showHumidity, setShowHumidity] = useState(() => lsGet('thermo_show_humidity', false));
  const [showOutdoor, setShowOutdoor] = useState(() => lsGet('thermo_show_outdoor', false));
  const [hiddenSensors, setHiddenSensors] = useState(() => new Set(lsGet('thermo_hidden_sensors', [])));

  // Outdoor weather tile (Open-Meteo, no API key).
  const [weather, setWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [coords, setCoords] = useState(null);          // {lat, lon} — fixed apartment location
  const [outdoorSeries, setOutdoorSeries] = useState([]); // [{ts, tempC}] hourly outdoor history

  // The live schedule, for the Overview "AC now / next change" summary.
  const [schedule, setSchedule] = useState([]);        // ac_schedule rows
  const [executorEnabled, setExecutorEnabled] = useState(null);
  const [lastAcPush, setLastAcPush] = useState(null);  // most recent non-noop ac_change_log row
  const [acLiveState, setAcLiveState] = useState(null); // confirmed AC state from last Pi write

  // Comfort mode override (ac_comfort_mode table — null when not active).
  const [comfortMode, setComfortModeState] = useState(null);

  // Alert thresholds (global, shared via ac_preferences). Temps in °F; null = no bound.
  const [alerts, setAlerts] = useState({ tempMinF: null, tempMaxF: null, batteryPct: 20 });

  const colorFor = useCallback(
    (mac) => {
      const i = sensors.findIndex((s) => s.mac === mac);
      return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
    },
    [sensors]
  );

  const loadAll = useCallback(async (rKey) => {
    if (!supabase) { setLoading(false); return; }
    const range = RANGES.find((r) => r.key === rKey) ?? RANGES[2];
    const since = new Date(Date.now() - range.hours * 3600 * 1000).toISOString();

    // 1) sensor registry
    const sRes = await supabase.from('sensors').select('mac,name,label').order('created_at');
    const sList = sRes.data ?? [];

    // 2) latest reading per sensor (live tiles use the collector's sensor_readings)
    const latestEntries = await Promise.all(
      sList.map(async (s) => {
        const { data } = await supabase
          .from('sensor_readings')
          .select('temp_c,humidity,battery,rssi,ts')
          .eq('mac', s.mac)
          .order('ts', { ascending: false })
          .limit(1);
        return [s.mac, data?.[0] ?? null];
      })
    );

    // 3) windowed chart data. For the 1H range we read sensor_readings directly
    //    (live data, 5-min cadence) — sensor_history only refreshes every 6h so
    //    a 1H window would always be empty from that table. Longer ranges use the
    //    history_series RPC which bucket-averages sensor_history server-side.
    let rawSeries;
    if (range.useLiveTable) {
      const { data } = await supabase
        .from('sensor_readings')
        .select('mac,ts,temp_c,humidity')
        .gte('ts', since)
        .order('ts', { ascending: true });
      // Normalize to the same shape as history_series rows (bucket = ts, no averaging needed).
      rawSeries = (data ?? []).map((r) => ({ bucket: r.ts, mac: r.mac, temp_c: r.temp_c, humidity: r.humidity }));
    } else {
      const { data } = await supabase.rpc('history_series', {
        since,
        bucket_seconds: range.bucketSecs ?? 600,
      });
      rawSeries = data ?? [];
    }

    // pivot: one row per time bucket, a temp_/humidity_ column per sensor
    const byTs = new Map();
    for (const r of rawSeries) {
      const t = new Date(r.bucket).getTime();
      let row = byTs.get(t);
      if (!row) { row = { ts: t }; byTs.set(t, row); }
      row[`temp_${r.mac}`] = r.temp_c == null ? null : Number(r.temp_c);
      row[`humidity_${r.mac}`] = r.humidity == null ? null : Number(r.humidity);
    }
    const rows = Array.from(byTs.values()).sort((a, b) => a.ts - b.ts);

    setSensors(sList);
    setLatest(Object.fromEntries(latestEntries));
    setChartData(rows);
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  // Load the live schedule + executor kill-switch + last actual AC push.
  const loadSchedule = useCallback(async () => {
    if (!supabase) return;
    const { data: sched } = await supabase
      .from('ac_schedule')
      .select('*')
      .order('time_local', { ascending: true });
    setSchedule(sched ?? []);
    const { data: prefs } = await supabase
      .from('ac_preferences')
      .select('executor_enabled,alert_temp_min_f,alert_temp_max_f,alert_battery_pct,ac_confirmed_power,ac_confirmed_setpoint_f,ac_confirmed_mode,ac_confirmed_fan,ac_confirmed_source,ac_confirmed_at')
      .eq('id', 1)
      .limit(1);
    const prefRow = prefs?.[0] ?? null;
    setExecutorEnabled(Boolean(prefRow?.executor_enabled));
    setAlerts({
      tempMinF:   prefRow?.alert_temp_min_f ?? null,
      tempMaxF:   prefRow?.alert_temp_max_f ?? null,
      batteryPct: prefRow?.alert_battery_pct ?? 20,
    });
    setAcLiveState(prefRow?.ac_confirmed_at ? {
      power:        prefRow.ac_confirmed_power,
      setpoint_f:   prefRow.ac_confirmed_setpoint_f,
      mode:         prefRow.ac_confirmed_mode,
      fan:          prefRow.ac_confirmed_fan,
      source:       prefRow.ac_confirmed_source,
      confirmed_at: prefRow.ac_confirmed_at,
    } : null);
    // Most recent non-noop push to the AC — kept for backward compatibility.
    const { data: pushLog } = await supabase
      .from('ac_change_log')
      .select('ts,source,action,detail')
      .in('source', ['executor', 'comfort_mode'])
      .neq('action', 'noop')
      .order('ts', { ascending: false })
      .limit(1);
    setLastAcPush(pushLog?.[0] ?? null);
  }, []);

  // Load the active comfort mode row (null when off).
  const loadComfortMode = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('ac_comfort_mode')
      .select('*')
      .eq('active', true)
      .limit(1);
    setComfortModeState(data?.[0] ?? null);
  }, []);

  // Activate comfort mode with a natural-language instruction the AI interprets (Layer 3 override).
  // goalRoom / goalTempF can be passed explicitly from the UI; when omitted we
  // best-effort parse them from the intent text so the Pi-side cooling guard has
  // structured data to work with even if the user just types freeform.
  const activateComfortMode = useCallback(async (intentText, { expiresAt = null, goalRoom = null, goalTempF = null } = {}) => {
    if (!supabase) return;
    if (!goalRoom) {
      const lower = intentText.toLowerCase();
      if (lower.includes('living')) goalRoom = 'living_room';
      else if (lower.includes('bed')) goalRoom = 'bedroom';
    }
    if (goalTempF == null) {
      const m = intentText.match(/(\d{2})\s*(?:°|degrees?|deg|f\b)/i) || intentText.match(/to\s+(\d{2})\b/i);
      if (m) goalTempF = Number(m[1]);
    }
    await supabase.from('ac_comfort_mode').update({ active: false }).eq('active', true);
    const row = { active: true, intent_text: intentText, activated_by: 'dashboard' };
    if (expiresAt) row.expires_at = expiresAt;
    if (goalRoom) row.goal_room = goalRoom;
    if (goalTempF != null) row.goal_temp_f = goalTempF;
    const { data } = await supabase
      .from('ac_comfort_mode')
      .insert(row)
      .select()
      .single();
    setComfortModeState(data ?? null);
  }, []);

  // Deactivate comfort mode (returns to normal schedule).
  const clearComfortMode = useCallback(async () => {
    if (!supabase) return;
    await supabase.from('ac_comfort_mode').update({ active: false }).eq('active', true);
    setComfortModeState(null);
  }, []);

  // Persist alert thresholds to the shared ac_preferences row (optimistic).
  const saveAlerts = useCallback(async (next) => {
    setAlerts(next);
    if (!supabase) return;
    await supabase
      .from('ac_preferences')
      .update({
        alert_temp_min_f: next.tempMinF,
        alert_temp_max_f: next.tempMaxF,
        alert_battery_pct: next.batteryPct,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);
  }, []);

  useEffect(() => { loadAll(rangeKey); }, [rangeKey, loadAll]);
  useEffect(() => { loadSchedule(); }, [loadSchedule]);
  useEffect(() => { loadComfortMode(); }, [loadComfortMode]);

  // auto-refresh on the chosen interval (0 = off)
  useEffect(() => {
    if (refreshInterval === 0) return;
    const id = setInterval(() => { loadAll(rangeKey); loadSchedule(); loadComfortMode(); }, refreshInterval * 1000);
    return () => clearInterval(id);
  }, [rangeKey, loadAll, loadSchedule, loadComfortMode, refreshInterval]);

  // Remember the view configuration between visits.
  useEffect(() => { lsSet('thermo_range', rangeKey); }, [rangeKey]);
  useEffect(() => { lsSet('thermo_unit', unit); }, [unit]);
  useEffect(() => { lsSet('thermo_show_temp', showTemp); }, [showTemp]);
  useEffect(() => { lsSet('thermo_show_humidity', showHumidity); }, [showHumidity]);
  useEffect(() => { lsSet('thermo_show_outdoor', showOutdoor); }, [showOutdoor]);
  useEffect(() => { lsSet('thermo_hidden_sensors', Array.from(hiddenSensors)); }, [hiddenSensors]);

  // Fetch outdoor weather once on mount, for the APARTMENT's fixed coordinates
  // (Open-Meteo, no key). Deliberately NOT the browser's geolocation — the reading
  // should reflect the apartment wherever Luke is viewing from.
  useEffect(() => {
    const { lat, lon } = APARTMENT_COORDS;
    setCoords({ lat, lon }); // reused for the outdoor graph-line fetch below
    setWeatherLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
          `&current=temperature_2m,relative_humidity_2m,dew_point_2m,wind_speed_10m,apparent_temperature` +
          `&wind_speed_unit=mph&forecast_days=1`
        );
        const d = await res.json();
        const c = d.current;
        setWeather({
          tempC: c.temperature_2m,
          feelsLikeC: c.apparent_temperature,
          humidity: c.relative_humidity_2m,
          dewPointC: c.dew_point_2m,
          windMph: c.wind_speed_10m,
        });
      } catch {
        // silently leave the tile empty
      }
      setWeatherLoading(false);
    })();
  }, []);

  // When the outdoor line is enabled, pull the last week of hourly outdoor temps
  // (°C, to match the chart's temp axis). One fetch covers every range.
  useEffect(() => {
    if (!showOutdoor || !coords || outdoorSeries.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}` +
          `&hourly=temperature_2m&past_days=7&forecast_days=1&timezone=auto`
        );
        const d = await res.json();
        const times = d.hourly?.time ?? [];
        const temps = d.hourly?.temperature_2m ?? [];
        const series = times
          .map((t, i) => ({ ts: new Date(t).getTime(), tempC: temps[i] }))
          .filter((p) => p.tempC != null);
        if (!cancelled) setOutdoorSeries(series);
      } catch {
        /* outdoor line is optional; leave it empty on failure */
      }
    })();
    return () => { cancelled = true; };
  }, [showOutdoor, coords, outdoorSeries.length]);

  const setRefreshIntervalPersisted = useCallback((val) => {
    setRefreshInterval(val);
    localStorage.setItem('thermo_refresh_interval', String(val));
  }, []);

  const toggleSensor = useCallback((mac) => {
    setHiddenSensors((prev) => {
      const next = new Set(prev);
      if (next.has(mac)) next.delete(mac);
      else next.add(mac);
      return next;
    });
  }, []);

  const renameSensor = useCallback(async (mac, current) => {
    const next = window.prompt('Rename this sensor:', current);
    if (next == null || next.trim() === '' || next === current) return;
    await supabase.from('sensors').update({ label: next.trim() }).eq('mac', mac);
    setSensors((prev) => prev.map((s) => (s.mac === mac ? { ...s, label: next.trim() } : s)));
  }, []);

  return {
    // data
    sensors, latest, chartData, schedule, executorEnabled, lastAcPush, acLiveState,
    comfortMode, activateComfortMode, clearComfortMode,
    alerts, saveAlerts,
    weather, weatherLoading, coords, outdoorSeries,
    loading, lastRefresh,
    // prefs
    rangeKey, setRangeKey,
    unit, setUnit,
    refreshInterval, setRefreshInterval: setRefreshIntervalPersisted,
    showTemp, setShowTemp,
    showHumidity, setShowHumidity,
    showOutdoor, setShowOutdoor,
    hiddenSensors, toggleSensor,
    // actions
    reload: () => { loadAll(rangeKey); loadSchedule(); loadComfortMode(); },
    renameSensor,
    colorFor,
  };
}
