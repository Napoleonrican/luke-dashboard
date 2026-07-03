import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { fmtTemp, APARTMENT_COORDS } from './climate/useClimateData';

// Lightweight summary data for the landing page. Fires a few small reads in
// parallel and returns a per-tool slice plus the live snapshot. Every slice is
// independently guarded: if Supabase is absent, a query errors, or there's no
// data, that slice resolves to null and the tile/chip falls back to its static
// copy — the page never blanks out or throws.

// Respect the unit Luke last picked on the Climate pages (defaults to °F).
function readUnit() {
  try {
    const v = localStorage.getItem('thermo_unit');
    return v ? JSON.parse(v) : 'F';
  } catch {
    return 'F';
  }
}

// Climate: living-room reading (best ambient proxy) + the AC's current control mode.
async function loadClimate(unit) {
  if (!supabase) return null;
  try {
    const { data: sensors } = await supabase.from('sensors').select('mac,name,label').order('created_at');
    if (!sensors?.length) return null;

    const latest = await Promise.all(
      sensors.map(async (s) => {
        const { data } = await supabase
          .from('sensor_readings')
          .select('temp_c,ts')
          .eq('mac', s.mac)
          .order('ts', { ascending: false })
          .limit(1);
        return data?.[0] ?? null;
      })
    );

    // Prefer the living-room sensor's reading — most accurate ambient temp.
    // Fall back to the all-sensor average if it isn't found (e.g. renamed).
    const livingIdx = sensors.findIndex((s) => /living/i.test(s.label || s.name || ''));
    const temps = latest.map((r) => r?.temp_c).filter((t) => t != null);
    const avgC = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
    const livingReading = livingIdx >= 0 ? latest[livingIdx] : null;
    const indoorC = livingReading?.temp_c != null ? livingReading.temp_c : avgC;

    // Freshest reading timestamp → staleness flag for the status dot (10-min rule
    // mirrors Climate Overview).
    const tsList = latest.map((r) => r?.ts).filter(Boolean).map((t) => new Date(t).getTime());
    const freshest = tsList.length ? Math.max(...tsList) : null;
    const stale = freshest != null && Date.now() - freshest > 10 * 60 * 1000;

    // Last 24h of the living-room sensor for the tile sparkline (downsampled).
    let spark = null;
    const livingMac = livingIdx >= 0 ? sensors[livingIdx].mac : null;
    if (livingMac) {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data: hist } = await supabase
        .from('sensor_readings')
        .select('temp_c,ts')
        .eq('mac', livingMac)
        .gte('ts', since)
        .order('ts', { ascending: true });
      const vals = (hist ?? []).map((r) => r.temp_c).filter((t) => t != null);
      if (vals.length >= 2) {
        // Downsample to ~40 evenly-spaced points.
        const step = Math.max(1, Math.ceil(vals.length / 40));
        spark = vals.filter((_, i) => i % step === 0);
      }
    }

    // Control mode: comfort mode wins, else the executor kill-switch decides.
    const { data: comfort } = await supabase
      .from('ac_comfort_mode')
      .select('active')
      .eq('active', true)
      .limit(1);
    const comfortActive = Boolean(comfort?.length);

    // AC preferences: executor kill-switch + the last confirmed AC settings
    // (power/setpoint/mode/fan) so the rail can show what the AC is actually set to.
    const { data: prefs } = await supabase
      .from('ac_preferences')
      .select('executor_enabled,ac_confirmed_power,ac_confirmed_setpoint_f,ac_confirmed_mode,ac_confirmed_fan')
      .eq('id', 1)
      .limit(1);
    const pref = prefs?.[0] ?? null;
    const executorEnabled = Boolean(pref?.executor_enabled);
    const acState = comfortActive
      ? 'Comfort Mode'
      : executorEnabled ? 'Dashboard control' : 'Manual control';

    // Confirmed AC setting (null fields collapse to nulls the rail can skip).
    const acSetting = pref
      ? {
          power: pref.ac_confirmed_power ?? null,
          setpointF: pref.ac_confirmed_setpoint_f ?? null,
          mode: pref.ac_confirmed_mode ?? null,
          fan: pref.ac_confirmed_fan ?? null,
        }
      : null;

    // Latest agent-log entry (ac_change_log) — the "last thing an agent did"
    // Luke opens Climate to check.
    let lastLog = null;
    const { data: logRows } = await supabase
      .from('ac_change_log')
      .select('ts,source,action,detail,reason')
      .order('ts', { ascending: false })
      .limit(1);
    if (logRows?.[0]) {
      const r = logRows[0];
      lastLog = { ts: r.ts, source: r.source, text: r.detail || r.action, reason: r.reason || null };
    }

    return {
      indoorTemp: indoorC != null ? fmtTemp(indoorC, unit) : null,
      sensorCount: sensors.length,
      acState,
      comfortActive,
      executorEnabled,
      acSetting,
      lastLog,
      stale,
      spark,
    };
  } catch {
    return null;
  }
}

// Lighting: current strip state (power / brightness / rough color name).
async function loadLighting() {
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from('strip_state')
      .select('power,brightness,r,g,b,scene')
      .eq('id', 1)
      .limit(1);
    const s = data?.[0];
    if (!s) return null;
    // Rough color label without importing the lighting module's helper.
    const { r, g, b } = s;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let label = 'color';
    if (max - min < 25) label = max > 200 ? 'white' : 'dim white';
    else if (r >= g && g >= b) label = g > 120 ? 'warm white' : 'red/orange';
    else if (g >= r && r >= b) label = 'green';
    else if (b >= g && g >= r) label = 'blue';
    else if (r >= b && b >= g) label = 'pink';
    return { power: !!s.power, brightness: s.brightness, label, scene: s.scene };
  } catch {
    return null;
  }
}

// AI Backlog: active task counts.
async function loadBacklog() {
  if (!supabase) return null;
  try {
    const { data } = await supabase.from('ai_backlog_tasks').select('status');
    if (!data?.length) return null;
    return {
      pending: data.filter((t) => t.status === 'pending').length,
      inProgress: data.filter((t) => t.status === 'in_progress').length,
    };
  } catch {
    return null;
  }
}

// Gig Tracker: live shift state lives in localStorage (no server round-trip).
function loadGig() {
  try {
    const raw = localStorage.getItem('gig_tracker_state');
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s?.shiftStarted) return null;
    const log = Array.isArray(s.orderLog) ? s.orderLog : [];
    const earnings = log.reduce((sum, o) => sum + (Number(o?.amount) || 0), 0);
    return { active: true, earnings, orders: log.length };
  } catch {
    return null;
  }
}

// Claude usage pace: % of the 7-day billing cycle elapsed since last Wed 7 AM.
// Pure date math — no API call. Shows how much of the weekly budget window has
// been used so Luke can pace his Claude usage evenly across the week.
function loadClaudeUsage() {
  const now = new Date();
  // getDay(): 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
  const daysBack = (now.getDay() + 7 - 3) % 7;
  const lastWed = new Date(now);
  lastWed.setDate(now.getDate() - daysBack);
  lastWed.setHours(7, 0, 0, 0);
  // If the computed Wed 7 AM is still in the future (we're Wed before 7 AM), go back a week.
  if (lastWed > now) lastWed.setDate(lastWed.getDate() - 7);
  const pct = Math.min(100, ((now - lastWed) / (7 * 24 * 60 * 60 * 1000)) * 100);
  return { pct: Math.round(pct * 10) / 10 };
}

// Outdoor weather for the apartment (Open-Meteo, no key) — same source the
// Climate Overview tile uses.
async function loadWeather(unit) {
  try {
    const { lat, lon } = APARTMENT_COORDS;
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m&forecast_days=1`
    );
    const d = await res.json();
    const c = d?.current?.temperature_2m;
    return c != null ? fmtTemp(c, unit) : null;
  } catch {
    return null;
  }
}

export function useHomeData() {
  const [data, setData] = useState({ climate: null, backlog: null, gig: null, outdoor: null, lighting: null, claude: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const unit = readUnit();
    const gig = loadGig();
    const claude = loadClaudeUsage();
    (async () => {
      const [climate, backlog, outdoor, lighting] = await Promise.all([
        loadClimate(unit),
        loadBacklog(),
        loadWeather(unit),
        loadLighting(),
      ]);
      if (!cancelled) {
        setData({ climate, backlog, gig, outdoor, lighting, claude });
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { ...data, loading };
}
