import { Link } from 'react-router-dom';
import { ExternalLink, Lock } from 'lucide-react';

export default function ToolCard({ icon: Icon, title, description, to, href, accentColor, locked, wip }) {
  const inner = (
    <>
      <div className="flex items-start justify-between">
        <div className={`rounded-lg bg-zinc-800 p-2.5 ${accentColor}`}>
          <Icon size={20} strokeWidth={1.75} />
        </div>
        {wip ? (
          <span className="text-[10px] font-medium tracking-wide px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-500 bg-zinc-800">
            WIP
          </span>
        ) : href ? (
          <ExternalLink size={14} className="text-zinc-600 transition-colors group-hover:text-zinc-400" />
        ) : locked ? (
          <Lock size={12} className="text-zinc-600" strokeWidth={1.75} />
        ) : null}
      </div>
      <div>
        <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">{description}</p>
      </div>
    </>
  );

  const baseClasses = 'flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5 transition-all duration-200';
  const hoverClasses = 'group hover:-translate-y-0.5 hover:border-zinc-600 hover:bg-zinc-800/60 hover:shadow-lg hover:shadow-black/30';
  const wipOpacity = wip ? 'opacity-80' : '';

  if (!to && !href) {
    return (
      <div className={`${baseClasses} ${wipOpacity} cursor-default`}>
        {inner}
      </div>
    );
  }

  const classes = `${baseClasses} ${hoverClasses} ${wipOpacity}`;

  if (to) {
    return <Link to={to} className={classes}>{inner}</Link>;
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
      {inner}
    </a>
  );
}
