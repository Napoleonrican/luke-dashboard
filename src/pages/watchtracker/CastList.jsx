import { User } from 'lucide-react';
import { tmdbImageUrl, tmdbCast, tmdbPersonUrl } from '../../lib/tmdb';

// Horizontal cast strip — photo, name, character. Cast data comes free from
// the show/movie's own cached details (append_to_response=credits), so this
// never triggers an extra fetch. Clicking a person opens their TMDB profile
// (an exact IMDb link would need a per-actor lookup call).
export default function CastList({ meta }) {
  const cast = tmdbCast(meta);
  if (cast.length === 0) return null;

  return (
    <div className="mt-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-600">Cast</h3>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {cast.map((person) => (
          <a
            key={person.id}
            href={tmdbPersonUrl(person.id)}
            target="_blank"
            rel="noreferrer"
            className="w-20 shrink-0 text-center group"
          >
            <div className="mx-auto h-20 w-20 overflow-hidden rounded-full bg-zinc-800 ring-1 ring-zinc-800 transition-transform group-hover:ring-zinc-500">
              {person.profile_path
                ? <img src={tmdbImageUrl(person.profile_path, 'w185')} alt="" className="h-full w-full object-cover" />
                : <div className="flex h-full w-full items-center justify-center"><User className="text-zinc-700" size={22} /></div>}
            </div>
            <div className="mt-1 truncate text-[11px] font-medium text-zinc-300 group-hover:text-zinc-100">{person.name}</div>
            {person.character && <div className="truncate text-[10px] text-zinc-600">{person.character}</div>}
          </a>
        ))}
      </div>
    </div>
  );
}
