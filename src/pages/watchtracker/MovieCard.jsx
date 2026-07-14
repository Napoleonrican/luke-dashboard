import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Bookmark, Clapperboard } from 'lucide-react';
import { getMovieMetadata } from '../../lib/watchtracker';
import { tmdbImageUrl } from '../../lib/tmdb';
import useInView from '../../hooks/useInView';

// Poster-forward grid tile, mirrors ShowCard — lazily fetches its poster
// only once scrolled into view.
export default function MovieCard({ movie: m }) {
  const [ref, inView] = useInView();
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    let active = true;
    if (inView && m.tmdb_id) getMovieMetadata(m.tmdb_id).then(({ data }) => { if (active) setMeta(data); });
    return () => { active = false; };
  }, [inView, m.tmdb_id]);

  return (
    <Link ref={ref} to={`/watch-tracker/movies/${m.id}`} className="group block">
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-zinc-800 ring-1 ring-zinc-800 transition-transform group-hover:ring-zinc-600">
        {meta?.poster_path
          ? <img src={tmdbImageUrl(meta.poster_path, 'w342')} alt="" className="h-full w-full object-cover" />
          : <div className="flex h-full w-full items-center justify-center"><Clapperboard className="text-zinc-700" size={28} /></div>}
        <div className="absolute left-1.5 top-1.5 flex gap-1">
          {m.is_followed && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/80 text-white"><Check size={11} /></span>
          )}
          {m.is_for_later && !m.is_followed && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/80 text-white"><Bookmark size={11} /></span>
          )}
        </div>
      </div>
      <div className="mt-1.5 truncate text-xs font-medium text-zinc-300 group-hover:text-zinc-100">
        {m.movie_name}
      </div>
      {m.release_date && <div className="text-[11px] text-zinc-600">{m.release_date.slice(0, 4)}</div>}
    </Link>
  );
}
