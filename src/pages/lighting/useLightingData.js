import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';

// Shared lighting data for the Lighting master-detail pages. LightingLayout calls
// this once and passes the result down via <Outlet context>, so Controls and
// Scenes share one Supabase fetch and a single optimistic writer.

export const DEFAULT_STATE = { id: 1, power: false, brightness: 100, r: 255, g: 160, b: 60, scene: null };

const tableMissing = (error) =>
  !!error && (error.code === 'PGRST205' || /strip_state/i.test(error.message || ''));

// ── color helpers (shared with the Controls page) ──────────────────────────
const clamp = (v) => Math.max(0, Math.min(255, v | 0));
export const rgbToHex = (r, g, b) =>
  '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('');
export const hexToRgb = (hex) => {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return Number.isNaN(n) ? { r: 255, g: 255, b: 255 } : { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

// A rough human label for the current color, for status chips.
export function colorName({ r, g, b }) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max - min < 25) return max > 200 ? 'white' : max > 90 ? 'dim white' : 'dark';
  if (r >= g && g >= b) return g > 120 ? 'warm white' : 'red/orange';
  if (g >= r && r >= b) return 'green';
  if (b >= g && g >= r) return 'blue';
  if (r >= b && b >= g) return 'pink/magenta';
  return 'color';
}

export function useLightingData() {
  const [strip, setStrip] = useState(DEFAULT_STATE);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);   // strip_state table not created yet
  const [lastRefresh, setLastRefresh] = useState(null);

  // Keep a ref of the current state so setState merges work without stale closures.
  const stripRef = useRef(strip);
  useEffect(() => { stripRef.current = strip; }, [strip]);

  const load = useCallback(async () => {
    if (!supabase) return false;
    const { data, error } = await supabase.from('strip_state').select('*').eq('id', 1).limit(1);
    if (error) {
      if (tableMissing(error)) setMissing(true);
    } else if (data?.[0]) {
      setStrip({ ...DEFAULT_STATE, ...data[0] });
      setMissing(false);
    }
    setLastRefresh(new Date());
    return true;
  }, []);

  // Initial fetch. The async IIFE keeps setState off the synchronous effect path.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [load]);

  // Apply a partial change: optimistic local update + upsert to Supabase.
  const applyChange = useCallback(async (partial) => {
    const next = { ...stripRef.current, ...partial };
    stripRef.current = next;
    setStrip(next);
    if (!supabase) return;
    const { error } = await supabase.from('strip_state').upsert({
      id: 1,
      power: next.power,
      brightness: next.brightness,
      r: next.r, g: next.g, b: next.b,
      scene: next.scene ?? null,
      updated_at: new Date().toISOString(),
    });
    if (tableMissing(error)) setMissing(true);
  }, []);

  // Convenience writers used by the pages.
  const setPower = useCallback((on) => applyChange({ power: on }), [applyChange]);
  const togglePower = useCallback(() => applyChange({ power: !stripRef.current.power }), [applyChange]);
  const setBrightness = useCallback((pct) => applyChange({ brightness: pct }), [applyChange]);
  // Manually choosing a color clears the active-scene marker.
  const setColor = useCallback(({ r, g, b }) => applyChange({ r, g, b, scene: null, power: true }), [applyChange]);
  const applyScene = useCallback(
    (scene) => applyChange({
      power: true, brightness: scene.brightness,
      r: scene.rgb[0], g: scene.rgb[1], b: scene.rgb[2], scene: scene.key,
    }),
    [applyChange]
  );

  return {
    strip, loading, missing, lastRefresh, reload: load,
    setPower, togglePower, setBrightness, setColor, applyScene,
  };
}
