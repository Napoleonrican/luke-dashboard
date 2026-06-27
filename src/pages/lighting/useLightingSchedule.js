import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';

// Schedule config for the Lighting → Schedule page. Separate from useLightingData
// (which is live color/power state): this is the onboard wake/bedtime config that
// the Pi writes into the strip's flash. Single row, id=1.

export const DEFAULT_SCHEDULE = {
  id: 1,
  wake_enabled: false,
  wake_hour: 7,
  wake_minute: 0,
  wake_fade_min: 15,
  wake_brightness: 100,
  sleep_fade_min: 15,
  sleep_brightness: 40,
  bedtime_trigger_at: null,
};

const tableMissing = (error) =>
  !!error && (error.code === 'PGRST205' || /lighting_schedule/i.test(error.message || ''));

export function useLightingSchedule() {
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [bedtimeSentAt, setBedtimeSentAt] = useState(null); // for UI feedback

  const ref = useRef(schedule);
  useEffect(() => { ref.current = schedule; }, [schedule]);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('lighting_schedule').select('*').eq('id', 1).limit(1);
    if (error) {
      if (tableMissing(error)) setMissing(true);
    } else if (data?.[0]) {
      setSchedule({ ...DEFAULT_SCHEDULE, ...data[0] });
      setMissing(false);
    }
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [load]);

  const applyChange = useCallback(async (partial) => {
    const next = { ...ref.current, ...partial };
    ref.current = next;
    setSchedule(next);
    if (!supabase) return;
    const { error } = await supabase.from('lighting_schedule').upsert({
      ...next, id: 1, updated_at: new Date().toISOString(),
    });
    if (tableMissing(error)) setMissing(true);
  }, []);

  // Convenience writers.
  const updateWake = useCallback((partial) => applyChange(partial), [applyChange]);
  const updateSleep = useCallback((partial) => applyChange(partial), [applyChange]);

  // Fire the on-demand bedtime: bump bedtime_trigger_at; the Pi runs it once.
  const startBedtime = useCallback(async () => {
    const ts = new Date().toISOString();
    await applyChange({ bedtime_trigger_at: ts });
    setBedtimeSentAt(new Date());
  }, [applyChange]);

  return {
    schedule, loading, missing, lastRefresh, bedtimeSentAt, reload: load,
    updateWake, updateSleep, startBedtime,
  };
}
