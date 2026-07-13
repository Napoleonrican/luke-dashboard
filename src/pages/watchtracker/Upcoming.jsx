import { useState, useEffect } from 'react';
import { Tv, Clapperboard } from 'lucide-react';
import { fetchUpcoming } from '../../lib/watchtracker';
import { tmdbConfigured } from '../../lib/tmdb';

// TVTime's Upcoming tab: a countdown feed of next-airing episodes (from
// TMDB's next_episode_to_air, already cached) and unreleased movies (from
// the imported release_date) — no extra TMDB calls beyond what's cached.
export default function Upcoming() {
  const [items, setItems] = useState(null);

  useEffect(() => {
    fetchUpcoming().then(({ data }) => setItems(data ?? []));
  }, []);

  if (items === null) return <div className="py-12 text-center text-zinc-600">Loading upcoming…</div>;
  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-zinc-600">
        Nothing upcoming.
        {!tmdbConfigured && <div className="mt-1 text-xs">Set VITE_TMDB_API_KEY and match shows to TMDB to populate this tab.</div>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
          {item.kind === 'episode'
            ? <Tv size={16} className="shrink-0 text-red-400" />
            : <Clapperboard size={16} className="shrink-0 text-amber-400" />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-zinc-200">{item.title}</span>
              {item.premiere && (
                <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">
                  Premiere
                </span>
              )}
            </div>
            <div className="text-xs text-zinc-500">{item.subtitle}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-lg font-semibold tabular-nums text-zinc-100">{item.daysUntil}</div>
            <div className="text-[10px] uppercase tracking-wide text-zinc-600">{item.daysUntil === 1 ? 'day' : 'days'}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
