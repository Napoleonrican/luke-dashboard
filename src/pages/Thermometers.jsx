import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import * as XLSX from 'xlsx';
import { Thermometer, Droplets, BatteryLow, Pencil, Download, RefreshCw, Sparkles, Cloud, Wind, LoaderCircle, Info, Snowflake } from 'lucide-react';
import TopNav from '../components/TopNav';
import { supabase } from '../lib/supabase';

const RANGES = [
  { key: '1h', label: '1H', hours: 1, bucketSecs: 60 },       // ~60 points
  { key: '6h', label: '6H', hours: 6, bucketSecs: 120 },      // ~180 points
  { key: '24h', label: '24H', hours: 24, bucketSecs: 600 },   // ~144 points
  { key: '7d', label: '7D', hours: 24 * 7, bucketSecs: 3600 },// ~168 points
];

const REFRESH_OPTIONS = [
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '5m', value: 300 },
  { label: '15m', value: 900 },
  { label: 'Off', value: 0 },
];

// Distinct line colors assigned per sensor in load order.
const PALETTE = ['#38bdf8', '#f472b6', '#a3e635', '#fbbf24', '#c084fc', '#fb7185'];

const cToF = (c) => (c == null ? null : c * 9 / 5 + 32);
const fmtTemp = (c, unit) =>
  c == null ? '—' : unit === 'F' ? `${cToF(c).toFixed(1)}°F` : `${c.toFixed(1)}°C`;

function timeAgo(iso) {
  if (!iso) return 'never';
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

// Tiny localStorage helpers so the graph remembers how Luke left it.
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

export default function Thermometers() {
  const [sensors, setSensors] = useState([]);          // [{mac,name,label}]
  const [latest, setLatest] = useState({});            // mac -> {temp_c,humidity,battery,ts,rssi}
  const [chartData, setChartData] = useState([]);      // [{ts, temp_<mac>, humidity_<mac>, ...}]
  const [rangeKey, setRangeKey] = useState(() => lsGet('thermo_range', '24h'));
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
  const [hiddenSensors, setHiddenSensors] = useState(() => new Set(lsGet('thermo_hidden_sensors', []))); // macs hidden from the graph

  // Outdoor weather tile (Open-Meteo, no API key).
  const [weather, setWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  // AI comfort & AC advice (from the /api/insights serverless function)
  const [insights, setInsights] = useState(null);    // {advice, weather, indoor, generatedAt}
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);

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

    // 3) windowed chart data from the on-device history (sensor_history), bucket-
    //    averaged server-side so a week of 1-minute data is a few hundred points.
    //    The RPC returns both temperature and humidity per bucket.
    const { data: series } = await supabase.rpc('history_series', {
      since,
      bucket_seconds: range.bucketSecs ?? 600,
    });

    // pivot: one row per time bucket, a temp_/humidity_ column per sensor
    const byTs = new Map();
    for (const r of series ?? []) {
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

  useEffect(() => { loadAll(rangeKey); }, [rangeKey, loadAll]);

  // auto-refresh on the chosen interval (0 = off)
  useEffect(() => {
    if (refreshInterval === 0) return;
    const id = setInterval(() => loadAll(rangeKey), refreshInterval * 1000);
    return () => clearInterval(id);
  }, [rangeKey, loadAll, refreshInterval]);

  // Remember the graph configuration between visits.
  useEffect(() => { lsSet('thermo_range', rangeKey); }, [rangeKey]);
  useEffect(() => { lsSet('thermo_unit', unit); }, [unit]);
  useEffect(() => { lsSet('thermo_show_temp', showTemp); }, [showTemp]);
  useEffect(() => { lsSet('thermo_show_humidity', showHumidity); }, [showHumidity]);
  useEffect(() => { lsSet('thermo_hidden_sensors', Array.from(hiddenSensors)); }, [hiddenSensors]);

  // Fetch outdoor weather once on mount (browser location + Open-Meteo, no key).
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    setWeatherLoading(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}` +
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
      },
      () => setWeatherLoading(false),
      { timeout: 10000, maximumAge: 10 * 60 * 1000 }
    );
  }, []);

  function handleRefreshIntervalChange(val) {
    setRefreshInterval(val);
    localStorage.setItem('thermo_refresh_interval', String(val));
  }

  function toggleSensor(mac) {
    setHiddenSensors((prev) => {
      const next = new Set(prev);
      if (next.has(mac)) next.delete(mac);
      else next.add(mac);
      return next;
    });
  }

  async function renameSensor(mac, current) {
    const next = window.prompt('Rename this sensor:', current);
    if (next == null || next.trim() === '' || next === current) return;
    await supabase.from('sensors').update({ label: next.trim() }).eq('mac', mac);
    setSensors((prev) => prev.map((s) => (s.mac === mac ? { ...s, label: next.trim() } : s)));
  }

  async function exportData() {
    const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[2];
    const since = new Date(Date.now() - range.hours * 3600 * 1000).toISOString();

    // Export the full-resolution history. This project caps each query at 1000
    // rows, so page through with .range() until a short page comes back.
    const pageSize = 1000;
    let from = 0;
    let data = [];
    // safety cap of 60 pages (60k rows) to avoid a runaway loop
    for (let page = 0; page < 60; page++) {
      const { data: chunk } = await supabase
        .from('sensor_history')
        .select('mac,ts,temp_c,humidity,battery')
        .gte('ts', since)
        .order('ts', { ascending: true })
        .range(from, from + pageSize - 1);
      if (!chunk || chunk.length === 0) break;
      data = data.concat(chunk);
      if (chunk.length < pageSize) break;
      from += pageSize;
    }

    const labelOf = Object.fromEntries(sensors.map((s) => [s.mac, s.label || s.name || s.mac]));
    const rows = data.map((r) => ({
      Time: new Date(r.ts).toLocaleString(),
      Sensor: labelOf[r.mac] ?? r.mac,
      'Temp °C': r.temp_c,
      'Temp °F': r.temp_c == null ? null : Number(cToF(r.temp_c).toFixed(1)),
      'Humidity %': r.humidity,
      'Battery %': r.battery,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Readings');
    XLSX.writeFile(wb, `thermometer-readings-${range.key}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function getInsights() {
    setAiError(null);
    setAiLoading(true);
    try {
      // Browser-detected location (Luke chose auto-detect); used for outdoor weather.
      const coords = await new Promise((resolve, reject) => {
        if (!('geolocation' in navigator)) {
          reject(new Error('This browser does not support location.'));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
          (err) =>
            reject(
              new Error(
                err.code === 1
                  ? 'Location permission denied — allow location access to factor in outdoor weather.'
                  : 'Could not get your location.'
              )
            ),
          { timeout: 10000, maximumAge: 10 * 60 * 1000 }
        );
      });

      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lat: coords.lat, lon: coords.lon }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setInsights(data);
      // Refresh the outdoor tile with the (fuller) weather the function returned.
      if (data.weather) {
        setWeather((prev) => ({
          ...prev,
          tempC: data.weather.tempC,
          feelsLikeC: data.weather.feelsLikeC,
          humidity: data.weather.humidity,
          windMph: data.weather.windMph,
        }));
      }
    } catch (e) {
      setAiError(e.message || 'Something went wrong.');
    } finally {
      setAiLoading(false);
    }
  }

  const xTickFmt = (t) => {
    const d = new Date(t);
    return rangeKey === '7d'
      ? d.toLocaleDateString([], { month: 'numeric', day: 'numeric' })
      : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const visibleSensors = sensors.filter((s) => !hiddenSensors.has(s.mac));

  // Per-sensor averages over the visible chart window (for the reference lines).
  // Temps are stored in °C (the axis converts to the chosen unit on display).
  const averages = useMemo(() => {
    const out = {};
    for (const s of sensors) {
      let tSum = 0, tN = 0, hSum = 0, hN = 0;
      for (const row of chartData) {
        const t = row[`temp_${s.mac}`];
        if (t != null) { tSum += t; tN += 1; }
        const h = row[`humidity_${s.mac}`];
        if (h != null) { hSum += h; hN += 1; }
      }
      out[s.mac] = {
        temp: tN ? tSum / tN : null,
        humidity: hN ? hSum / hN : null,
      };
    }
    return out;
  }, [chartData, sensors]);
  const chartTitle = showTemp && showHumidity
    ? `Temperature (°${unit}) & Humidity (%)`
    : showHumidity
    ? 'Humidity (%)'
    : `Temperature (°${unit})`;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <TopNav />
      <main className="max-w-6xl mx-auto px-4 pb-12">
        <header className="mt-6 mb-5 flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Thermometers</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              Live Govee H5100 readings
              {lastRefresh && <span> · updated {lastRefresh.toLocaleTimeString()}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to="/climate"
              className="text-xs px-2.5 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 transition-colors min-h-[36px] flex items-center gap-1.5"
            >
              <Snowflake size={13} className="text-sky-400" /> Climate
            </Link>
            <button
              onClick={() => setUnit((u) => (u === 'F' ? 'C' : 'F'))}
              className="text-xs px-2.5 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 transition-colors min-h-[36px]"
            >
              °{unit}
            </button>

            {/* Grouped database-refresh controls. These re-query Supabase for
                already-stored readings — they do NOT change the sensor read cadence. */}
            <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg pl-2 pr-1 py-1">
              <span
                className="text-zinc-500 hover:text-zinc-300 cursor-help flex items-center"
                title={
                  'These controls re-query the DATABASE for stored readings.\n' +
                  'They do NOT change how often the sensors are read — that is set by ' +
                  'the collector script running on your PC. If the script is running, new ' +
                  'data is already being saved; Refresh just pulls the latest into this view.'
                }
              >
                <Info size={14} />
              </span>
              <select
                value={refreshInterval}
                onChange={(e) => handleRefreshIntervalChange(Number(e.target.value))}
                title="How often this view auto-pulls the latest stored readings"
                className="bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-md px-1.5 py-1.5 text-xs cursor-pointer hover:bg-zinc-800 transition-colors"
              >
                {REFRESH_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button
                onClick={() => loadAll(rangeKey)}
                className="text-xs px-2.5 py-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 transition-colors flex items-center gap-1.5"
              >
                <RefreshCw size={13} /> Refresh
              </button>
            </div>
          </div>
        </header>

        {loading ? (
          <div className="text-sm text-zinc-500 py-16 text-center">Loading readings…</div>
        ) : sensors.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
            No sensors yet. Start the local collector (run-collector.bat) and readings will appear here.
          </div>
        ) : (
          <>
            {/* Live sensor tiles + outdoor weather tile (3 sensors + outdoor = 4 across) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {sensors.map((s) => {
                const r = latest[s.mac];
                const color = colorFor(s.mac);
                const stale = r && Date.now() - new Date(r.ts).getTime() > 10 * 60 * 1000;
                return (
                  <div key={s.mac} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
                        <span className="text-sm font-semibold text-zinc-100 truncate">{s.label || s.name}</span>
                      </div>
                      <button
                        onClick={() => renameSensor(s.mac, s.label || s.name || '')}
                        className="text-zinc-600 hover:text-zinc-300 transition-colors shrink-0"
                        title="Rename"
                      >
                        <Pencil size={13} />
                      </button>
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
                      {weather.dewPointC != null && (
                        <span>Dew point {fmtTemp(weather.dewPointC, unit)}</span>
                      )}
                      <span className="flex items-center gap-1">
                        <Wind size={12} />
                        {Math.round(weather.windMph)} mph
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-zinc-500 leading-relaxed">
                    Allow location access for local weather
                  </div>
                )}
              </div>
            </div>

            {/* AI comfort & AC advice */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 mb-6">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-cyan-400" />
                  <span className="text-sm font-semibold text-zinc-100">Comfort &amp; AC Advice</span>
                </div>
                <button
                  onClick={getInsights}
                  disabled={aiLoading}
                  className="text-xs px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors min-h-[36px] flex items-center gap-1.5 disabled:opacity-60"
                >
                  {aiLoading ? (
                    <><LoaderCircle size={13} className="animate-spin" /> Thinking…</>
                  ) : (
                    <><Sparkles size={13} /> {insights ? 'Refresh advice' : 'Get advice'}</>
                  )}
                </button>
              </div>

              {aiError && <div className="text-xs text-red-400 mb-3">{aiError}</div>}

              {insights?.weather && (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-zinc-400 mb-3 pb-3 border-b border-zinc-800">
                  <span className="flex items-center gap-1.5 text-zinc-200 font-medium">
                    <Cloud size={14} className="text-sky-400" />
                    Outdoor {fmtTemp(insights.weather.tempC, unit)}
                  </span>
                  <span>{insights.weather.description}</span>
                  <span>Feels {fmtTemp(insights.weather.feelsLikeC, unit)}</span>
                  <span className="flex items-center gap-1">
                    <Droplets size={12} className="text-sky-400" />
                    {insights.weather.humidity}%
                  </span>
                  <span className="flex items-center gap-1">
                    <Wind size={12} />
                    {Math.round(insights.weather.windMph)} mph
                  </span>
                  <span className="text-zinc-500">
                    Today {fmtTemp(insights.weather.todayMinC, unit)}–{fmtTemp(insights.weather.todayMaxC, unit)}
                  </span>
                </div>
              )}

              {insights?.advice ? (
                <div className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">{insights.advice}</div>
              ) : !aiLoading && !aiError ? (
                <div className="text-xs text-zinc-500">
                  Get weather-aware comfort &amp; AC suggestions from your current indoor readings and local outdoor
                  conditions. Uses your browser location for weather.
                </div>
              ) : null}

              {insights?.generatedAt && (
                <div className="text-[11px] text-zinc-600 mt-3">
                  Generated {new Date(insights.generatedAt).toLocaleString()}
                </div>
              )}
            </div>

            {/* Chart controls: time range + metric toggle ........ export */}
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
                  {RANGES.map((r) => (
                    <button
                      key={r.key}
                      onClick={() => setRangeKey(r.key)}
                      className={`text-xs px-3 py-1.5 rounded-md transition-colors min-h-[32px] ${
                        rangeKey === r.key ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
                  <button
                    onClick={() => setShowTemp((v) => !v)}
                    className={`text-xs px-3 py-1.5 rounded-md transition-colors min-h-[32px] flex items-center gap-1.5 ${
                      showTemp ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Thermometer size={12} /> Temp
                  </button>
                  <button
                    onClick={() => setShowHumidity((v) => !v)}
                    className={`text-xs px-3 py-1.5 rounded-md transition-colors min-h-[32px] flex items-center gap-1.5 ${
                      showHumidity ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Droplets size={12} /> Humidity
                  </button>
                </div>
              </div>
              <button
                onClick={exportData}
                className="text-xs px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 transition-colors min-h-[36px] flex items-center gap-1.5"
              >
                <Download size={13} /> Export Excel
              </button>
            </div>

            {/* Sensor visibility toggles */}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className="text-[11px] uppercase tracking-wide text-zinc-600">Sensors:</span>
              {sensors.map((s) => {
                const on = !hiddenSensors.has(s.mac);
                const color = colorFor(s.mac);
                return (
                  <button
                    key={s.mac}
                    onClick={() => toggleSensor(s.mac)}
                    className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
                      on
                        ? 'bg-zinc-800 border-zinc-700 text-zinc-100'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-500'
                    }`}
                    title={on ? 'Click to hide from graph' : 'Click to show on graph'}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ background: on ? color : '#3f3f46' }}
                    />
                    {s.label || s.name}
                  </button>
                );
              })}
            </div>

            {/* History chart */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="text-xs text-zinc-500 mb-3">{chartTitle}</div>
              {chartData.length === 0 ? (
                <div className="h-72 flex items-center justify-center text-sm text-zinc-600 text-center px-4">
                  No history in this range yet. Run the history downloader (history_pull.py) to pull stored readings from the sensors.
                </div>
              ) : !showTemp && !showHumidity ? (
                <div className="h-72 flex items-center justify-center text-sm text-zinc-600">
                  Select at least one metric above.
                </div>
              ) : visibleSensors.length === 0 ? (
                <div className="h-72 flex items-center justify-center text-sm text-zinc-600">
                  All sensors hidden — click a sensor above to show it.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData} margin={{ top: 5, right: showTemp && showHumidity ? 45 : 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis
                      dataKey="ts"
                      type="number"
                      scale="time"
                      domain={['dataMin', 'dataMax']}
                      tickFormatter={xTickFmt}
                      stroke="#52525b"
                      fontSize={11}
                    />
                    {showTemp && (
                      <YAxis
                        yAxisId="temp"
                        stroke="#52525b"
                        fontSize={11}
                        tickFormatter={(v) => (unit === 'F' ? Math.round(cToF(v)) : Math.round(v))}
                        domain={['auto', 'auto']}
                      />
                    )}
                    {showHumidity && (
                      <YAxis
                        yAxisId="humidity"
                        orientation={showTemp ? 'right' : 'left'}
                        stroke="#52525b"
                        fontSize={11}
                        domain={[0, 100]}
                        tickFormatter={(v) => `${v}%`}
                      />
                    )}
                    <Tooltip
                      contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
                      labelFormatter={(t) => new Date(t).toLocaleString()}
                      formatter={(value, name) =>
                        name.endsWith(' (hum)')
                          ? [value == null ? '—' : `${Number(value).toFixed(1)}%`, name]
                          : [fmtTemp(value, unit), name]
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {/* Per-sensor average reference lines for the selected window */}
                    {showTemp && visibleSensors.map((s) => {
                      const a = averages[s.mac]?.temp;
                      if (a == null) return null;
                      return (
                        <ReferenceLine
                          key={`avgT_${s.mac}`}
                          yAxisId="temp"
                          y={a}
                          stroke={colorFor(s.mac)}
                          strokeDasharray="2 4"
                          strokeOpacity={0.55}
                          label={{ value: `avg ${fmtTemp(a, unit)}`, position: 'insideRight', fill: colorFor(s.mac), fontSize: 10 }}
                        />
                      );
                    })}
                    {showHumidity && visibleSensors.map((s) => {
                      const a = averages[s.mac]?.humidity;
                      if (a == null) return null;
                      return (
                        <ReferenceLine
                          key={`avgH_${s.mac}`}
                          yAxisId="humidity"
                          y={a}
                          stroke={colorFor(s.mac)}
                          strokeDasharray="2 4"
                          strokeOpacity={0.4}
                          label={{ value: `avg ${a.toFixed(0)}%`, position: 'insideLeft', fill: colorFor(s.mac), fontSize: 10 }}
                        />
                      );
                    })}
                    {showTemp && visibleSensors.map((s) => (
                      <Line
                        key={`temp_${s.mac}`}
                        yAxisId="temp"
                        type="monotone"
                        dataKey={`temp_${s.mac}`}
                        name={s.label || s.name}
                        stroke={colorFor(s.mac)}
                        dot={false}
                        connectNulls
                        strokeWidth={2}
                        isAnimationActive={false}
                      />
                    ))}
                    {showHumidity && visibleSensors.map((s) => (
                      <Line
                        key={`hum_${s.mac}`}
                        yAxisId="humidity"
                        type="monotone"
                        dataKey={`humidity_${s.mac}`}
                        name={`${s.label || s.name} (hum)`}
                        stroke={colorFor(s.mac)}
                        dot={false}
                        connectNulls
                        strokeWidth={2}
                        strokeDasharray="4 2"
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
