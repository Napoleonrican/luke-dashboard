/**
 * match-tmdb.mjs
 * Backfill script (run after seed-watchtracker.mjs): for every wt_shows /
 * wt_movies row with tmdb_match_status='unmatched', search TMDB by name
 * (stripping a trailing "(YYYY)" TVTime sometimes appends) and auto-set
 * tmdb_id on the first exact (normalized) title match found anywhere in the
 * results — not just the top one, since TMDB ranks by popularity, not name
 * accuracy — using the year to disambiguate if more than one exact match
 * comes back. Anything left unmatched needs the in-app manual-match UI.
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

// TVTime sometimes appends a disambiguator in parens — a year for a
// remake/reboot ("Love & Death (2023)") or a region/version tag ("House of
// Cards (US)") — that TMDB's own title never includes, so normalized
// comparison always fails unless it's stripped first. Only a 4-digit year
// is kept around afterward, to break ties between same-named results.
const SUFFIX_RE = /\s*\(([^()]+)\)\s*$/;
function stripYear(name) {
  const m = name.match(SUFFIX_RE);
  if (!m) return { base: name, year: null };
  const inner = m[1].trim();
  const year = /^\d{4}$/.test(inner) ? Number(inner) : null;
  return { base: name.slice(0, m.index).trim(), year };
}

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
    const { base, year } = stripYear(name);
    const results = await tmdbSearch(kind, base);
    // TMDB's top hit is ranked by popularity, not name accuracy — a less
    // popular but exact-title match can sit lower in the list, so scan all
    // results for an exact (normalized) title match instead of only #1.
    const exact = results.filter((r) => normalize(kind === 'tv' ? r.name : r.title) === normalize(base));
    let match = exact[0];
    if (year && exact.length > 1) {
      const withYear = exact.find((r) => {
        const d = kind === 'tv' ? r.first_air_date : r.release_date;
        return d && Number(d.slice(0, 4)) === year;
      });
      if (withYear) match = withYear;
    }
    if (match) {
      autoMatched++;
      if (!DRY) {
        await supabase.from(table).update({ tmdb_id: match.id, tmdb_match_status: 'auto' }).eq('id', row.id);
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
