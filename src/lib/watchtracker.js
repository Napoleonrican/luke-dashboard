// watchtracker.js — thin query helpers for the wt_* tables, mirroring fin.js.
// All functions return { data, error } matching Supabase conventions.
import { supabase } from './supabase';
import { getShowDetails, getMovieDetails, getEpisodeDetails, searchShow, searchMovie } from './tmdb';

const s = supabase; // alias so callers can check if null

// ── Fetch ─────────────────────────────────────────────────────────────────────

export async function fetchShows() {
  if (!s) return { data: [], error: null };
  return s.from('wt_shows').select('*').order('series_name');
}

export async function fetchEpisodes(showId) {
  if (!s) return { data: [], error: null };
  let q = s.from('wt_episodes').select('*').order('season_number').order('episode_number');
  if (showId) q = q.eq('show_id', showId);
  return q;
}

export async function fetchMovies() {
  if (!s) return { data: [], error: null };
  return s.from('wt_movies').select('*').order('movie_name');
}

export async function fetchShowScores() {
  if (!s) return { data: [], error: null };
  return s.from('wt_show_scores').select('*');
}

export async function fetchUserStats() {
  if (!s) return { data: null, error: null };
  return s.from('wt_user_stats').select('*').maybeSingle();
}

// ── Upsert / update ───────────────────────────────────────────────────────────

export async function updateShow(id, fields) {
  if (!s) return { error: { message: 'Not configured' } };
  return s.from('wt_shows').update(fields).eq('id', id).select();
}

export async function updateMovie(id, fields) {
  if (!s) return { error: { message: 'Not configured' } };
  return s.from('wt_movies').update(fields).eq('id', id).select();
}

// Toggle an episode's watched state. Marking watched upserts a wt_episodes
// row (watch_count 1, first/last watched now); un-marking deletes it — the
// table only ever holds episodes actually watched at least once.
export async function setEpisodeWatched(ownerFields, watched) {
  if (!s) return { error: { message: 'Not configured' } };
  const { show_id, season_number, episode_number } = ownerFields;
  if (!watched) {
    return s.from('wt_episodes').delete()
      .eq('show_id', show_id).eq('season_number', season_number).eq('episode_number', episode_number);
  }
  const now = new Date().toISOString();
  return s.from('wt_episodes').upsert(
    { show_id, season_number, episode_number, watch_count: 1, first_watched_at: now, last_watched_at: now },
    { onConflict: 'owner,show_id,season_number,episode_number' },
  ).select();
}

export async function bumpRewatch(episodeId, nextCount) {
  if (!s) return { error: { message: 'Not configured' } };
  return s.from('wt_episodes').update({ watch_count: nextCount, last_watched_at: new Date().toISOString() }).eq('id', episodeId).select();
}

// ── Prefs (cross-device, owner-scoped — mirrors fin.js's getPref/setPref) ────

export async function getPref(key) {
  if (!s) return { data: null, error: null };
  const { data, error } = await s.from('wt_prefs').select('value').eq('key', key).maybeSingle();
  return { data: data?.value ?? null, error };
}

export async function setPref(key, value) {
  if (!s) return { error: { message: 'Not configured' } };
  return s.from('wt_prefs').upsert({ key, value }, { onConflict: 'owner,key' });
}

// ── TMDB metadata: read-through cache against wt_metadata_cache ──────────────
const STALE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function getShowMetadata(tmdbId) {
  if (!s || !tmdbId) return { data: null, error: null };
  const { data: cached } = await s.from('wt_metadata_cache').select('*')
    .eq('tmdb_id', tmdbId).eq('media_type', 'tv').maybeSingle();
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < STALE_MS) {
    return { data: cached, error: null };
  }
  const { data: details, error } = await getShowDetails(tmdbId);
  if (!details) return { data: cached ?? null, error };
  const row = {
    tmdb_id: tmdbId,
    media_type: 'tv',
    title: details.name,
    overview: details.overview,
    poster_path: details.poster_path,
    backdrop_path: details.backdrop_path,
    first_air_date: details.first_air_date || null,
    genres: details.genres?.map((g) => g.name) ?? [],
    number_of_seasons: details.number_of_seasons ?? null,
    number_of_episodes: details.number_of_episodes ?? null,
    network: details.networks?.[0]?.name ?? null,
    raw_json: details,
    fetched_at: new Date().toISOString(),
  };
  const { data: saved } = await s.from('wt_metadata_cache').upsert(row, { onConflict: 'tmdb_id,media_type' }).select().maybeSingle();
  return { data: saved ?? row, error: null };
}

export async function getMovieMetadata(tmdbId) {
  if (!s || !tmdbId) return { data: null, error: null };
  const { data: cached } = await s.from('wt_metadata_cache').select('*')
    .eq('tmdb_id', tmdbId).eq('media_type', 'movie').maybeSingle();
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < STALE_MS) {
    return { data: cached, error: null };
  }
  const { data: details, error } = await getMovieDetails(tmdbId);
  if (!details) return { data: cached ?? null, error };
  const row = {
    tmdb_id: tmdbId,
    media_type: 'movie',
    title: details.title,
    overview: details.overview,
    poster_path: details.poster_path,
    backdrop_path: details.backdrop_path,
    release_date: details.release_date || null,
    genres: details.genres?.map((g) => g.name) ?? [],
    raw_json: details,
    fetched_at: new Date().toISOString(),
  };
  const { data: saved } = await s.from('wt_metadata_cache').upsert(row, { onConflict: 'tmdb_id,media_type' }).select().maybeSingle();
  return { data: saved ?? row, error: null };
}

export async function getEpisodeMetadata(tmdbId, season, episode) {
  if (!s || !tmdbId) return { data: null, error: null };
  const { data: cached } = await s.from('wt_episode_metadata_cache').select('*')
    .eq('tmdb_id', tmdbId).eq('season_number', season).eq('episode_number', episode).maybeSingle();
  if (cached) return { data: cached, error: null }; // episode detail doesn't change once aired
  const { data: details, error } = await getEpisodeDetails(tmdbId, season, episode);
  if (!details) return { data: null, error };
  const row = {
    tmdb_id: tmdbId,
    season_number: season,
    episode_number: episode,
    name: details.name,
    overview: details.overview,
    air_date: details.air_date || null,
    still_path: details.still_path,
    fetched_at: new Date().toISOString(),
  };
  const { data: saved } = await s.from('wt_episode_metadata_cache').upsert(row, { onConflict: 'tmdb_id,season_number,episode_number' }).select().maybeSingle();
  return { data: saved ?? row, error: null };
}

// ── Matching: search TMDB and set a show/movie's match ───────────────────────

export async function matchShow(showId, tmdbId, status = 'confirmed') {
  return updateShow(showId, { tmdb_id: tmdbId, tmdb_match_status: status });
}

export async function matchMovie(movieId, tmdbId, status = 'confirmed') {
  return updateMovie(movieId, { tmdb_id: tmdbId, tmdb_match_status: status });
}

export { searchShow, searchMovie };
