import { ListChecks, ExternalLink } from 'lucide-react';
import { moduleById } from '../../pages/homeModules';

// Right rail — Daily Planner. For now a prominent entry button; the plan is to
// bring current/upcoming tasks into this rail (collapsible) once the planner
// exposes them. Kept as its own rail so that swap is a drop-in later.
export default function PlannerRail() {
  const m = moduleById('planner');
  return (
    <section className="animate-enter rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
      <div className="mb-3 flex items-center gap-2">
        <ListChecks size={16} className="text-blue-400" strokeWidth={1.75} />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Daily Planner</h2>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-zinc-500">
        Your current and upcoming tasks will live here soon. For now, open the planner directly.
      </p>
      <a
        href={m.href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2.5 text-sm font-medium text-zinc-100 transition-colors hover:border-blue-500/60 hover:bg-blue-500/5"
      >
        Open Daily Planner <ExternalLink size={14} />
      </a>
    </section>
  );
}
