import { useState, useEffect, useMemo } from 'react';
import { Search, Plus } from 'lucide-react';
import { fetchMovies, getMoviesMetaCached } from '../../lib/watchtracker';
import { buildProfile, scoreMovie, hasEnoughData } from '../../lib/recommend';
import useScrollRestoration from '../../hooks/useScrollRestoration';
import MovieCard from './MovieCard';
import AddTitleModal from './AddTitleModal';

const GRID = 'grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6';

export default function Movies() {
  const [movies, setMovies] = useState([]);
  const [metaByTmdbId, setMetaByTmdbId] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState('wantToWatch'); // wantToWatch | watched | all
  const [sortBy, setSortBy] = useState('match'); // match | release
  const [showAdd, setShowAdd] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  useScrollRestoration('/watch-tracker/movies', !loading);

  useEffect(() => {
    let active = true;
    fetchMovies().then(async ({ data, error: err }) => {
      if (!active) return;
      const list = data ?? [];
      setMovies(list);
      setError(err);
      const tmdbIds = [...new Set(list.map((m) => m.tmdb_id).filter(Boolean))];
      const { data: metaRows } = await getMoviesMetaCached(tmdbIds);
      if (active) setMetaByTmdbId(new Map((metaRows ?? []).map((m) => [m.tmdb_id, m])));
      setLoading(false);
    });
    return () => { active = false; };
  }, [reloadKey]);

  const handleMeta = (tmdbId, meta) => {
    setMetaByTmdbId((prev) => (prev.get(tmdbId) === meta ? prev : new Map(prev).set(tmdbId, meta)));
  };

  // Taste profile built from watched movies (rating > rewatch count > plain
  // watch, as a weight), re-derived whenever more metadata comes in from
  // cards scrolling into view.
  const profile = useMemo(
    () => buildProfile(movies.filter((m) => m.is_followed), metaByTmdbId),
    [movies, metaByTmdbId],
  );
  const scoreByMovieId = useMemo(() => {
    const map = new Map();
    for (const m of movies) {
      if (m.is_followed || !m.tmdb_id) continue;
      const score = scoreMovie(metaByTmdbId.get(m.tmdb_id), profile);
      if (score != null) map.set(m.id, score);
    }
    return map;
  }, [movies, metaByTmdbId, profile]);

  const matchesQuery = (m) => m.movie_name.toLowerCase().includes(query.toLowerCase());
  const filtered = movies.filter(matchesQuery).filter((m) => {
    if (view === 'watched') return m.is_followed;
    if (view === 'wantToWatch') return m.is_for_later && !m.is_followed;
    return true;
  }).sort((a, b) => {
    if (sortBy === 'match') {
      const diff = (scoreByMovieId.get(b.id) ?? -1) - (scoreByMovieId.get(a.id) ?? -1);
      if (diff !== 0) return diff;
    }
    return (b.release_date || '').localeCompare(a.release_date || '');
  });

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
            ['wantToWatch', 'Want to Watch'],
            ['watched', 'Watched'],
            ['all', 'All'],
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
        {view === 'wantToWatch' && hasEnoughData(profile) && (
          <div className="flex gap-1">
            {[
              ['match', 'Best Match'],
              ['release', 'Newest'],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  sortBy === key ? 'bg-emerald-500/20 text-emerald-300' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
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
          {filtered.map((m) => (
            <MovieCard key={m.id} movie={m} onMeta={handleMeta} score={scoreByMovieId.get(m.id)} />
          ))}
        </div>
      )}

      {showAdd && (
        <AddTitleModal mediaType="movie" onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); reload(); }} />
      )}
    </div>
  );
}
