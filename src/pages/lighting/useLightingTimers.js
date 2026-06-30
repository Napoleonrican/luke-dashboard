import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';

// The strip's 4 native on/off timer slots (lighting_timers table, slots 0-3).
// Separate from useLightingSchedule (wake/bedtime). The Pi writes each slot into
// the strip's flash over BLE; the timers then run on the strip itself.

export const DEFAULT_TIMERS = [0, 1, 2, 3].map((slot) => ({
  slot,
  enabled: false,
  turn_on: false,
  hour: 0,
  minute: 0,
  days: 127, // bit0=Sun…bit6=Sat; 127 = every day, 0 = do not repeat
}));

const tableMissing = (error) =>
  !!error && (error.code === 'PGRST205' || /lighting_timers/i.test(error.message || ''));

const DEBOUNCE_MS = 600;

export function useLightingTimers() {
  const [timers, setTimers] = useState(DEFAULT_TIMERS);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  const ref = useRef(timers);
  useEffect(() => { ref.current = timers; }, [timers]);

  // One debounce timer per slot so editing slot 0 doesn't delay flushing slot 1.
  const debounceTimers = useRef({});

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('lighting_timers').select('*').order('slot');
    if (error) {
      if (tableMissing(error)) setMissing(true);
    } else if (data?.length) {
      // Merge onto defaults so a missing slot row still renders.
      const merged = DEFAULT_TIMERS.map(
        (d) => data.find((r) => r.slot === d.slot) ?? d
      );
      setTimers(merged);
      setMissing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [load]);

  const flush = useCallback(async (slot) => {
    if (!supabase) return;
    const row = ref.current.find((t) => t.slot === slot);
    if (!row) return;
    const { error } = await supabase.from('lighting_timers').upsert({
      ...row, slot, updated_at: new Date().toISOString(),
    });
    if (tableMissing(error)) setMissing(true);
  }, []);

  // Update one slot: local state immediately, debounced upsert.
  const updateTimer = useCallback((slot, partial) => {
    const next = ref.current.map((t) => (t.slot === slot ? { ...t, ...partial } : t));
    ref.current = next;
    setTimers(next);
    if (!supabase) return;
    clearTimeout(debounceTimers.current[slot]);
    debounceTimers.current[slot] = setTimeout(() => flush(slot), DEBOUNCE_MS);
  }, [flush]);

  return { timers, loading, missing, updateTimer };
}
