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
  wake_days: 127,
  sleep_fade_min: 15,
  sleep_brightness: 40,
  bedtime_trigger_at: null,
};

const tableMissing = (error) =>
  !!error && (error.code === 'PGRST205' || /lighting_schedule/i.test(error.message || ''));

// How long after the last change before we flush to Supabase. Sliders fire on
// every drag pixel — without debouncing, each pixel triggers a BLE write on the
// Pi, which saturates the radio and locks up the UI.
const DEBOUNCE_MS = 600;

export function useLightingSchedule() {
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [bedtimeSentAt, setBedtimeSentAt] = useState(null);

  const ref = useRef(schedule);
  useEffect(() => { ref.current = schedule; }, [schedule]);

  // Pending debounce timer — one timer shared across all slider changes.
  const debounceTimer = useRef(null);
  // Whether there's a flush in flight (prevent double-send on rapid toggles).
  const flushing = useRef(false);

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

  const flush = useCallback(async () => {
    if (!supabase || flushing.current) return;
    flushing.current = true;
    const snap = ref.current;
    const { error } = await supabase.from('lighting_schedule').upsert({
      ...snap, id: 1, updated_at: new Date().toISOString(),
    });
    flushing.current = false;
    if (tableMissing(error)) setMissing(true);
  }, []);

  // applyChange: update local state immediately (responsive UI), schedule a
  // debounced Supabase write so slider drags only produce one network call.
  const applyChange = useCallback((partial, { immediate = false } = {}) => {
    const next = { ...ref.current, ...partial };
    ref.current = next;
    setSchedule(next);
    if (!supabase) return;
    clearTimeout(debounceTimer.current);
    if (immediate) {
      flush();
    } else {
      debounceTimer.current = setTimeout(flush, DEBOUNCE_MS);
    }
  }, [flush]);

  // Toggles and discrete pickers (not sliders) flush immediately.
  const updateWake = useCallback((partial) => {
    const isSlider = Object.keys(partial).some((k) =>
      ['wake_fade_min', 'wake_brightness'].includes(k));
    applyChange(partial, { immediate: !isSlider });
  }, [applyChange]);

  const updateSleep = useCallback((partial) => {
    const isSlider = Object.keys(partial).some((k) =>
      ['sleep_fade_min', 'sleep_brightness'].includes(k));
    applyChange(partial, { immediate: !isSlider });
  }, [applyChange]);

  // Bedtime trigger always flushes immediately — timing matters.
  const startBedtime = useCallback(async () => {
    const ts = new Date().toISOString();
    applyChange({ bedtime_trigger_at: ts }, { immediate: true });
    setBedtimeSentAt(new Date());
  }, [applyChange]);

  return {
    schedule, loading, missing, lastRefresh, bedtimeSentAt, reload: load,
    updateWake, updateSleep, startBedtime,
  };
}
