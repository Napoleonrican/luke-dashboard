import { useState, useEffect } from 'react';
import { Check, Bookmark, Repeat, Clapperboard, Search, Plus } from 'lucide-react';
import { fetchMovies, updateMovie, getMovieMetadata } from '../../lib/watchtracker';
import { tmdbImageUrl } from '../../lib/tmdb';
import { Th, Td, StateRow, LoadErrorRow } from '../cashflow/tableparts';
import { fmtDate } from '../cashflow/format';
import EditCell from '../cashflow/EditCell';
import RatingAndProviders from './RatingAndProviders';
import AddTitleModal from './AddTitleModal';
import useInView from '../../hooks/useInView';

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

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-zinc-500">
            <tr>
              <Th></Th>
              <Th>Movie</Th>
              <Th>Status</Th>
              <Th>Release</Th>
              <Th>Rewatches</Th>
              <Th>Rating &amp; where to watch</Th>
              <Th>Notes</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {loading && <StateRow colSpan={7}>Loading movies…</StateRow>}
            {!loading && error && <LoadErrorRow colSpan={7} onRetry={reload} />}
            {!loading && !error && filtered.length === 0 && <StateRow colSpan={7}>No movies match.</StateRow>}
            {!loading && !error && filtered.map((m) => (
              <MovieRow key={m.id} movie={m} onReload={reload} />
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <AddTitleModal mediaType="movie" onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); reload(); }} />
      )}
    </div>
  );
}

function MovieRow({ movie: m, onReload }) {
  const [ref, inView] = useInView();
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    let active = true;
    if (inView && m.tmdb_id) getMovieMetadata(m.tmdb_id).then(({ data }) => { if (active) setMeta(data); });
    return () => { active = false; };
  }, [inView, m.tmdb_id]);

  return (
    <tr ref={ref} className="hover:bg-zinc-900/60">
      <Td className="w-14">
        <div className="h-16 w-11 shrink-0 rounded bg-zinc-800 overflow-hidden flex items-center justify-center">
          {meta?.poster_path
            ? <img src={tmdbImageUrl(meta.poster_path, 'w92')} alt="" className="h-full w-full object-cover" />
            : <Clapperboard className="text-zinc-700" size={16} />}
        </div>
      </Td>
      <Td className="font-medium text-zinc-200">
        <div>{m.movie_name}</div>
        {meta?.overview && <p className="mt-0.5 line-clamp-2 max-w-xs text-xs font-normal text-zinc-500">{meta.overview}</p>}
      </Td>
      <Td>
        <div className="flex gap-1.5">
          {m.is_followed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] font-medium text-red-300">
              <Check size={10} /> Watched
            </span>
          )}
          {m.is_for_later && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-300">
              <Bookmark size={10} /> Watchlist
            </span>
          )}
        </div>
      </Td>
      <Td>{fmtDate(m.release_date)}</Td>
      <Td>{m.rewatch_count > 0 ? (
        <span className="inline-flex items-center gap-1 text-purple-300"><Repeat size={11} /> {m.rewatch_count}</span>
      ) : '—'}</Td>
      <Td>
        {m.tmdb_id
          ? <RatingAndProviders tmdbId={m.tmdb_id} mediaType="movie" meta={meta} enabled={inView} />
          : <span className="text-zinc-600">Not matched to TMDB</span>}
      </Td>
      <Td>
        <EditCell
          value={m.notes}
          onSave={(v) => updateMovie(m.id, { notes: v }).then(onReload)}
          placeholder="Add a note…"
          className="text-zinc-400"
        />
      </Td>
    </tr>
  );
}
