import { useState, useEffect } from 'react';
import { Flame } from 'lucide-react';
import { fetchUserStats, fetchShows, fetchShowScores, fetchMovies } from '../../lib/watchtracker';

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="text-2xl font-semibold text-zinc-100 tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{label}</div>
    </div>
  );
}

export default function Stats() {
  const [stats, setStats] = useState(null);
  const [shows, setShows] = useState([]);
  const [scores, setScores] = useState([]);
  const [movies, setMovies] = useState([]);

  useEffect(() => {
    Promise.all([fetchUserStats(), fetchShows(), fetchShowScores(), fetchMovies()]).then(
      ([{ data: s }, { data: sh }, { data: sc }, { data: m }]) => {
        setStats(s);
        setShows(sh ?? []);
        setScores(sc ?? []);
        setMovies(m ?? []);
      },
    );
  }, []);

  const liveEpisodesWatched = shows.reduce((sum, s) => sum + (s.ep_watch_count || 0), 0);
  const liveShowsFollowed = shows.filter((s) => s.is_followed).length;
  const moviesWatched = movies.filter((m) => m.is_followed).length;

  const topByScore = [...scores]
    .filter((s) => s.monthly_score != null)
    .sort((a, b) => (b.monthly_score ?? 0) - (a.monthly_score ?? 0))
    .slice(0, 10);
  const showById = new Map(shows.map((s) => [s.id, s]));

  return (
    <div className="space-y-6">
      {stats && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-600">
            As reported by TVTime (export snapshot)
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Shows followed" value={stats.nb_shows_followed ?? '—'} />
            <StatCard label="Episodes watched" value={stats.nb_episodes_watched ?? '—'} />
            <StatCard label="Time spent (hrs)" value={stats.time_spent_seconds ? Math.round(stats.time_spent_seconds / 3600) : '—'} />
            <StatCard label="Score" value={stats.score ?? '—'} />
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-600">
          Live (recomputed from your Watch Tracker data)
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Shows followed" value={liveShowsFollowed} />
          <StatCard label="Episodes watched" value={liveEpisodesWatched} />
          <StatCard label="Movies watched" value={moviesWatched} />
          <StatCard label="Shows tracked" value={shows.length} />
        </div>
      </div>

      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-zinc-600">
          <Flame size={13} className="text-orange-400" /> Most addictive shows (monthly score)
        </h3>
        <div className="rounded-xl border border-zinc-800 divide-y divide-zinc-800">
          {topByScore.length === 0 && <div className="p-4 text-sm text-zinc-600">No scores imported.</div>}
          {topByScore.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-4 py-2 text-sm">
              <span className="text-zinc-200">{showById.get(s.show_id)?.series_name ?? 'Unknown show'}</span>
              <span className="font-medium tabular-nums text-orange-300">{s.monthly_score}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
