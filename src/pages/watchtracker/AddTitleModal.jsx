import { useState } from 'react';
import { X, Search, Plus, Link2 } from 'lucide-react';
import { searchShow, searchMovie, addShow, addMovie, matchShow, matchMovie } from '../../lib/watchtracker';
import { tmdbImageUrl, tmdbConfigured } from '../../lib/tmdb';

// Search TMDB by name and either add the picked result as a new
// wt_shows/wt_movies row (mode="add", for titles watched/started after the
// TVTime export was taken), or re-point an existing row's tmdb_id at it
// (mode="match", existingId set — fixes a bad/missing auto-match without
// losing the show's watch history, notes, etc.).
export default function AddTitleModal({ mediaType, mode = 'add', existingId, onClose, onAdded }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState(null);

  const isShow = mediaType === 'tv';
  const isMatch = mode === 'match';

  const runSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    const { data } = isShow ? await searchShow(query) : await searchMovie(query);
    setResults(data ?? []);
    setSearching(false);
  };

  const pick = async (result) => {
    setAddingId(result.id);
    const name = isShow ? result.name : result.title;
    const { error } = isMatch
      ? (isShow ? await matchShow(existingId, result.id, 'manual') : await matchMovie(existingId, result.id, 'manual'))
      : (isShow ? await addShow(result.id, name) : await addMovie(result.id, name, result.release_date || null));
    setAddingId(null);
    if (!error) onAdded?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-20" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 p-4">
          <h3 className="text-sm font-semibold text-zinc-100">
            {isMatch ? `Match to the correct ${isShow ? 'show' : 'movie'}` : `Add a ${isShow ? 'show' : 'movie'}`}
          </h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X size={16} />
          </button>
        </div>

        <div className="p-4">
          {!tmdbConfigured ? (
            <p className="text-xs text-zinc-500">Set VITE_TMDB_API_KEY to search and add titles.</p>
          ) : (
            <>
              <form onSubmit={runSearch} className="flex gap-2">
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${isShow ? 'shows' : 'movies'}…`}
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-500"
                />
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded-lg bg-zinc-700 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-600"
                >
                  <Search size={14} /> Search
                </button>
              </form>

              <div className="mt-3 max-h-96 space-y-1.5 overflow-y-auto">
                {searching && <p className="py-6 text-center text-xs text-zinc-600">Searching…</p>}
                {!searching && results.length === 0 && query && (
                  <p className="py-6 text-center text-xs text-zinc-600">No results.</p>
                )}
                {results.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => pick(r)}
                    disabled={addingId === r.id}
                    className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-zinc-800 disabled:opacity-50"
                  >
                    <div className="h-16 w-11 shrink-0 rounded bg-zinc-800 overflow-hidden">
                      {r.poster_path && (
                        <img src={tmdbImageUrl(r.poster_path, 'w92')} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-zinc-200">{isShow ? r.name : r.title}</div>
                      <div className="text-xs text-zinc-500">
                        {(isShow ? r.first_air_date : r.release_date)?.slice(0, 4) || '—'}
                      </div>
                    </div>
                    {isMatch ? <Link2 size={14} className="shrink-0 text-zinc-500" /> : <Plus size={14} className="shrink-0 text-zinc-500" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
