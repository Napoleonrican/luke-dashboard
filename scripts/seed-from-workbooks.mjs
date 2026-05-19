/**
 * seed-from-workbooks.mjs
 * Reads zone benchmark data and the weekly schedule block from the Side Gig
 * Excel workbooks and upserts them into Supabase.
 *
 * Requires: SUPABASE_SERVICE_ROLE_KEY in environment (not the anon key).
 *
 * Usage: node scripts/seed-from-workbooks.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

// ── Config ──────────────────────────────────────────────────────────────────

// Load .env manually (no dotenv dependency)
function loadDotenv(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadDotenv(fileURLToPath(new URL('../.env',       import.meta.url)));
loadDotenv(fileURLToPath(new URL('../.env.local', import.meta.url)));

const SUPABASE_URL      = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MASTER_PATH       = 'C:\\Users\\napol\\OneDrive\\0 - Side Gig Tracking.xlsm';
const TODAY_PATH        = 'C:\\Users\\napol\\OneDrive\\0 - Side Gig Tracking (Today).xlsx';

if (!SUPABASE_URL) {
  console.error('ERROR: VITE_SUPABASE_URL not set in .env');
  process.exit(1);
}
if (!SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY not set.');
  console.error('Add it to luke-dashboard/.env — get it from Supabase dashboard → Project Settings → API.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DAYS  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ZONES = ['Augusta', 'Brunswick/Bath/Freeport', 'Lewiston', 'Portland'];

// ── Helpers ─────────────────────────────────────────────────────────────────

function excelTimeToHHMM(fraction) {
  if (fraction == null || fraction === '' || fraction === 0) return null;
  const totalMinutes = Math.round(fraction * 24 * 60);
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getWeekStart(date = new Date()) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay()); // back to Sunday
  return d.toISOString().slice(0, 10);
}

// ── Extract zone benchmarks from KPIs tab ───────────────────────────────────

function extractZoneBenchmarks(wb) {
  const kpisTab = wb.SheetNames.find(n => /kpi/i.test(n));
  if (!kpisTab) throw new Error('KPIs tab not found in master workbook');
  const ws = wb.Sheets[kpisTab];

  // EPH: C4:K7 (C=zone name, D-J=Sun-Sat, col offset 0=name, 1-7=Sun-Sat)
  const ephRows    = XLSX.utils.sheet_to_json(ws, { header:1, range:'C4:K7',  defval:null });
  // Per-trip avg: M13:T16 (M=zone name, N-T=Sun-Sat, col offset 0=name, 1-7=Sun-Sat)
  const tripRows   = XLSX.utils.sheet_to_json(ws, { header:1, range:'M13:T16', defval:null });
  // Miles: C22:K25
  const milesRows  = XLSX.utils.sheet_to_json(ws, { header:1, range:'C22:K25', defval:null });
  // Trip time (in day fractions): C31:K34
  const timeRows   = XLSX.utils.sheet_to_json(ws, { header:1, range:'C31:K34', defval:null });

  const records = [];

  for (let zi = 0; zi < ZONES.length; zi++) {
    const zone = ZONES[zi];
    const ephData  = ephRows[zi]  || [];
    const tripData = tripRows[zi] || [];
    const milesData= milesRows[zi]|| [];
    const timeData = timeRows[zi] || [];

    for (let di = 0; di < DAYS.length; di++) {
      const day = DAYS[di];
      // Offset by 1 because col 0 is the zone name label
      const eph         = Number(ephData[di + 1])   || null;
      const miles       = Number(milesData[di + 1]) || null;
      const timeFrac    = Number(timeData[di + 1])  || null;
      const trip_mins   = timeFrac != null ? parseFloat((timeFrac * 1440).toFixed(4)) : null;
      // tripData: col 0 is zone name, then Sun-Sat
      const per_order_avg = Number(tripData[di + 1]) || null;

      if (eph == null && miles == null && trip_mins == null) continue;

      records.push({ zone, day, eph, trip_mins, miles, per_order_avg, updated_at: new Date().toISOString() });
    }
  }

  return records;
}

// ── Extract schedule block from Scheduling tab ──────────────────────────────

function extractSchedule(wb, weekStartDate) {
  const schedTab = wb.SheetNames.find(n => /schedul/i.test(n));
  if (!schedTab) throw new Error('Scheduling tab not found in master workbook');
  const ws = wb.Sheets[schedTab];

  // AX3:BG9 = 7 rows × 10 cols
  // Headers: LOB, DOW, Area, Earliest, Latest, Type, Min$, Min hrs, Max$, Max hrs
  const block = XLSX.utils.sheet_to_json(ws, { header:1, range:'AX3:BG9', defval:null });

  const rows = block.map(r => ({
    lob:          r[0] != null ? Number(r[0]) : null,
    dow:          r[1] ?? null,
    area:         r[2] ?? null,
    earliest:     excelTimeToHHMM(r[3]),
    latest:       excelTimeToHHMM(r[4]),
    type:         r[5] ?? null,
    min_earnings: r[6] != null ? parseFloat(Number(r[6]).toFixed(4)) : null,
    min_hours:    r[7] != null ? parseFloat(Number(r[7]).toFixed(4)) : null,
    max_earnings: r[8] != null ? parseFloat(Number(r[8]).toFixed(4)) : null,
    max_hours:    r[9] != null ? parseFloat(Number(r[9]).toFixed(4)) : null,
  }));

  return {
    week_start_date: weekStartDate,
    rows,
    source_label: 'seed-from-workbooks.mjs',
    updated_at: new Date().toISOString(),
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Loading workbooks...');

  if (!existsSync(MASTER_PATH)) {
    console.error(`Master workbook not found: ${MASTER_PATH}`);
    process.exit(1);
  }
  if (!existsSync(TODAY_PATH)) {
    console.warn(`Today workbook not found: ${TODAY_PATH} — skipping schedule extract`);
  }

  const master = XLSX.readFile(MASTER_PATH);

  // ── Zone benchmarks ──
  console.log('\nExtracting zone benchmarks...');
  const benchmarks = extractZoneBenchmarks(master);
  console.log(`  ${benchmarks.length} rows extracted (expect 28)`);

  console.log('  Upserting into zone_benchmarks...');
  const { error: benchErr } = await supabase
    .from('zone_benchmarks')
    .upsert(benchmarks, { onConflict: 'zone,day' });

  if (benchErr) {
    console.error('  ERROR upserting zone_benchmarks:', benchErr.message);
  } else {
    console.log(`  ✓ zone_benchmarks upserted (${benchmarks.length} rows)`);
  }

  // ── Weekly schedule ──
  const weekStart = getWeekStart();
  console.log(`\nExtracting weekly schedule (week starting ${weekStart})...`);
  let schedRecord;
  try {
    schedRecord = extractSchedule(master, weekStart);
    console.log(`  ${schedRecord.rows.length} schedule rows extracted`);

    console.log('  Upserting into weekly_schedule...');
    const { error: schedErr } = await supabase
      .from('weekly_schedule')
      .upsert(schedRecord, { onConflict: 'week_start_date' });

    if (schedErr) {
      console.error('  ERROR upserting weekly_schedule:', schedErr.message);
    } else {
      console.log(`  ✓ weekly_schedule upserted for week ${weekStart}`);
    }
  } catch (e) {
    console.error('  ERROR extracting schedule:', e.message);
  }

  // ── Summary ──
  console.log('\n── Summary ─────────────────────────────────────────');
  if (!benchErr) {
    console.log(`zone_benchmarks : ${benchmarks.length} rows upserted`);
    for (const z of ZONES) {
      const zRows = benchmarks.filter(r => r.zone === z);
      const sample = zRows.find(r => r.day === 'Tue');
      if (sample) console.log(`  ${z}/Tue — EPH:${sample.eph?.toFixed(2)} miles:${sample.miles?.toFixed(2)} tripMins:${sample.trip_mins?.toFixed(2)} perOrder:${sample.per_order_avg?.toFixed(2)}`);
    }
  }
  if (schedRecord && !schedRecord.error) {
    console.log(`weekly_schedule : 1 record for ${weekStart}`);
  }
  console.log('\nDone. Safe to re-run — all upserts are idempotent.');
}

main().catch(err => { console.error(err); process.exit(1); });
