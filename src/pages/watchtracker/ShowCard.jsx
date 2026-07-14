import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, Tv } from 'lucide-react';
import { getShowMetadata } from '../../lib/watchtracker';
import { tmdbImageUrl, tmdbConfigured } from '../../lib/tmdb';
import ProgressBar from './ProgressBar';
import useInView from '../../hooks/useInView';

// Poster-forward grid tile (TVTime-style): image is the click target, title
// underneath, progress bar overlaid on the poster. Lazily fetches its
// poster/episode count only once scrolled into view. onMeta (optional)
// reports the fetched metadata back up to the Shows page, which uses it
// for section placement — a show whose metadata wasn't cached yet when the
// page loaded self-corrects into the right section as its tile scrolls
// into view, instead of staying misclassified for the rest of the session.
export default function ShowCard({ show, onMeta }) {
  const [ref, inView] = useInView();
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    let active = true;
    if (inView && tmdbConfigured && show.tmdb_id) {
      getShowMetadata(show.tmdb_id).then(({ data }) => {
        if (!active) return;
        setMeta(data);
        if (data) onMeta?.(show.tmdb_id, data);
      });
    }
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, show.tmdb_id]);

  const totalEpisodes = meta?.number_of_episodes ?? null;
  const watchedCount = show.ep_watch_count ?? 0;

  return (
    <Link ref={ref} to={`/watch-tracker/shows/${show.id}`} className="group block">
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-zinc-800 ring-1 ring-zinc-800 transition-transform group-hover:ring-zinc-600">
        {meta?.poster_path
          ? <img src={tmdbImageUrl(meta.poster_path, 'w342')} alt="" className="h-full w-full object-cover" />
          : <div className="flex h-full w-full items-center justify-center"><Tv className="text-zinc-700" size={28} /></div>}
        {show.is_favorited && (
          <Star size={14} className="absolute right-1.5 top-1.5 fill-amber-400 text-amber-400 drop-shadow" />
        )}
        {totalEpisodes > 0 && (
          <div className="absolute inset-x-0 bottom-0 bg-black/40 p-1">
            <ProgressBar value={watchedCount} total={totalEpisodes} />
          </div>
        )}
      </div>
      <div className="mt-1.5 truncate text-xs font-medium text-zinc-300 group-hover:text-zinc-100">
        {show.series_name}
      </div>
    </Link>
  );
}
