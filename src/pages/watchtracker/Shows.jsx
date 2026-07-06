import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { fetchShows } from '../../lib/watchtracker';
import ShowCard from './ShowCard';

export default function Shows() {
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('following'); // following | watchlist | archived | all
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let active = true;
    fetchShows().then(({ data, error: err }) => {
      if (!active) return;
      setShows(data ?? []);
      setError(err);
      setLoading(false);
    });
    return () => { active = false; };
  }, [reloadKey]);

  const filtered = shows
    .filter((s) => {
      if (filter === 'following') return s.is_followed && !s.is_archived;
      if (filter === 'watchlist') return s.is_for_later;
      if (filter === 'archived') return s.is_archived;
      return true;
    })
    .filter((s) => s.series_name.toLowerCase().includes(query.toLowerCase()));

  if (loading) return <div className="py-12 text-center text-zinc-600">Loading shows…</div>;
  if (error) return <div className="py-12 text-center text-red-400/90">Couldn&rsquo;t load shows.</div>;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shows…"
            className="rounded-lg border border-zinc-700 bg-zinc-900 py-1.5 pl-8 pr-3 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-500"
          />
        </div>
        <div className="flex gap-1">
          {[
            ['following', 'Following'],
            ['watchlist', 'Watchlist'],
            ['archived', 'Archived'],
            ['all', 'All'],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === key ? 'bg-red-500/20 text-red-300' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-zinc-600">{filtered.length} shows</span>
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center text-zinc-600">No shows match.</div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((show) => (
            <ShowCard key={show.id} show={show} onChange={reload} />
          ))}
        </div>
      )}
    </div>
  );
}
