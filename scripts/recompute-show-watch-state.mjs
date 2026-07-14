/**
 * recompute-show-watch-state.mjs
 * One-time backfill: wt_shows.ep_watch_count/last_watched_* had drifted out
 * of sync with wt_episodes for any show whose episodes were marked/unmarked
 * in-app before setEpisodeWatched started recomputing them automatically.
 * Recomputes both from wt_episodes for every show, for real.
 *
 * Requires (in .env): VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_UID.
 *
 * Usage:
 *   node scripts/recompute-show-watch-state.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

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

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('ERROR: set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const { data: shows, error: showsErr } = await supabase.from('wt_shows').select('id, series_name, ep_watch_count').eq('owner', OWNER_UID);
  if (showsErr) { console.error(showsErr.message); process.exit(1); }

  // PostgREST caps a single response at 1000 rows — with thousands of watched
  // episodes, a plain select silently returns only the first page and makes
  // every unseen show look like 0 watched. Page through with .range() until a
  // short page comes back so we get ALL episodes.
  const episodes = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error: epErr } = await supabase.from('wt_episodes')
      .select('show_id, season_number, episode_number, last_watched_at')
      .eq('owner', OWNER_UID)
      .range(from, from + PAGE - 1);
    if (epErr) { console.error(epErr.message); process.exit(1); }
    episodes.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  console.log(`Loaded ${episodes.length} watched episodes across ${shows.length} shows.`);

  const byShow = new Map();
  for (const e of episodes) {
    if (!byShow.has(e.show_id)) byShow.set(e.show_id, []);
    byShow.get(e.show_id).push(e);
  }

  let changed = 0;
  for (const show of shows) {
    const eps = byShow.get(show.id) ?? [];
    let last = null;
    for (const e of eps) {
      if (!last || (e.last_watched_at || '') > (last.last_watched_at || '')) last = e;
    }
    const next = {
      ep_watch_count: eps.length,
      last_watched_season: last?.season_number ?? null,
      last_watched_episode_number: last?.episode_number ?? null,
      last_watched_at: last?.last_watched_at ?? null,
    };
    if (next.ep_watch_count === (show.ep_watch_count ?? 0)) continue; // unchanged, skip the write
    changed++;
    console.log(`  ${show.series_name}: ${show.ep_watch_count ?? 0} -> ${next.ep_watch_count}`);
    const { error } = await supabase.from('wt_shows').update(next).eq('id', show.id);
    if (error) console.error(`  ✗ ${show.series_name}: ${error.message}`);
  }
  console.log(`\nDone. ${changed}/${shows.length} shows corrected.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
