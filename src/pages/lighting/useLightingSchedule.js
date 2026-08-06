import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isMissingTableError } from '../../lib/supabase';

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
  // Whether a flush was skipped while one was in flight — triggers a trailing re-flush.
  const dirty = useRef(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('lighting_schedule').select('*').eq('id', 1).limit(1);
    if (error) {
      if (isMissingTableError(error)) setMissing(true);
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
    if (!supabase) return;
    if (flushing.current) {
      // A write is already in flight; mark dirty so it re-flushes with the
      // latest state once the current upsert resolves. Without this, rapid
      // discrete taps (e.g. day-picker) can silently lose all but the first.
      dirty.current = true;
      return;
    }
    flushing.current = true;
    dirty.current = false;
    const snap = ref.current;
    const { error } = await supabase.from('lighting_schedule').upsert({
      ...snap, id: 1, updated_at: new Date().toISOString(),
    });
    flushing.current = false;
    if (isMissingTableError(error)) setMissing(true);
    // If any writes were skipped during the in-flight upsert, flush once more
    // with the latest ref state so nothing is silently dropped.
    if (dirty.current) {
      dirty.current = false;
      flush();
    }
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

  // Bedtime trigger is a one-shot command, not a setting, so it does NOT go
  // through the debounced full-row upsert: we write just the trigger column and
  // report whether it actually landed. The old path fired and forgot — the
  // button said "Started" even when the write never happened — and could also be
  // swallowed by the in-flight/debounce guard in flush(). Returns true on a
  // confirmed write.
  const startBedtime = useCallback(async () => {
    if (!supabase) return false;
    const ts = new Date().toISOString();
    const next = { ...ref.current, bedtime_trigger_at: ts };
    ref.current = next;
    setSchedule(next);
    const { data, error } = await supabase
      .from('lighting_schedule')
      .update({ bedtime_trigger_at: ts, updated_at: ts })
      .eq('id', 1)
      .select('id');
    if (error) {
      if (isMissingTableError(error)) setMissing(true);
      return false;
    }
    // No error but no row touched means the config row is missing — the Pi will
    // never see a trigger, so this is a failure, not a success.
    if (!data?.length) return false;
    setBedtimeSentAt(new Date());
    return true;
  }, []);

  return {
    schedule, loading, missing, lastRefresh, bedtimeSentAt, reload: load,
    updateWake, updateSleep, startBedtime,
  };
}
