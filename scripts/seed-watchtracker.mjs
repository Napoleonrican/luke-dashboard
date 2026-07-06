/**
 * seed-watchtracker.mjs
 * One-time (idempotent) loader that parses the TVTime GDPR data export and
 * upserts it into the wt_* tables — Luke's TVTime history, preserved on the
 * dashboard before the app shuts down.
 *
 * Reads (from --export-dir, a folder of the export's extracted CSVs):
 *   • tracking-prod-records-v2.csv   — primary source: per-show follow state
 *     (`user-series-*` keys) + per-episode watch events (`watch-episode-*` keys)
 *   • tracking-prod-records.csv       — older, parallel source; the ONLY source
 *     for movies (`follow`/`towatch`/`rewatch_count` rows with entity_type=movie)
 *     and for each show's last-watched-episode pointer (`last-episode-watched`)
 *   • user_tv_show_data.csv           — only source for `is_favorited`
 *   • show_addiction_score.csv        — per-show engagement score
 *   • user_statistics.csv             — user-level lifetime stats snapshot
 *
 * Requires (in .env): VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_UID.
 *
 * Usage:
 *   node scripts/seed-watchtracker.mjs --export-dir=/path/to/extracted --dry
 *   node scripts/seed-watchtracker.mjs --export-dir=/path/to/extracted
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

// ── .env (same approach as seed-financial.mjs) ───────────────────────────────
function loadDotenv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadDotenv(fileURLToPath(new URL('../.env', import.meta.url)));
loadDotenv(fileURLToPath(new URL('../.env.local', import.meta.url)));

const SUPABASE_URL     = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OWNER_UID        = process.env.OWNER_UID || '39345745-a876-422d-ab32-12f85692f681';

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY  = args.includes('--dry');
const argVal = (name, fallback) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=') : fallback;
};
const EXPORT_DIR = argVal('export-dir', null);

if (!EXPORT_DIR) {
  console.error('ERROR: pass --export-dir=/path/to/extracted/gdpr/export');
  process.exit(1);
}
if (!DRY && (!SUPABASE_URL || !SERVICE_ROLE_KEY)) {
  console.error('ERROR: set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

// ── Tiny RFC4180 CSV parser (no new dependency — export is well-formed, only
//    occasional quoted fields for names containing commas) ───────────────────
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function readCSV(name) {
  const path = `${EXPORT_DIR}/${name}`;
  if (!existsSync(path)) {
    console.error(`ERROR: ${name} not found in --export-dir`);
    process.exit(1);
  }
  const rows = parseCSV(readFileSync(path, 'utf8'));
  const header = rows[0];
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const str = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());
const int = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Math.trunc(Number(v)));
const bool = (v) => v === 'true' || v === '1' || v === true;

// v2's `followed_at` is epoch MICROSECONDS (confirmed: 1782134099986242 µs
// decodes to 2026-06-22, matching that row's created_at). The older file's
// epoch fields (`watch_date`, `follow_date_range_key`) are plain seconds.
function fromEpochMicros(v) {
  const n = int(v);
  if (!n) return null;
  return new Date(n / 1000).toISOString();
}
function fromEpochSeconds(v) {
  const n = int(v);
  if (!n) return null;
  return new Date(n * 1000).toISOString();
}
function fromDateString(v) {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s.replace(' ', 'T') + (s.includes('T') ? '' : 'Z'));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ── Parse v2: split by `key` prefix ───────────────────────────────────────────
function parseV2(rows) {
  const shows = new Map();   // tvtime_show_id -> row
  const episodes = [];       // raw watch-episode rows
  for (const r of rows) {
    const key = str(r.key);
    if (!key) continue;
    if (key === 'tracking-stats') continue; // global rollup, not per-entity
    if (key.startsWith('user-series-')) {
      const showId = int(r.s_id);
      if (!showId) continue;
      shows.set(showId, {
        tvtime_show_id: showId,
        series_name: str(r.series_name) || `Show ${showId}`,
        is_followed: bool(r.is_followed),
        is_for_later: bool(r.is_for_later),
        is_archived: bool(r.is_archived),
        followed_at: fromEpochMicros(r.followed_at),
        ep_watch_count: int(r.ep_watch_count),
      });
    } else if (key.startsWith('watch-episode-')) {
      const showId = int(r.s_id);
      const season = int(r.season_number ?? r.s_no);
      const ep = int(r.ep_no ?? r.episode_number);
      if (!showId || season == null || ep == null) continue;
      episodes.push({
        tvtime_show_id: showId,
        series_name: str(r.series_name),
        season_number: season,
        episode_number: ep,
        tvtime_episode_id: int(r.episode_id ?? r.ep_id),
        rewatch_count: int(r.rewatch_count) || 0,
        watched_at: fromDateString(r.created_at),
      });
    }
  }
  return { shows, episodes };
}

// ── Parse v1 (tracking-prod-records.csv): movies + last-watched pointers ────
function parseV1(rows) {
  const movies = new Map(); // movie_name -> row
  const lastWatched = new Map(); // tvtime_show_id -> { episode_id, season, episode, watched_at }

  const getMovie = (name) => {
    if (!movies.has(name)) {
      movies.set(name, { movie_name: name, is_followed: false, is_for_later: false, rewatch_count: 0, release_date: null });
    }
    return movies.get(name);
  };

  for (const r of rows) {
    const type = str(r.type);
    if (!type) continue;
    if (type === 'follow' && str(r.entity_type) === 'movie') {
      const name = str(r.movie_name);
      if (!name) continue;
      const m = getMovie(name);
      m.is_followed = true;
      m.release_date = str(r.release_date)?.slice(0, 10) ?? m.release_date;
    } else if (type === 'towatch' && str(r.entity_type) === 'movie') {
      const name = str(r.movie_name);
      if (!name) continue;
      const m = getMovie(name);
      m.is_for_later = true;
      m.release_date = str(r.release_date)?.slice(0, 10) ?? m.release_date;
    } else if (type === 'rewatch_count' && str(r.entity_type) === 'movie') {
      const name = str(r.movie_name);
      if (!name) continue;
      const m = getMovie(name);
      m.rewatch_count = int(r.rewatch_count) || 0;
    } else if (type === 'last-episode-watched') {
      const showId = int(r.series_id);
      if (!showId) continue;
      lastWatched.set(showId, {
        episode_id: int(r.episode_id),
        season: int(r.season_number),
        episode: int(r.episode_number),
        watched_at: fromEpochSeconds(r.watch_date),
      });
    }
  }
  return { movies, lastWatched };
}

// ── Upsert (owner-scoped clear + insert, matching seed-financial.mjs) ────────
async function reseed(supabase, table, rows) {
  if (DRY) {
    console.log(`\n[dry] ${table}: ${rows.length} rows`);
    console.log(JSON.stringify(rows.slice(0, 2), null, 2));
    return;
  }
  if (!rows.length) { console.log(`  · ${table}: nothing to write`); return; }
  const { error: delErr } = await supabase.from(table).delete().eq('owner', OWNER_UID);
  if (delErr) { console.error(`  ✗ ${table} clear: ${delErr.message}`); return; }
  const { error: insErr } = await supabase.from(table).insert(rows);
  if (insErr) { console.error(`  ✗ ${table} insert: ${insErr.message}`); return; }
  console.log(`  ✓ ${table}: ${rows.length} rows`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Reading export from ${EXPORT_DIR}…`);

  const v2Rows = readCSV('tracking-prod-records-v2.csv');
  const v1Rows = readCSV('tracking-prod-records.csv');
  const favRows = readCSV('user_tv_show_data.csv');
  const scoreRows = readCSV('show_addiction_score.csv');
  const statsRows = readCSV('user_statistics.csv');

  const { shows: v2Shows, episodes: rawEpisodes } = parseV2(v2Rows);
  const { movies, lastWatched } = parseV1(v1Rows);

  // Favorited flag, keyed by tv_show_id
  const favById = new Map();
  for (const r of favRows) {
    const id = int(r.tv_show_id);
    if (id != null) favById.set(id, bool(r.is_favorited));
  }

  // Fold last-watched pointers + favorited flag into the show rows
  const showList = [];
  const showIdOrder = [];
  for (const [tvtimeId, show] of v2Shows) {
    const lw = lastWatched.get(tvtimeId);
    showList.push({
      owner: OWNER_UID,
      tvtime_show_id: tvtimeId,
      series_name: show.series_name,
      is_followed: show.is_followed,
      is_for_later: show.is_for_later,
      is_archived: show.is_archived,
      is_favorited: favById.has(tvtimeId) ? favById.get(tvtimeId) : null,
      followed_at: show.followed_at,
      ep_watch_count: show.ep_watch_count,
      last_watched_episode_id: lw?.episode_id ?? null,
      last_watched_season: lw?.season ?? null,
      last_watched_episode_number: lw?.episode ?? null,
      last_watched_at: lw?.watched_at ?? null,
    });
    showIdOrder.push(tvtimeId);
  }

  // Log any names present in favorites export but not in the primary source
  // (surfaces mismatches rather than silently dropping them).
  const unmatchedFav = [...favById.keys()].filter((id) => !v2Shows.has(id));
  if (unmatchedFav.length) {
    console.log(`  ! ${unmatchedFav.length} show(s) in user_tv_show_data.csv not found in tracking-prod-records-v2.csv (skipped): ${unmatchedFav.slice(0, 10).join(', ')}${unmatchedFav.length > 10 ? '…' : ''}`);
  }

  // Fold per-episode watch events into one row per (show, season, episode),
  // taking watch_count = max(rewatch_count) + 1 across duplicate export rows
  // for the same episode (avoids double-counting export dupes rather than
  // summing them).
  const episodeMap = new Map(); // `${showId}:${season}:${ep}` -> row
  for (const e of rawEpisodes) {
    const k = `${e.tvtime_show_id}:${e.season_number}:${e.episode_number}`;
    const existing = episodeMap.get(k);
    const watchCount = e.rewatch_count + 1;
    if (!existing) {
      episodeMap.set(k, {
        tvtime_show_id: e.tvtime_show_id,
        season_number: e.season_number,
        episode_number: e.episode_number,
        tvtime_episode_id: e.tvtime_episode_id,
        watch_count: watchCount,
        first_watched_at: e.watched_at,
        last_watched_at: e.watched_at,
      });
    } else {
      existing.watch_count = Math.max(existing.watch_count, watchCount);
      if (e.watched_at && (!existing.first_watched_at || e.watched_at < existing.first_watched_at)) existing.first_watched_at = e.watched_at;
      if (e.watched_at && (!existing.last_watched_at || e.watched_at > existing.last_watched_at)) existing.last_watched_at = e.watched_at;
    }
  }

  const movieList = [...movies.values()].map((m) => ({ owner: OWNER_UID, ...m }));

  const scoreList = [];
  for (const r of scoreRows) {
    const showId = int(r.tv_show_id);
    if (showId == null || !v2Shows.has(showId)) continue;
    scoreList.push({
      tvtime_show_id: showId,
      daily_score: int(r.daily_score),
      weekly_score: int(r.weekly_score),
      monthly_score: int(r.monthly_score),
      last_action_at: r.last_action_timestamp ? fromEpochSeconds(r.last_action_timestamp) : null,
    });
  }

  // Latest user_statistics row by updated_at
  let latestStats = null;
  for (const r of statsRows) {
    if (!latestStats || str(r.updated_at) > str(latestStats.updated_at)) latestStats = r;
  }

  console.log(`Parsed: ${showList.length} shows, ${episodeMap.size} distinct watched episodes, ` +
    `${movieList.length} movies, ${scoreList.length} show scores, ${latestStats ? 1 : 0} user stats row`);

  const supabase = DRY ? null : createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(DRY ? '\nDRY RUN — no writes' : '\nWriting to Supabase (owner-scoped reseed)…');
  await reseed(supabase, 'wt_shows', showList);

  // wt_episodes / wt_show_scores need each show's generated uuid PK, so they
  // must run after wt_shows is written and can be looked up by tvtime_show_id.
  let showIdByTvtimeId = new Map();
  if (!DRY) {
    const { data, error } = await supabase.from('wt_shows').select('id, tvtime_show_id').eq('owner', OWNER_UID);
    if (error) { console.error(`  ✗ re-reading wt_shows: ${error.message}`); process.exit(1); }
    showIdByTvtimeId = new Map(data.map((s) => [s.tvtime_show_id, s.id]));
  }

  const episodeRows = [];
  for (const e of episodeMap.values()) {
    const showId = showIdByTvtimeId.get(e.tvtime_show_id);
    if (!DRY && !showId) continue; // show wasn't in this export's user-series set
    episodeRows.push({
      owner: OWNER_UID,
      show_id: DRY ? e.tvtime_show_id : showId,
      season_number: e.season_number,
      episode_number: e.episode_number,
      tvtime_episode_id: e.tvtime_episode_id,
      watch_count: e.watch_count,
      first_watched_at: e.first_watched_at,
      last_watched_at: e.last_watched_at,
    });
  }
  await reseed(supabase, 'wt_episodes', episodeRows);

  const scoreRowsResolved = [];
  for (const s of scoreList) {
    const showId = showIdByTvtimeId.get(s.tvtime_show_id);
    if (!DRY && !showId) continue;
    scoreRowsResolved.push({
      owner: OWNER_UID,
      show_id: DRY ? s.tvtime_show_id : showId,
      daily_score: s.daily_score,
      weekly_score: s.weekly_score,
      monthly_score: s.monthly_score,
      last_action_at: s.last_action_at,
    });
  }
  await reseed(supabase, 'wt_show_scores', scoreRowsResolved);

  await reseed(supabase, 'wt_movies', movieList);

  if (latestStats) {
    const statsRow = {
      owner: OWNER_UID,
      nb_shows_followed: int(latestStats.nb_shows_followed),
      nb_episodes_watched: int(latestStats.nb_episodes_watched),
      time_spent_seconds: int(latestStats.time_spent),
      score: int(latestStats.score),
      nb_friends: int(latestStats.nb_friends),
      nb_reviews: int(latestStats.nb_reviews),
      nb_comments: int(latestStats.nb_comments),
    };
    if (DRY) {
      console.log(`\n[dry] wt_user_stats: 1 row`);
      console.log(JSON.stringify(statsRow, null, 2));
    } else {
      const { error: delErr } = await supabase.from('wt_user_stats').delete().eq('owner', OWNER_UID);
      if (delErr) console.error(`  ✗ wt_user_stats clear: ${delErr.message}`);
      const { error: insErr } = await supabase.from('wt_user_stats').insert(statsRow);
      if (insErr) console.error(`  ✗ wt_user_stats insert: ${insErr.message}`);
      else console.log('  ✓ wt_user_stats: 1 row');
    }
  }

  console.log('\nDone. Re-running is safe — each table is cleared for this owner then reloaded.');
}

main().catch((err) => { console.error(err); process.exit(1); });
