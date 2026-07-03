import { Link } from 'react-router-dom';
import { Lightbulb, ArrowRight } from 'lucide-react';

// Compact Lighting glance for the left rail. Read-only status + one-tap entry
// into the Lighting module (power/brightness/scene writes go through the module's
// Bluetooth bridge, so we link in rather than write strip_state directly here).
export default function LightingRail({ lighting }) {
  const on = lighting?.power;
  const status = lighting
    ? on ? `On · ${lighting.label} · ${lighting.brightness}%` : 'Off'
    : 'Open lighting controls';

  return (
    <Link
      to="/lighting"
      className="group flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 transition-colors hover:border-zinc-600"
    >
      <div className="rounded-lg bg-zinc-800 p-2 text-fuchsia-400">
        <Lightbulb size={18} strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 group-hover:text-white">Lighting</h2>
          {on && <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" title="On" />}
        </div>
        <p className="mt-0.5 truncate text-sm text-zinc-300">{status}</p>
      </div>
      <ArrowRight size={14} className="text-zinc-600 transition-colors group-hover:text-fuchsia-400" />
    </Link>
  );
}
