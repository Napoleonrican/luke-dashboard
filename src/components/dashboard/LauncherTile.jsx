import { Link } from 'react-router-dom';
import { ExternalLink, Lock } from 'lucide-react';

// Compact launcher for the "other" modules below the fold. Description is no
// longer always-on — it surfaces as a hover tooltip (native title) so the tiles
// stay small and scannable.
export default function LauncherTile({ module: m }) {
  const inner = (
    <>
      <div className={`rounded-lg bg-zinc-800 p-2 ${m.accent}`}>
        <m.icon size={18} strokeWidth={1.75} />
      </div>
      <span className="flex-1 truncate text-sm font-medium text-zinc-100">{m.title}</span>
      {m.wip ? (
        <span className="text-[9px] uppercase tracking-wide text-zinc-600">WIP</span>
      ) : m.href ? (
        <ExternalLink size={13} className="text-zinc-600 transition-colors group-hover:text-zinc-400" />
      ) : m.locked ? (
        <Lock size={12} className="text-zinc-600" />
      ) : null}
    </>
  );

  const cls =
    'group flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2.5 transition-colors hover:border-zinc-600 hover:bg-zinc-800/60';

  if (m.wip) return <div className={`${cls} cursor-default opacity-70`} title={m.description}>{inner}</div>;
  if (m.to) return <Link to={m.to} className={cls} title={m.description}>{inner}</Link>;
  return <a href={m.href} target="_blank" rel="noopener noreferrer" className={cls} title={m.description}>{inner}</a>;
}
