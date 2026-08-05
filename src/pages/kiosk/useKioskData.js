import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { APARTMENT_COORDS } from '../climate/useClimateData';

// Data for the living-room kiosk display: every tracked indoor sensor plus
// outdoor current conditions + short forecast. Deliberately separate from
// useClimateData — the kiosk has no AC/schedule/auth concerns, just needs to
// poll a handful of read-only values and never throw on a flaky panel.

const REFRESH_MS = 5 * 60 * 1000; // 5 min — plenty fresh for a wall display

async function loadSensors() {
  if (!supabase) return [];
  try {
    const { data: sensors } = await supabase.from('sensors').select('mac,name,label').order('created_at');
    if (!sensors?.length) return [];
    const withReadings = await Promise.all(
      sensors.map(async (s) => {
        const { data } = await supabase
          .from('sensor_readings')
          .select('temp_c,humidity,ts')
          .eq('mac', s.mac)
          .order('ts', { ascending: false })
          .limit(1);
        const reading = data?.[0] ?? null;
        return {
          mac: s.mac,
          label: s.label || s.name || s.mac,
          tempC: reading?.temp_c ?? null,
          humidity: reading?.humidity ?? null,
          ts: reading?.ts ?? null,
        };
      })
    );
    return withReadings;
  } catch {
    return [];
  }
}

async function loadWeather() {
  try {
    const { lat, lon } = APARTMENT_COORDS;
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code` +
      `&hourly=temperature_2m,weather_code` +
      `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
      `&temperature_unit=fahrenheit&timezone=auto&forecast_days=4`
    );
    const d = await res.json();
    const c = d.current;
    const nowIso = d.current?.time;
    const hourlyIdx = d.hourly?.time?.indexOf(nowIso) ?? -1;
    const startIdx = hourlyIdx >= 0 ? hourlyIdx + 1 : 0;
    const hourly = (d.hourly?.time ?? [])
      .slice(startIdx, startIdx + 6)
      .map((t, i) => ({
        time: t,
        tempF: d.hourly.temperature_2m[startIdx + i],
        code: d.hourly.weather_code[startIdx + i],
      }));
    const daily = (d.daily?.time ?? []).slice(0, 4).map((t, i) => ({
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
      hourly,
      daily,
    };
  } catch {
    return null;
  }
}

export function useKioskData() {
  const [sensors, setSensors] = useState([]);
  const [weather, setWeather] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [s, w] = await Promise.all([loadSensors(), loadWeather()]);
    setSensors(s);
    setWeather(w);
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  return { sensors, weather, lastRefresh, loading };
}
