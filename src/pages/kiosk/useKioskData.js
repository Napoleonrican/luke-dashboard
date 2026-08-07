import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { APARTMENT_COORDS } from '../climate/useClimateData';

// Data for the living-room kiosk display: every tracked indoor sensor,
// outdoor current conditions + short forecast, and a brief "what's the AC
// doing" readout. Deliberately separate from useClimateData/useHomeData —
// the kiosk has no auth/schedule-editing concerns, just needs to poll a
// handful of read-only values and never throw on a flaky panel.

const REFRESH_MS = 5 * 60 * 1000; // 5 min — plenty fresh for a wall display
const OUTDOOR_SENSOR_MAX_AGE_MIN = 10; // mirrors controller.py / useClimateData

// Latest reading at-or-before `sinceIso` — used to diff "now" against ~1h ago.
async function loadReadingBefore(table, macFilter, sinceIso) {
  let q = supabase.from(table).select('*').lte(table === 'sensor_readings' ? 'ts' : 'at', sinceIso);
  if (macFilter) q = q.eq('mac', macFilter);
  const { data } = await q.order(table === 'sensor_readings' ? 'ts' : 'at', { ascending: false }).limit(1);
  return data?.[0] ?? null;
}

async function loadSensors() {
  if (!supabase) return [];
  try {
    const hourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: sensors } = await supabase.from('sensors').select('mac,name,label').order('created_at');
    if (!sensors?.length) return [];
    const withReadings = await Promise.all(
      sensors.map(async (s) => {
        const [{ data: latestData }, past] = await Promise.all([
          supabase.from('sensor_readings').select('temp_c,humidity,ts').eq('mac', s.mac).order('ts', { ascending: false }).limit(1),
          loadReadingBefore('sensor_readings', s.mac, hourAgoIso),
        ]);
        const reading = latestData?.[0] ?? null;
        const deltaC = reading?.temp_c != null && past?.temp_c != null ? reading.temp_c - past.temp_c : null;
        return {
          mac: s.mac,
          label: s.label || s.name || s.mac,
          tempC: reading?.temp_c ?? null,
          humidity: reading?.humidity ?? null,
          ts: reading?.ts ?? null,
          deltaC,
        };
      })
    );
    return withReadings;
  } catch {
    return [];
  }
}

// Real outdoor sensor (Govee H5107, outdoor_readings table) — same source and
// staleness rule as Climate Overview. Falls back to the Open-Meteo tile in the
// UI when this is null (sensor offline/stale).
async function loadOutdoorSensor() {
  if (!supabase) return null;
  try {
    const hourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const [{ data }, past] = await Promise.all([
      supabase.from('outdoor_readings').select('at,temp_f,humidity').order('at', { ascending: false }).limit(1),
      loadReadingBefore('outdoor_readings', null, hourAgoIso),
    ]);
    const row = data?.[0];
    if (!row || row.temp_f == null) return null;
    const ageMin = (Date.now() - new Date(row.at).getTime()) / 60000;
    if (ageMin > OUTDOOR_SENSOR_MAX_AGE_MIN) return null;
    const deltaF = past?.temp_f != null ? row.temp_f - past.temp_f : null;
    return { tempF: row.temp_f, humidity: row.humidity, at: row.at, deltaF };
  } catch {
    return null;
  }
}

// Aggregates a run of hourly entries into one summary tile: high/low across
// the window, the max precip chance, and a "representative" icon — the code
// from whichever hour in the window has the highest precip chance (the most
// notable moment), falling back to the first hour's code when it's all dry.
function summarizeHours(hours, startI, endI) {
  const slice = hours.slice(startI, endI + 1);
  if (slice.length === 0) return null;
  const temps = slice.map((h) => h.tempF).filter((t) => t != null);
  const precips = slice.map((h) => h.precipProb).filter((p) => p != null);
  let repIdx = 0;
  let bestP = -1;
  slice.forEach((h, i) => { if (h.precipProb != null && h.precipProb > bestP) { bestP = h.precipProb; repIdx = i; } });
  return {
    maxF: temps.length ? Math.max(...temps) : null,
    minF: temps.length ? Math.min(...temps) : null,
    precipProb: precips.length ? Math.max(...precips) : null,
    code: slice[repIdx]?.code ?? null,
  };
}

async function loadWeather() {
  try {
    const { lat, lon } = APARTMENT_COORDS;
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code` +
      `&hourly=temperature_2m,weather_code,precipitation_probability` +
      `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
      `&temperature_unit=fahrenheit&timezone=auto&forecast_days=3`
    );
    const d = await res.json();
    const c = d.current;
    // current.time isn't necessarily exactly on an hour boundary, so an
    // indexOf against hourly.time (which is) can silently miss and fall back
    // to index 0 — i.e. midnight, however far in the past. Find the first
    // hourly slot at or after now instead.
    const now = new Date();
    const hourlyTimes = d.hourly?.time ?? [];
    let startIdx = hourlyTimes.findIndex((t) => new Date(t) >= now);
    if (startIdx === -1) startIdx = 0;
    // Pull enough hours to cover the widest bucket (next 12h) below.
    const hours = hourlyTimes
      .slice(startIdx, startIdx + 13)
      .map((t, i) => ({
        time: t,
        tempF: d.hourly.temperature_2m[startIdx + i],
        code: d.hourly.weather_code[startIdx + i],
        precipProb: d.hourly.precipitation_probability?.[startIdx + i] ?? null,
      }));
    // Three summary windows, like a weather-station display: the immediate
    // next hour on its own, then two widening lookaheads.
    const hourlyBuckets = [
      { label: 'Next Hr', ...summarizeHours(hours, 0, 0) },
      { label: '1-6 Hrs', ...summarizeHours(hours, 1, 6) },
      { label: '6-12 Hrs', ...summarizeHours(hours, 7, 12) },
    ].filter((b) => b.maxF != null || b.minF != null);
    const daily = (d.daily?.time ?? []).slice(0, 3).map((t, i) => ({
      date: t,
      maxF: d.daily.temperature_2m_max[i],
      minF: d.daily.temperature_2m_min[i],
      code: d.daily.weather_code[i],
    }));
    return {
      tempF: c?.temperature_2m ?? null,
      feelsLikeF: c?.apparent_temperature ?? null,
      humidity: c?.relative_humidity_2m ?? null,
      code: c?.weather_code ?? null,
      hourlyBuckets,
      daily,
    };
  } catch {
    return null;
  }
}

// Brief "what's the AC doing and why" — mirrors the Home hub's ClimateRail
// card (same acState/acSetting/lastLog shape as useHomeData's loadClimate),
// just its own query here since the kiosk has no other reason to import the
// Home data hook.
async function loadAc() {
  if (!supabase) return null;
  try {
    const { data: comfort } = await supabase.from('ac_comfort_mode').select('active').eq('active', true).limit(1);
    const comfortActive = Boolean(comfort?.length);

    const { data: prefs } = await supabase
      .from('ac_preferences')
      .select('executor_enabled,ac_confirmed_power,ac_confirmed_setpoint_f,ac_confirmed_mode,ac_confirmed_fan')
      .eq('id', 1)
      .limit(1);
    const pref = prefs?.[0] ?? null;
    const executorEnabled = Boolean(pref?.executor_enabled);
    const stateLabel = comfortActive ? 'Schedule Override' : executorEnabled ? 'Dashboard control' : 'Manual control';
    const settingLine = pref && (pref.ac_confirmed_setpoint_f != null || pref.ac_confirmed_mode || pref.ac_confirmed_power === false)
      ? [
          pref.ac_confirmed_power === false ? 'Off' : null,
          pref.ac_confirmed_setpoint_f != null ? `${pref.ac_confirmed_setpoint_f}°` : null,
          pref.ac_confirmed_mode,
          pref.ac_confirmed_fan && `fan ${pref.ac_confirmed_fan}`,
        ].filter(Boolean).join(' · ')
      : null;

    const { data: logRows } = await supabase
      .from('ac_change_log')
      .select('ts,source,detail,reason')
      .order('ts', { ascending: false })
      .limit(1);
    const lastLog = logRows?.[0] ? { ts: logRows[0].ts, reason: logRows[0].reason || logRows[0].detail || null } : null;

    return { stateLabel, settingLine, lastLog };
  } catch {
    return null;
  }
}

export function useKioskData() {
  const [sensors, setSensors] = useState([]);
  const [weather, setWeather] = useState(null);
  const [outdoorSensor, setOutdoorSensor] = useState(null);
  const [ac, setAc] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [s, w, o, a] = await Promise.all([loadSensors(), loadWeather(), loadOutdoorSensor(), loadAc()]);
    setSensors(s);
    setWeather(w);
    setOutdoorSensor(o);
    setAc(a);
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  return { sensors, weather, outdoorSensor, ac, lastRefresh, loading };
}
