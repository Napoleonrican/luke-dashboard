import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Thermometer, Cloud, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Sparkline from './Sparkline';

// Proof-of-concept "hero widget": the pattern that turns the landing page from a
// grid of shortcuts into a dashboard. Unlike ToolCard (which describes a tool and
// links out), this renders the Climate module's *live content* inline and exposes
// one inline control — flipping the AC executor between Dashboard and Manual
// control — so the most common action doesn't require navigating into the module.
//
// Degrades gracefully: if there's no live climate slice yet, it renders nothing
// and Home falls back to the normal Climate ToolCard in the grid below.
export default function ClimateHero({ climate, outdoor }) {
  // Optimistic local mirror of the executor toggle; seeded from server state.
  const [executor, setExecutor] = useState(climate?.executorEnabled ?? false);
  const [saving, setSaving] = useState(false);

  if (!climate?.indoorTemp) return null;

  const comfort = climate.comfortActive;
  // In Comfort Mode the AI owns the AC, so the manual toggle is disabled and we
  // just surface that state instead.
  const stateLabel = comfort
    ? 'Comfort Mode'
    : executor
      ? 'Dashboard control'
      : 'Manual control';

  async function toggleExecutor() {
    if (comfort || saving || !supabase) return;
    const next = !executor;
    setExecutor(next); // optimistic
    setSaving(true);
    try {
      const { error } = await supabase
        .from('ac_preferences')
        .update({ executor_enabled: next })
        .eq('id', 1);
      if (error) setExecutor(!next); // revert on failure
    } catch {
      setExecutor(!next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="animate-enter mb-6 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/80"
      style={{ animationDelay: '60ms' }}
    >
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: live reading, big and glanceable */}
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-zinc-800 p-3 text-cyan-400">
            <Thermometer size={26} strokeWidth={1.75} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Climate
              </h2>
              {climate.stale ? (
                <span className="h-2 w-2 rounded-full bg-amber-400" title="Readings are stale" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" title="Live" />
              )}
            </div>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="text-5xl font-bold tabular-nums text-white">
                {climate.indoorTemp}
              </span>
              {outdoor && (
                <span className="flex items-center gap-1 text-sm text-zinc-500">
                  <Cloud size={14} className="text-sky-400" /> {outdoor} outside
                </span>
              )}
            </div>
            {climate.spark && (
              <div className="mt-2">
                <Sparkline values={climate.spark} color="#22d3ee" width={160} height={32} />
                <p className="mt-1 text-[11px] text-zinc-600">last 24h · living room</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: state + inline control + link into the full module */}
        <div className="flex flex-col items-stretch gap-3 sm:min-w-[200px]">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">AC control</p>
            <p className="text-sm font-medium text-zinc-200">{stateLabel}</p>
          </div>

          <button
            type="button"
            onClick={toggleExecutor}
            disabled={comfort || saving}
            className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
              comfort
                ? 'cursor-not-allowed border-zinc-800 text-zinc-600'
                : 'border-zinc-700 text-zinc-200 hover:border-cyan-500/60 hover:bg-cyan-500/5'
            }`}
            title={comfort ? 'Comfort Mode is running the AC' : 'Toggle dashboard control of the AC'}
          >
            <span>Dashboard control</span>
            {/* Simple pill switch */}
            <span
              className={`relative inline-block h-5 w-9 rounded-full transition-colors ${
                executor && !comfort ? 'bg-cyan-500' : 'bg-zinc-700'
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                  executor && !comfort ? 'left-[18px]' : 'left-0.5'
                }`}
              />
            </span>
          </button>

          <Link
            to="/climate"
            className="flex items-center justify-center gap-1 text-xs font-medium text-zinc-400 transition-colors hover:text-cyan-400"
          >
            Open Climate <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </section>
  );
}
