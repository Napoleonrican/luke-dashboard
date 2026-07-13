import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { getWatchProvidersCached } from '../../lib/watchtracker';
import { tmdbImageUrl, tmdbConfigured, tmdbRating } from '../../lib/tmdb';

// TMDB-derived rating + real streaming availability — shown in place of
// TVTime's user-entered star rating and manual "where did you watch" picker.
export default function RatingAndProviders({ tmdbId, mediaType, meta }) {
  const [providers, setProviders] = useState(undefined); // undefined = loading, null = none

  useEffect(() => {
    if (!tmdbConfigured || !tmdbId) return;
    let active = true;
    getWatchProvidersCached(tmdbId, mediaType).then(({ data }) => { if (active) setProviders(data); });
    return () => { active = false; };
  }, [tmdbId, mediaType]);

  if (!tmdbConfigured || !tmdbId) return null;

  const rating = tmdbRating(meta);
  const offers = [...(providers?.flatrate ?? []), ...(providers?.rent ?? []), ...(providers?.buy ?? [])];
  const seen = new Set();
  const uniqueOffers = offers.filter((o) => (seen.has(o.provider_id) ? false : seen.add(o.provider_id)));

  return (
    <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
      {rating && (
        <span className="inline-flex items-center gap-1 text-amber-300">
          <Star size={12} className="fill-amber-300" /> {rating.stars}/5 <span className="text-zinc-600">({rating.count})</span>
        </span>
      )}
      {providers === undefined ? (
        <span className="text-zinc-600">Checking where to watch…</span>
      ) : uniqueOffers.length > 0 ? (
        <span className="flex items-center gap-1.5">
          <span className="text-zinc-500">Watch on</span>
          {uniqueOffers.slice(0, 6).map((o) => (
            <img
              key={o.provider_id}
              src={tmdbImageUrl(o.logo_path, 'w45')}
              alt={o.provider_name}
              title={o.provider_name}
              className="h-5 w-5 rounded"
            />
          ))}
        </span>
      ) : (
        <span className="text-zinc-600">Where to watch: not available</span>
      )}
    </div>
  );
}
