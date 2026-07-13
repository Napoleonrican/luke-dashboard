import { useState, useEffect } from 'react';
import { Search, Plus } from 'lucide-react';
import { fetchMovies } from '../../lib/watchtracker';
import MovieCard from './MovieCard';
import AddTitleModal from './AddTitleModal';

const GRID = 'grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6';

export default function Movies() {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState('all'); // all | watched | wantToWatch
  const [showAdd, setShowAdd] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let active = true;
    fetchMovies().then(({ data, error: err }) => {
      if (!active) return;
      setMovies(data ?? []);
      setError(err);
      setLoading(false);
    });
    return () => { active = false; };
  }, [reloadKey]);

  const matchesQuery = (m) => m.movie_name.toLowerCase().includes(query.toLowerCase());
  const filtered = movies.filter(matchesQuery).filter((m) => {
    if (view === 'watched') return m.is_followed;
    if (view === 'wantToWatch') return m.is_for_later && !m.is_followed;
    return true;
  }).sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search movies…"
            className="rounded-lg border border-zinc-700 bg-zinc-900 py-1.5 pl-8 pr-3 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-500"
          />
        </div>
        <div className="flex gap-1">
          {[
            ['all', 'All'],
            ['watched', 'Watched'],
            ['wantToWatch', 'Want to Watch'],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                view === key ? 'bg-amber-500/20 text-amber-300' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-zinc-600">{filtered.length} movie{filtered.length === 1 ? '' : 's'}</span>
        <button
          onClick={() => setShowAdd(true)}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
        >
          <Plus size={13} /> Add movie
        </button>
      </div>

      {loading && <div className="py-12 text-center text-zinc-600">Loading movies…</div>}
      {!loading && error && <div className="py-12 text-center text-red-400/90">Couldn&rsquo;t load movies.</div>}
      {!loading && !error && filtered.length === 0 && <div className="py-12 text-center text-zinc-600">No movies match.</div>}
      {!loading && !error && filtered.length > 0 && (
        <div className={GRID}>
          {filtered.map((m) => <MovieCard key={m.id} movie={m} />)}
        </div>
      )}

      {showAdd && (
        <AddTitleModal mediaType="movie" onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); reload(); }} />
      )}
    </div>
  );
}
