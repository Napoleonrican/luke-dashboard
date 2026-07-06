/**
 * match-tmdb.mjs
 * Backfill script (run after seed-watchtracker.mjs): for every wt_shows /
 * wt_movies row with tmdb_match_status='unmatched', search TMDB by name and
 * auto-set tmdb_id when the top result's title matches exactly (normalized).
 * Anything left unmatched needs the in-app manual-match UI.
 *
 * Requires (in .env): VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_TMDB_API_KEY.
 *
 * Usage:
 *   node scripts/match-tmdb.mjs --dry
 *   node scripts/match-tmdb.mjs
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
const TMDB_KEY         = process.env.VITE_TMDB_API_KEY;
const DRY = process.argv.includes('--dry');

if (!TMDB_KEY) { console.error('ERROR: set VITE_TMDB_API_KEY in .env'); process.exit(1); }
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) { console.error('ERROR: set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const normalize = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tmdbSearch(kind, name) {
  const path = kind === 'tv' ? '/search/tv' : '/search/movie';
  const url = `https://api.themoviedb.org/3${path}?api_key=${TMDB_KEY}&query=${encodeURIComponent(name)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json();
  return json.results ?? [];
}

async function matchTable(table, nameField, kind) {
  const { data: rows, error } = await supabase.from(table).select('*').eq('tmdb_match_status', 'unmatched');
  if (error) { console.error(`  ✗ ${table}: ${error.message}`); return; }
  console.log(`\n${table}: ${rows.length} unmatched`);
  let autoMatched = 0;
  const unresolved = [];
  for (const row of rows) {
    const name = row[nameField];
    const results = await tmdbSearch(kind, name);
    const top = results[0];
    const topTitle = kind === 'tv' ? top?.name : top?.title;
    if (top && normalize(topTitle) === normalize(name)) {
      autoMatched++;
      if (!DRY) {
        await supabase.from(table).update({ tmdb_id: top.id, tmdb_match_status: 'auto' }).eq('id', row.id);
      }
    } else {
      unresolved.push(name);
    }
    await sleep(60); // be a good citizen on the free tier
  }
  console.log(`  ✓ auto-matched ${autoMatched}/${rows.length}`);
  if (unresolved.length) {
    console.log(`  ! unresolved (${unresolved.length}), needs manual match in-app:`);
    console.log(`    ${unresolved.slice(0, 20).join(', ')}${unresolved.length > 20 ? '…' : ''}`);
  }
}

async function main() {
  console.log(DRY ? 'DRY RUN — no writes' : 'Matching against TMDB…');
  await matchTable('wt_shows', 'series_name', 'tv');
  await matchTable('wt_movies', 'movie_name', 'movie');
  console.log('\nDone. Re-running only retries rows still marked unmatched.');
}

main().catch((err) => { console.error(err); process.exit(1); });
