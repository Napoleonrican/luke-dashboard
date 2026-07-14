import { useState } from 'react';
import { X, Search, Plus, Link2, ArrowLeft } from 'lucide-react';
import { searchShow, searchMovie, addShow, addMovie, matchShow, matchMovie } from '../../lib/watchtracker';
import { tmdbImageUrl, tmdbConfigured, getShowDetails, getMovieDetails } from '../../lib/tmdb';
import CastList from './CastList';

// Search TMDB by name, preview the picked result (poster, overview, cast),
// then either add it as a new wt_shows/wt_movies row (mode="add", for
// titles watched/started after the TVTime export was taken) or re-point an
// existing row's tmdb_id at it (mode="match", existingId set — fixes a bad/
// missing auto-match without losing the show's watch history, notes, etc.).
export default function AddTitleModal({ mediaType, mode = 'add', existingId, onClose, onAdded }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null); // search result being previewed
  const [previewMeta, setPreviewMeta] = useState(null); // { raw_json: details } once fetched
  const [confirming, setConfirming] = useState(false);

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

  const openPreview = async (result) => {
    setSelected(result);
    setPreviewMeta(null);
    const { data } = isShow ? await getShowDetails(result.id) : await getMovieDetails(result.id);
    if (data) setPreviewMeta({ raw_json: data });
  };

  const confirmPick = async () => {
    setConfirming(true);
    const name = isShow ? selected.name : selected.title;
    const { error } = isMatch
      ? (isShow ? await matchShow(existingId, selected.id, 'manual') : await matchMovie(existingId, selected.id, 'manual'))
      : (isShow ? await addShow(selected.id, name) : await addMovie(selected.id, name, selected.release_date || null));
    setConfirming(false);
    if (!error) onAdded?.();
  };

  const title = isShow ? selected?.name : selected?.title;
  const year = (isShow ? selected?.first_air_date : selected?.release_date)?.slice(0, 4);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-20" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 p-4">
          <h3 className="text-sm font-semibold text-zinc-100">
            {selected
              ? title
              : (isMatch ? `Match to the correct ${isShow ? 'show' : 'movie'}` : `Add a ${isShow ? 'show' : 'movie'}`)}
          </h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto p-4">
          {!tmdbConfigured ? (
            <p className="text-xs text-zinc-500">Set VITE_TMDB_API_KEY to search and add titles.</p>
          ) : selected ? (
            <div>
              <button
                onClick={() => setSelected(null)}
                className="mb-3 flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300"
              >
                <ArrowLeft size={13} /> Back to results
              </button>

              <div className="flex gap-3">
                <div className="h-40 w-28 shrink-0 rounded-lg bg-zinc-800 overflow-hidden">
                  {selected.poster_path && (
                    <img src={tmdbImageUrl(selected.poster_path, 'w185')} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-zinc-100">{title}</div>
                  <div className="text-xs text-zinc-500">{year || '—'}</div>
                  {selected.overview && <p className="mt-2 line-clamp-6 text-xs text-zinc-400">{selected.overview}</p>}
                </div>
              </div>

              <CastList meta={previewMeta} />

              <button
                onClick={confirmPick}
                disabled={confirming}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-red-500/20 px-3 py-2 text-sm font-medium text-red-300 hover:bg-red-500/30 disabled:opacity-50"
              >
                {isMatch ? <Link2 size={14} /> : <Plus size={14} />}
                {confirming ? 'Saving…' : (isMatch ? 'Use this match' : 'Add to Watch List')}
              </button>
            </div>
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
                    onClick={() => openPreview(r)}
                    className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-zinc-800"
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
