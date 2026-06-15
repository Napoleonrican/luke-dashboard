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

// Climate: latest reading per sensor + the AC's current control mode.
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

    const temps = latest.map((r) => r?.temp_c).filter((t) => t != null);
    const avgC = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;

    // Control mode: comfort mode wins, else the executor kill-switch decides.
    const { data: comfort } = await supabase
      .from('ac_comfort_mode')
      .select('active')
      .eq('active', true)
      .limit(1);
    let acState = 'Manual control';
    if (comfort?.length) {
      acState = 'Comfort Mode';
    } else {
      const { data: prefs } = await supabase
        .from('ac_preferences')
        .select('executor_enabled')
        .eq('id', 1)
        .limit(1);
      acState = prefs?.[0]?.executor_enabled ? 'Dashboard control' : 'Manual control';
    }

    return {
      indoorTemp: avgC != null ? fmtTemp(avgC, unit) : null,
      sensorCount: sensors.length,
      acState,
    };
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
  const [data, setData] = useState({ climate: null, backlog: null, gig: null, outdoor: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const unit = readUnit();
    const gig = loadGig();
    (async () => {
      const [climate, backlog, outdoor] = await Promise.all([
        loadClimate(unit),
        loadBacklog(),
        loadWeather(unit),
      ]);
      if (!cancelled) {
        setData({ climate, backlog, gig, outdoor });
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { ...data, loading };
}
