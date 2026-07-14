// tmdb.js — thin client for The Movie Database API. Same "no-op if
// unconfigured" shape as supabase.js/fin.js. Requires a free API key from
// themoviedb.org (Settings → API), set as VITE_TMDB_API_KEY.
import { enqueue } from './fetchQueue';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

// Every request goes through the shared queue so pages that render many
// cards/rows at once (Shows, Movies) can't burst past TMDB's rate limit.
async function get(path) {
  if (!API_KEY) return { data: null, error: { message: 'TMDB not configured' } };
  return enqueue(async () => {
    const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}api_key=${API_KEY}`;
    try {
      const res = await fetch(url);
      if (!res.ok) return { data: null, error: { message: `TMDB ${res.status}` } };
      return { data: await res.json(), error: null };
    } catch (err) {
      return { data: null, error: { message: err.message } };
    }
  });
}

export const tmdbConfigured = !!API_KEY;

export function tmdbImageUrl(path, size = 'w342') {
  if (!path) return null;
  return `${IMG_BASE}/${size}${path}`;
}

export async function searchShow(name) {
  const { data, error } = await get(`/search/tv?query=${encodeURIComponent(name)}`);
  return { data: data?.results ?? [], error };
}

export async function searchMovie(name) {
  const { data, error } = await get(`/search/movie?query=${encodeURIComponent(name)}`);
  return { data: data?.results ?? [], error };
}

export async function getShowDetails(tmdbId) {
  return get(`/tv/${tmdbId}`);
}

export async function getMovieDetails(tmdbId) {
  return get(`/movie/${tmdbId}`);
}

export async function getEpisodeDetails(tmdbId, season, episode) {
  return get(`/tv/${tmdbId}/season/${season}/episode/${episode}`);
}

// Real streaming/rental/purchase availability, region-scoped. Returns just
// the US block (flatrate/rent/buy provider lists) since that's the only
// region this dashboard needs.
export async function getWatchProviders(mediaType, tmdbId) {
  const { data, error } = await get(`/${mediaType}/${tmdbId}/watch/providers`);
  return { data: data?.results?.US ?? null, error };
}

// TVTime-style "4.6/5 · 94 ratings" from TMDB's 0–10 vote_average.
export function tmdbRating(meta) {
  const avg = meta?.raw_json?.vote_average;
  const count = meta?.raw_json?.vote_count;
  if (!avg || !count) return null;
  return { stars: (avg / 2).toFixed(1), count };
}

// TMDB's /tv/{id} status field: "Returning Series" | "Ended" | "Canceled" | …
export function tmdbStatus(meta) {
  return meta?.raw_json?.status ?? null;
}
