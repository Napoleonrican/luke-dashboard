import { useState } from 'react';
import { ListChecks, ExternalLink, ChevronsRight, ChevronsLeft } from 'lucide-react';
import { moduleById } from '../../pages/homeModules';

const STORAGE_KEY = 'planner_rail_collapsed';

// Right rail — Daily Planner. Collapsible so Mission Control can spread out in
// the center; defaults to collapsed (a slim edge tab) since there's no inline
// task content yet. Preference persists across visits.
export default function PlannerRail({ onToggle }) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v === null ? true : v === 'true'; // default: collapsed
    } catch {
      return true;
    }
  });
  const m = moduleById('planner');

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* ignore */ }
    onToggle?.(next);
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggle}
        title="Expand Daily Planner"
        className="animate-enter flex h-full min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/80 py-3 text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200 lg:min-h-[200px] lg:flex-col lg:gap-3 lg:py-4"
      >
        <ChevronsLeft size={16} className="hidden lg:block" />
        <ListChecks size={16} className="text-blue-400" strokeWidth={1.75} />
        <span className="text-xs font-medium tracking-wide">Planner</span>
      </button>
    );
  }

  return (
    <section className="animate-enter rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
      <div className="mb-3 flex items-center gap-2">
        <ListChecks size={16} className="text-blue-400" strokeWidth={1.75} />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Daily Planner</h2>
        <button
          type="button"
          onClick={toggle}
          title="Collapse"
          className="ml-auto rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
        >
          <ChevronsRight size={15} />
        </button>
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
