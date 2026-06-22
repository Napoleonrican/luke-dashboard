/**
 * backup-db.mjs
 * Dumps Supabase tables to a timestamped local JSON file so your data is never
 * solely dependent on the third-party service. Human-readable and restorable.
 *
 * Requires: SUPABASE_SERVICE_ROLE_KEY in environment (not the anon key) so it can
 * read past RLS. Get it from Supabase → Project Settings → API → service_role.
 *
 * Usage:
 *   node scripts/backup-db.mjs                # back up the financial tables
 *   node scripts/backup-db.mjs --all         # also include the public tables
 *   node scripts/backup-db.mjs --out=/path   # custom output directory
 *
 * Output: backups/backup-YYYYMMDD-HHMM.json  (the backups/ dir is gitignored)
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Load .env manually (no dotenv dependency) — same approach as seed-from-workbooks.
function loadDotenv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadDotenv(join(ROOT, '.env'));
loadDotenv(join(ROOT, '.env.local'));

const SUPABASE_URL     = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('ERROR: set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

// Financial tables (the data we most need a local hedge for).
const FINANCIAL_TABLES = [
  'fin_accounts', 'fin_bills', 'fin_digital_subscriptions',
  'fin_consumable_subscriptions', 'fin_debts', 'fin_inputs',
];

// The rest of the dashboard's tables (included with --all).
const PUBLIC_TABLES = [
  'debt_settings', 'ai_backlog_tasks', 'zone_benchmarks', 'weekly_schedule',
  'sensor_readings', 'ac_schedule', 'ac_goals',
];

const args   = process.argv.slice(2);
const all    = args.includes('--all');
const outArg = args.find((a) => a.startsWith('--out='));
const outDir = outArg ? outArg.split('=')[1] : join(ROOT, 'backups');

const tables = all ? [...FINANCIAL_TABLES, ...PUBLIC_TABLES] : FINANCIAL_TABLES;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

const dump = { meta: { created_at: new Date().toISOString(), tables: [] }, data: {} };

for (const table of tables) {
  const { data, error } = await supabase.from(table).select('*');
  if (error) {
    // A missing table (migration not run yet) shouldn't abort the whole backup.
    console.warn(`  ⚠ ${table}: ${error.message} (skipped)`);
    continue;
  }
  dump.data[table] = data;
  dump.meta.tables.push({ table, rows: data.length });
  console.log(`  ✓ ${table}: ${data.length} rows`);
}

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const file = join(outDir, `backup-${stamp()}.json`);
writeFileSync(file, JSON.stringify(dump, null, 2));
console.log(`\nBackup written → ${file}`);
