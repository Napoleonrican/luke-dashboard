// watchtracker.js — thin query helpers for the wt_* tables, mirroring fin.js.
// All functions return { data, error } matching Supabase conventions.
import { supabase } from './supabase';
import { getShowDetails, getMovieDetails, getEpisodeDetails, getWatchProviders, searchShow, searchMovie } from './tmdb';
import { daysUntil } from '../pages/cashflow/format';

const s = supabase; // alias so callers can check if null

// ── Fetch ─────────────────────────────────────────────────────────────────────

export async function fetchShows() {
  if (!s) return { data: [], error: null };
  return s.from('wt_shows').select('*').order('series_name');
}

export async function getShow(id) {
  if (!s) return { data: null, error: null };
  return s.from('wt_shows').select('*').eq('id', id).maybeSingle();
}

export async function getMovie(id) {
  if (!s) return { data: null, error: null };
  return s.from('wt_movies').select('*').eq('id', id).maybeSingle();
}

// Bulk read of already-cached TMDB metadata (no live API calls) — used to
// classify shows (e.g. finished vs. still airing) without fetching anything.
export async function getShowsMetaCached(tmdbIds) {
  if (!s || !tmdbIds.length) return { data: [], error: null };
  return s.from('wt_metadata_cache').select('tmdb_id, number_of_episodes, raw_json')
    .eq('media_type', 'tv').in('tmdb_id', tmdbIds);
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

// wt_shows.ep_watch_count/last_watched_* are separate columns from the
// wt_episodes rows they summarize — the one-time CSV import populates both
// together, but marking an episode watched in-app only ever touched
// wt_episodes, leaving those summary columns stale (a freshly-added show
// would sit at ep_watch_count 0 forever, never leaving "Haven't started").
// Recompute and write them back after every wt_episodes mutation instead.
async function recomputeShowWatchState(showId) {
  if (!s) return;
  const { data: eps } = await s.from('wt_episodes').select('season_number, episode_number, last_watched_at').eq('show_id', showId);
  const rows = eps ?? [];
  let last = null;
  for (const e of rows) {
    if (!last || (e.last_watched_at || '') > (last.last_watched_at || '')) last = e;
  }
  await s.from('wt_shows').update({
    ep_watch_count: rows.length,
    last_watched_season: last?.season_number ?? null,
    last_watched_episode_number: last?.episode_number ?? null,
    last_watched_at: last?.last_watched_at ?? null,
  }).eq('id', showId);
}

// Toggle an episode's watched state. Marking watched upserts a wt_episodes
// row; un-marking deletes it — the table only ever holds episodes actually
// watched at least once.
export async function setEpisodeWatched(ownerFields, watched) {
  if (!s) return { error: { message: 'Not configured' } };
  const { show_id, season_number, episode_number } = ownerFields;
  const result = !watched
    ? await s.from('wt_episodes').delete()
        .eq('show_id', show_id).eq('season_number', season_number).eq('episode_number', episode_number)
    : await s.from('wt_episodes').upsert(
        { show_id, season_number, episode_number, watch_count: 1, first_watched_at: new Date().toISOString(), last_watched_at: new Date().toISOString() },
        { onConflict: 'owner,show_id,season_number,episode_number' },
      ).select();
  await recomputeShowWatchState(show_id);
  return result;
}

// Bulk-mark a list of episodes watched in one round trip — used when the
// user marks an episode that has unwatched ones before it and opts to catch
// those up too, rather than one setEpisodeWatched call per episode.
export async function markEpisodesWatched(showId, episodes) {
  if (!s || !episodes.length) return { error: null };
  const now = new Date().toISOString();
  const rows = episodes.map((e) => ({
    show_id: showId, season_number: e.season_number, episode_number: e.episode_number,
    watch_count: 1, first_watched_at: now, last_watched_at: now,
  }));
  const { error } = await s.from('wt_episodes').upsert(rows, { onConflict: 'owner,show_id,season_number,episode_number' });
  if (!error) await recomputeShowWatchState(showId);
  return { error };
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
  // Cache rows written before credits were added to the details fetch have
  // no raw_json.credits — treat those as stale regardless of age so cast
  // shows up on next visit instead of waiting out the full 30-day window.
  if (cached && cached.raw_json?.credits && Date.now() - new Date(cached.fetched_at).getTime() < STALE_MS) {
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
  if (cached && cached.raw_json?.credits && Date.now() - new Date(cached.fetched_at).getTime() < STALE_MS) {
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

// Real streaming availability, refreshed more often than the rest of a
// show/movie's metadata (7 days vs. 30) since providers churn.
const PROVIDERS_STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function getWatchProvidersCached(tmdbId, mediaType) {
  if (!s || !tmdbId) return { data: null, error: null };
  const { data: cached } = await s.from('wt_metadata_cache').select('watch_providers, watch_providers_fetched_at')
    .eq('tmdb_id', tmdbId).eq('media_type', mediaType).maybeSingle();
  if (cached?.watch_providers_fetched_at && Date.now() - new Date(cached.watch_providers_fetched_at).getTime() < PROVIDERS_STALE_MS) {
    return { data: cached.watch_providers, error: null };
  }
  const { data: providers, error } = await getWatchProviders(mediaType, tmdbId);
  if (error) return { data: cached?.watch_providers ?? null, error };
  await s.from('wt_metadata_cache').update({
    watch_providers: providers,
    watch_providers_fetched_at: new Date().toISOString(),
  }).eq('tmdb_id', tmdbId).eq('media_type', mediaType);
  return { data: providers, error: null };
}

// ── Upcoming: episodes-to-air + unreleased movies, TVTime's countdown feed ───

export async function fetchUpcoming() {
  if (!s) return { data: [], error: null };
  const { data: shows, error: showsErr } = await s.from('wt_shows').select('id, series_name, tmdb_id').eq('is_followed', true);
  if (showsErr) return { data: [], error: showsErr };

  const tmdbIds = shows.map((sh) => sh.tmdb_id).filter(Boolean);
  const { data: metaRows } = tmdbIds.length
    ? await s.from('wt_metadata_cache').select('tmdb_id, raw_json').eq('media_type', 'tv').in('tmdb_id', tmdbIds)
    : { data: [] };
  const metaByTmdbId = new Map((metaRows ?? []).map((m) => [m.tmdb_id, m.raw_json]));

  const items = [];
  for (const show of shows) {
    const next = metaByTmdbId.get(show.tmdb_id)?.next_episode_to_air;
    if (!next?.air_date) continue;
    const days = daysUntil(next.air_date);
    if (days == null || days < 0) continue;
    items.push({
      kind: 'episode',
      title: show.series_name,
      subtitle: `S${String(next.season_number).padStart(2, '0')} | E${String(next.episode_number).padStart(2, '0')}${next.name ? ` — ${next.name}` : ''}`,
      date: next.air_date,
      daysUntil: days,
      premiere: next.season_number === 1 && next.episode_number === 1,
    });
  }

  const { data: movies, error: moviesErr } = await s.from('wt_movies').select('movie_name, release_date')
    .or('is_followed.eq.true,is_for_later.eq.true').not('release_date', 'is', null);
  if (!moviesErr) {
    for (const movie of movies) {
      const days = daysUntil(movie.release_date);
      if (days == null || days < 0) continue;
      items.push({ kind: 'movie', title: movie.movie_name, subtitle: 'Release', date: movie.release_date, daysUntil: days, premiere: false });
    }
  }

  items.sort((a, b) => a.daysUntil - b.daysUntil);
  return { data: items, error: null };
}

// ── Matching: search TMDB and set a show/movie's match ───────────────────────

export async function matchShow(showId, tmdbId, status = 'confirmed') {
  return updateShow(showId, { tmdb_id: tmdbId, tmdb_match_status: status });
}

export async function matchMovie(movieId, tmdbId, status = 'confirmed') {
  return updateMovie(movieId, { tmdb_id: tmdbId, tmdb_match_status: status });
}

// ── Add a new title picked from TMDB search (not part of the original
//    TVTime export) ──────────────────────────────────────────────────────────

export async function addShow(tmdbId, name) {
  if (!s) return { error: { message: 'Not configured' } };
  // wt_shows.tvtime_show_id is NOT NULL + unique per owner; real imported ids
  // are positive, so a manually-added show gets a synthetic negative one.
  return s.from('wt_shows').insert({
    tvtime_show_id: -tmdbId,
    series_name: name,
    is_followed: true,
    followed_at: new Date().toISOString(),
    tmdb_id: tmdbId,
    tmdb_match_status: 'confirmed',
  }).select().maybeSingle();
}

export async function addMovie(tmdbId, name, releaseDate) {
  if (!s) return { error: { message: 'Not configured' } };
  return s.from('wt_movies').insert({
    movie_name: name,
    is_followed: true,
    release_date: releaseDate || null,
    tmdb_id: tmdbId,
    tmdb_match_status: 'confirmed',
  }).select().maybeSingle();
}

export { searchShow, searchMovie };
