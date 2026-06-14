import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Power, AlertTriangle, Thermometer, RefreshCw, Pencil } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { REFRESH_OPTIONS } from './useClimateData';

// Master kill-switch: when ON, the Pi executor applies this dashboard schedule to
// the AC. When OFF (default), the executor does nothing and the AC is under manual /
// SmartHQ control. Persisted to ac_preferences.executor_enabled.
function ControlToggle() {
  const [enabled, setEnabled] = useState(null); // null = loading
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('ac_preferences')
      .select('executor_enabled')
      .eq('id', 1)
      .limit(1);
    setEnabled(Boolean(data?.[0]?.executor_enabled));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggle() {
    if (enabled === null) return;
    const next = !enabled;
    setSaving(true);
    setEnabled(next); // optimistic
    await supabase
      .from('ac_preferences')
      .update({ executor_enabled: next, updated_at: new Date().toISOString() })
      .eq('id', 1);
    setSaving(false);
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Power size={16} className={enabled ? 'text-emerald-400' : 'text-zinc-500'} />
          <span className="text-sm font-semibold text-zinc-100">Dashboard controls the AC</span>
        </div>
        <button
          onClick={toggle}
          disabled={saving || enabled === null}
          role="switch"
          aria-checked={!!enabled}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
            enabled ? 'bg-emerald-500' : 'bg-zinc-700'
          }`}
          title={enabled ? 'On — click to disable' : 'Off — click to enable'}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              enabled ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {enabled === null ? (
        <p className="text-xs text-zinc-600 mt-2">Loading…</p>
      ) : enabled ? (
        <p className="text-xs text-amber-400/90 mt-2 leading-relaxed flex items-start gap-1.5">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          The executor applies the schedule to your AC at each entry&apos;s time. Make sure
          SmartHQ&apos;s own schedule is turned OFF so the two don&apos;t fight.
        </p>
      ) : (
        <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
          The AC is under your manual / SmartHQ control — the executor won&apos;t touch it. Turn this
          on once you&apos;re ready for the dashboard schedule to drive the unit.
        </p>
      )}
    </div>
  );
}

export default function Settings() {
  const {
    sensors, unit, setUnit, refreshInterval, setRefreshInterval, renameSensor,
  } = useOutletContext();

  return (
    <div className="flex flex-col gap-6">
      <ControlToggle />

      {/* Display preferences */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <span className="text-sm font-semibold text-zinc-100">Display</span>

        <div className="flex items-center justify-between gap-3 mt-3">
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            <Thermometer size={15} className="text-zinc-500" /> Temperature unit
          </div>
          <button
            onClick={() => setUnit(unit === 'F' ? 'C' : 'F')}
            className="text-xs px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 transition-colors min-h-[36px]"
          >
            °{unit}
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 mt-3">
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            <RefreshCw size={15} className="text-zinc-500" /> Auto-refresh this view
          </div>
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg px-2 py-2 text-xs cursor-pointer hover:bg-zinc-800 transition-colors min-h-[36px]"
          >
            {REFRESH_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <p className="text-[11px] text-zinc-600 mt-2 leading-relaxed">
          Auto-refresh only re-pulls already-stored readings into this view. It does not change how
          often the sensors are read — that&apos;s set by the collector script.
        </p>
      </div>

      {/* Sensors */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <span className="text-sm font-semibold text-zinc-100">Sensors</span>
        {sensors.length === 0 ? (
          <p className="text-xs text-zinc-500 mt-3">No sensors registered yet.</p>
        ) : (
          <div className="flex flex-col gap-2 mt-3">
            {sensors.map((s) => (
              <div key={s.mac} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-2.5">
                <div className="min-w-0">
                  <div className="text-sm text-zinc-100 truncate">{s.label || s.name}</div>
                  <div className="text-[11px] text-zinc-600 truncate">{s.mac}</div>
                </div>
                <button
                  onClick={() => renameSensor(s.mac, s.label || s.name || '')}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 transition-colors flex items-center gap-1.5 shrink-0"
                >
                  <Pencil size={13} /> Rename
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
