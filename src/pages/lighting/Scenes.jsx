import { useOutletContext } from 'react-router-dom';
import { Moon, Lightbulb, Film, BookOpen, Sparkles, Sunrise, Sunset, AlertTriangle, Check } from 'lucide-react';
import { SCENES, ROUTINES } from './presets';
import { rgbToHex } from './useLightingData';

// Map the scene definitions' icon names to lucide components.
const ICONS = { Moon, Lightbulb, Film, BookOpen, Sparkles, Sunrise, Sunset };

function SceneCard({ scene, active, onApply }) {
  const Icon = ICONS[scene.icon] ?? Lightbulb;
  const hex = rgbToHex(...scene.rgb);
  return (
    <button
      onClick={() => onApply(scene)}
      className={`group relative flex flex-col gap-3 rounded-xl border bg-zinc-900 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-zinc-600 ${
        active ? 'border-fuchsia-500/60 ring-1 ring-fuchsia-500/30' : 'border-zinc-800'
      }`}
    >
      {active && (
        <span className="absolute top-3 right-3 flex items-center gap-1 text-[10px] uppercase tracking-wide text-fuchsia-300">
          <Check size={12} /> Active
        </span>
      )}
      <span
        className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${hex}22`, boxShadow: `inset 0 0 0 1px ${hex}55` }}
      >
        <Icon size={20} style={{ color: hex }} />
      </span>
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-zinc-100">{scene.label}</span>
          {scene.fade && (
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-400">
              {scene.fadeMinutes}m fade
            </span>
          )}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">{scene.desc}</p>
      </div>
    </button>
  );
}

export default function Scenes() {
  const { strip, loading, missing, applyScene } = useOutletContext();

  if (loading) {
    return <div className="text-sm text-zinc-500 py-16 text-center">Loading scenes…</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      {missing && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-2">
          <AlertTriangle size={15} className="text-amber-400 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-300 leading-snug">
            <span className="font-semibold">strip_state table not found.</span> Run migration{' '}
            <code className="px-1 rounded bg-amber-950/50 text-amber-200 text-xs">015_strip_state.sql</code>{' '}
            in Supabase, then reload.
          </div>
        </div>
      )}

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-3">Scenes</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {SCENES.map((s) => (
            <SceneCard key={s.key} scene={s} active={strip.power && strip.scene === s.key} onApply={applyScene} />
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-1">Routines</h2>
        <p className="text-xs text-zinc-600 mb-3">
          Tapping a routine sets its end-state now. The gradual fade runs on the Pi agent once routines
          are added to a schedule (coming next).
        </p>
        <div className="grid grid-cols-2 gap-3">
          {ROUTINES.map((s) => (
            <SceneCard key={s.key} scene={s} active={strip.power && strip.scene === s.key} onApply={applyScene} />
          ))}
        </div>
      </div>
    </div>
  );
}
