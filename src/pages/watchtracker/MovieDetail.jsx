import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clapperboard, Check, Bookmark, Repeat, Link2, Trash2 } from 'lucide-react';
import { getMovie, getMovieMetadata, updateMovie } from '../../lib/watchtracker';
import { tmdbImageUrl, tmdbConfigured } from '../../lib/tmdb';
import { fmtDate } from '../cashflow/format';
import EditCell from '../cashflow/EditCell';
import ConfirmDialog from '../cashflow/ConfirmDialog';
import RatingAndProviders from './RatingAndProviders';
import CastList from './CastList';
import AddTitleModal from './AddTitleModal';

// Import data (a "watch" event from the TVTime export) isn't always right —
// this page's Watched/Want to Watch buttons are a manual override so a
// mis-imported flag can just be corrected here instead of re-running the
// importer.
export default function MovieDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [movie, setMovie] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showMatch, setShowMatch] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const reload = async () => {
    const { data } = await getMovie(id);
    setMovie(data);
    return data;
  };

  const onMatched = async () => {
    setShowMatch(false);
    const { data: movieData } = await getMovie(id);
    setMovie(movieData);
    setMeta(null);
    if (movieData?.tmdb_id && tmdbConfigured) {
      getMovieMetadata(movieData.tmdb_id).then(({ data }) => setMeta(data));
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: movieData } = await getMovie(id);
      if (!active) return;
      setMovie(movieData);
      if (movieData?.tmdb_id && tmdbConfigured) {
        getMovieMetadata(movieData.tmdb_id).then(({ data }) => { if (active) setMeta(data); });
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [id]);

  if (loading) return <div className="py-12 text-center text-zinc-600">Loading…</div>;
  if (!movie) return <div className="py-12 text-center text-zinc-600">Movie not found.</div>;

  const toggleWatched = () => updateMovie(movie.id, { is_followed: !movie.is_followed }).then(reload);
  const toggleWantToWatch = () => updateMovie(movie.id, { is_for_later: !movie.is_for_later }).then(reload);
  const removeMovie = async () => {
    await updateMovie(movie.id, { is_followed: false, is_for_later: false });
    navigate('/watch-tracker/movies');
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Link to="/watch-tracker/movies" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300">
          <ArrowLeft size={14} /> Back to Movies
        </Link>
        <button
          onClick={() => setShowRemoveConfirm(true)}
          className="flex items-center gap-1.5 rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-300"
          title="Remove movie"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="h-56 w-40 shrink-0 rounded-lg bg-zinc-800 overflow-hidden flex items-center justify-center self-start">
          {meta?.poster_path
            ? <img src={tmdbImageUrl(meta.poster_path, 'w342')} alt="" className="h-full w-full object-cover" />
            : <Clapperboard className="text-zinc-700" size={32} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-zinc-100">{movie.movie_name}</h1>
            <button
              onClick={() => setShowMatch(true)}
              className="flex items-center gap-1 rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] font-medium text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
              title="Re-point this movie at a different TMDB match — keeps your notes and watched status"
            >
              <Link2 size={10} /> {movie.tmdb_id ? 'Re-match' : 'Match to TMDB'}
            </button>
          </div>
          {movie.release_date && <div className="mt-0.5 text-xs text-zinc-500">{fmtDate(movie.release_date)}</div>}
          {meta?.overview && <p className="mt-2 text-sm text-zinc-400">{meta.overview}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={toggleWatched}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                movie.is_followed ? 'bg-red-500/20 text-red-300' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Check size={11} /> Watched
            </button>
            <button
              onClick={toggleWantToWatch}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                movie.is_for_later ? 'bg-amber-500/20 text-amber-300' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Bookmark size={11} /> Want to Watch
            </button>
            {movie.rewatch_count > 0 && (
              <span className="flex items-center gap-1 text-xs text-purple-300">
                <Repeat size={11} /> {movie.rewatch_count} rewatch{movie.rewatch_count === 1 ? '' : 'es'}
              </span>
            )}
          </div>

          <div className="mt-3">
            {movie.tmdb_id
              ? <RatingAndProviders tmdbId={movie.tmdb_id} mediaType="movie" meta={meta} />
              : <span className="text-xs text-zinc-600">Not matched to TMDB</span>}
          </div>

          <div className="mt-3 max-w-md">
            <EditCell
              value={movie.notes}
              onSave={(v) => updateMovie(movie.id, { notes: v }).then(reload)}
              placeholder="Add a note…"
              className="text-xs text-zinc-400"
            />
          </div>
        </div>
      </div>

      <CastList meta={meta} />

      {showMatch && (
        <AddTitleModal mediaType="movie" mode="match" existingId={movie.id} initialQuery={movie.movie_name} onClose={() => setShowMatch(false)} onAdded={onMatched} />
      )}

      <ConfirmDialog
        open={showRemoveConfirm}
        title="Remove this movie?"
        message="Unfollows the movie and takes it off your Movies list. Your notes and watched status are kept — re-adding it later won't lose anything."
        confirmLabel="Remove"
        onConfirm={() => { setShowRemoveConfirm(false); removeMovie(); }}
        onCancel={() => setShowRemoveConfirm(false)}
      />
    </div>
  );
}
