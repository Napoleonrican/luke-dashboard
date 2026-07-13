import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, Bookmark, Check, Tv } from 'lucide-react';
import { getShowMetadata } from '../../lib/watchtracker';
import { tmdbImageUrl, tmdbConfigured } from '../../lib/tmdb';
import ProgressBar from './ProgressBar';
import useInView from '../../hooks/useInView';

// Grid tile: poster + badges + progress, lazily fetching its poster/episode
// count only once scrolled into view (so a 160-show grid doesn't burst-fetch
// TMDB all at once). Clicking navigates to the full detail page.
export default function ShowCard({ show }) {
  const [ref, inView] = useInView();
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    let active = true;
    if (inView && tmdbConfigured && show.tmdb_id) {
      getShowMetadata(show.tmdb_id).then(({ data }) => { if (active) setMeta(data); });
    }
    return () => { active = false; };
  }, [inView, show.tmdb_id]);

  const totalEpisodes = meta?.number_of_episodes ?? null;
  const watchedCount = show.ep_watch_count ?? 0;

  return (
    <Link
      ref={ref}
      to={`/watch-tracker/shows/${show.id}`}
      className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-left hover:bg-zinc-800/50 transition-colors"
    >
      <div className="h-24 w-16 shrink-0 rounded-md bg-zinc-800 overflow-hidden flex items-center justify-center">
        {meta?.poster_path
          ? <img src={tmdbImageUrl(meta.poster_path, 'w185')} alt="" className="h-full w-full object-cover" />
          : <Tv className="text-zinc-700" size={22} />}
      </div>
      <div className="min-w-0 flex-1">
        <span className="truncate font-medium text-zinc-100 block">{show.series_name}</span>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
          {show.is_followed && <Badge color="#ef4444" icon={Check} label="Following" />}
          {show.is_for_later && <Badge color="#f59e0b" icon={Bookmark} label="Watchlist" />}
          {show.is_favorited && <Badge color="#eab308" icon={Star} label="Favorite" />}
        </div>
        <div className="mt-1.5 text-xs text-zinc-500">
          {watchedCount}{totalEpisodes ? ` / ${totalEpisodes}` : ''} episodes
          {show.last_watched_season != null && (
            <span> · last watched S{show.last_watched_season}E{show.last_watched_episode_number}</span>
          )}
        </div>
        {totalEpisodes > 0 && <ProgressBar value={watchedCount} total={totalEpisodes} className="mt-1.5" />}
      </div>
    </Link>
  );
}

function Badge({ color, icon: Icon, label }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium"
      style={{ color, backgroundColor: `${color}22` }}
    >
      <Icon size={10} />
      {label}
    </span>
  );
}
