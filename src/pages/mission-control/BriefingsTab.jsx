import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

const HEALTH = {
  green:     { Icon: CheckCircle2,  dot: 'bg-green-500',  color: 'text-green-400',  label: 'All good' },
  attention: { Icon: AlertTriangle, dot: 'bg-amber-500',  color: 'text-amber-400',  label: 'Needs a look' },
  blocked:   { Icon: XCircle,       dot: 'bg-red-500',    color: 'text-red-400',    label: 'Blocked' },
};

function reviewedAgo(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function BriefingsTab({ projects }) {
  if (!projects || projects.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-600 text-sm">
        No project briefings yet — your Sidekick will fill these in on its next run.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {projects.map(p => {
        const h = HEALTH[p.health] || HEALTH.green;
        const H = h.Icon;
        return (
          <div key={p.repo} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3.5">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${h.dot}`} />
              <span className="text-sm font-medium text-zinc-200 flex-1 min-w-0 truncate">{p.repo}</span>
              {p.open_actions > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-amber-900/40 text-amber-300 flex-shrink-0">
                  {p.open_actions} for you
                </span>
              )}
              <span className={`text-[10px] font-medium flex items-center gap-1 flex-shrink-0 ${h.color}`}>
                <H size={11} /> {h.label}
              </span>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">{p.headline}</p>

            {p.whats_changed && (
              <p className="text-[11px] text-zinc-500 leading-relaxed mt-1.5">
                <span className="text-zinc-600 font-medium">Since last check-in: </span>
                {p.whats_changed}
              </p>
            )}

            {p.last_reviewed && (
              <p className="text-[10px] text-zinc-700 mt-2">Reviewed {reviewedAgo(p.last_reviewed)}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
