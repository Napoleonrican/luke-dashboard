/**
 * seed-financial.mjs
 * One-time (idempotent) loader that reads the two real workbooks and upserts
 * their data into the fin_* tables — the canonical source of truth that replaces
 * Excel.  Run this once after migration 017; re-running is safe.
 *
 *   • 0 - Financial Workbook.xlsx
 *       Bills, Debts, Digital Subscriptions, Consumable Subscriptions
 *   • 0 - Cashflow Plan (AI_Assisted).xlsx
 *       Inputs (targets/config), Waterfall "Current Balances" (accounts)
 *
 * Requires (in .env): VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_UID.
 * The service_role key bypasses RLS; OWNER_UID stamps every row's owner so the
 * data shows up for the logged-in dashboard user.
 *
 * Usage:
 *   node scripts/seed-financial.mjs
 *   node scripts/seed-financial.mjs --financial="C:\path\Financial.xlsx" --cashflow="C:\path\Cashflow.xlsx"
 *   node scripts/seed-financial.mjs --dry        # parse + print, no writes
 */

import { readFileSync, existsSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

// ── .env (no dotenv dependency, same approach as the other scripts) ───────────
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
const FINANCIAL_PATH = argVal('financial', 'C:\\Users\\napol\\OneDrive\\0 - Financial Workbook.xlsx');
const CASHFLOW_PATH  = argVal('cashflow',  'C:\\Users\\napol\\OneDrive\\0 - Cashflow Plan (AI_Assisted).xlsx');

if (!DRY && (!SUPABASE_URL || !SERVICE_ROLE_KEY)) {
  console.error('ERROR: set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Excel serial date → 'YYYY-MM-DD' (serial 25569 = 1970-01-01).
function excelDate(serial) {
  if (serial == null || serial === '' || typeof serial !== 'number') return null;
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

const num = (v) => (v == null || v === '' ? null : Number(v));
const str = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function readWB(path, label) {
  if (!existsSync(path)) {
    console.error(`ERROR: ${label} not found at: ${path}`);
    console.error('Pass the right path with --financial=... / --cashflow=...');
    process.exit(1);
  }
  return XLSX.readFile(path);
}

function rowsOf(wb, sheet) {
  const ws = wb.Sheets[sheet];
  if (!ws) throw new Error(`Sheet "${sheet}" not found`);
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
}

// ── Extractors ────────────────────────────────────────────────────────────────

// Bills sheet. Data starts at row index 2. We skip the two roll-up rows
// ("Digital Subscriptions" / "Consumable Subscriptions") — those are aggregates
// that live in their own tables (single source of truth, no duplication).
function extractBills(wb) {
  const rows = rowsOf(wb, 'Bills').slice(2);
  const SKIP = new Set(['digital subscriptions', 'consumable subscriptions']);
  const out = [];
  let sort = 0;
  for (const r of rows) {
    const name = str(r[7]);
    if (!name || SKIP.has(name.toLowerCase())) continue;
    out.push({
      owner: OWNER_UID,
      name,
      amount: num(r[21]) ?? 0,           // monthly amount
      category: str(r[8]) || 'Bill',     // Category 1: Bill | Operating | …
      day_due: Number.isFinite(num(r[12])) ? num(r[12]) : null,
      next_due_date: excelDate(r[13]),
      autopay: false,
      account: str(r[15]),
      notes: str(r[18]) ? `Freq: ${str(r[18])}` : null,
      sort_order: sort++,
    });
  }
  return out;
}

// Debts sheet. Data starts at row index 2.
function extractDebts(wb) {
  const rows = rowsOf(wb, 'Debts').slice(2);
  const out = [];
  let sort = 0;
  for (const r of rows) {
    const purchase = str(r[1]);
    if (!purchase) continue;
    const normalPayment = num(r[15]) ?? 0;
    const pendingFlag = r[16] === true || r[16] === 'TRUE' || r[16] === 'true';
    out.push({
      owner: OWNER_UID,
      purchase,
      lender: str(r[3]),
      balance: num(r[10]) ?? 0,
      normal_payment: normalPayment,
      next_due_date: excelDate(r[12]),
      day_due: Number.isFinite(num(r[14])) ? num(r[14]) : null,
      // workbook stores a yes/no flag; carry the upcoming payment as the amount
      // when flagged so the Waterfall has a number to work with (editable later).
      pending_withdrawal: pendingFlag ? normalPayment : 0,
      paydown_priority: Number.isFinite(num(r[17])) ? num(r[17]) : null,
      payments_remaining: Number.isFinite(num(r[18])) ? num(r[18]) : null,
      expected_payoff_date: excelDate(r[19]),
      credit_type: str(r[2]),
      apr: num(r[5]),
      term_months: Number.isFinite(num(r[6])) ? num(r[6]) : null,
      origination_date: excelDate(r[4]),
      finance_charge: num(r[7]),
      credit_limit: num(r[8]),
      sort_order: sort++,
    });
  }
  return out;
}

// Digital Subscriptions sheet. Data starts at row index 2.
function extractDigital(wb) {
  const rows = rowsOf(wb, 'Digital Subscriptions').slice(2);
  const out = [];
  let sort = 0;
  for (const r of rows) {
    const name = str(r[5]);
    if (!name) continue;
    out.push({
      owner: OWNER_UID,
      name,
      amount: num(r[9]) ?? 0,
      frequency: str(r[10]) || 'Monthly',
      next_due_date: excelDate(r[7]),
      day_due: Number.isFinite(num(r[6])) ? num(r[6]) : null,
      autopay: false,
      account: str(r[14]),
      notes: str(r[4]) ? `Category: ${str(r[4])}` : null,
      sort_order: sort++,
    });
  }
  return out;
}

// Consumable Subscriptions sheet. Data starts at row index 2.
// Freq is in WEEKS → order_frequency_days = weeks * 7. monthly_estimate is a
// generated column, so we never set it.
function extractConsumable(wb) {
  const rows = rowsOf(wb, 'Consumable Subscriptions').slice(2);
  const out = [];
  let sort = 0;
  for (const r of rows) {
    const name = str(r[5]);
    if (!name) continue;
    const freqWeeks = num(r[9]);
    out.push({
      owner: OWNER_UID,
      name,
      cost_per_order: num(r[8]) ?? 0,
      order_frequency_days: freqWeeks ? Math.max(1, Math.round(freqWeeks * 7)) : 30,
      notes: str(r[4]) ? `Category: ${str(r[4])}` : null,
      sort_order: sort++,
    });
  }
  return out;
}

// Cashflow → Inputs sheet. Header row 0; data from row 1.
function extractInputs(wb) {
  const rows = rowsOf(wb, 'Inputs').slice(1);
  const out = [];
  const seen = new Set();
  for (const r of rows) {
    const label = str(r[0]);
    if (!label) continue;
    let slug = slugify(label);
    while (seen.has(slug)) slug += '_x';
    seen.add(slug);
    out.push({
      owner: OWNER_UID,
      slug,
      label,
      value: num(r[1]),
      unit: str(r[2]),                   // Frequency column
      notes: str(r[3]),
    });
  }
  return out;
}

// Accounts come from the Waterfall "Current Balances" block. These are a small,
// stable set, so we map them explicitly (label in the sheet → slug + balance).
function extractAccounts(wb) {
  const rows = rowsOf(wb, 'Waterfall');
  const WANT = [
    { match: /^Bill Pay Checking Balance/i,        name: 'Bill Pay Checking',          slug: 'billpay' },
    { match: /^Operating Checking Balance/i,        name: 'Operating Checking',         slug: 'operating' },
    { match: /^Debt\/Loan Checking Balance/i,       name: 'Debt/Loan Checking',         slug: 'debtloan' },
    { match: /^Uber Pro Card Balance/i,             name: 'Uber Pro Card',              slug: 'uberpro' },
    { match: /^Vehicle Maintenance Savings/i,       name: 'Vehicle Maintenance Savings',slug: 'vehicle_maint' },
    { match: /^Primary Savings/i,                    name: 'Primary Savings (Emergency)',slug: 'emergency' },
  ];
  const out = [];
  let sort = 0;
  for (const want of WANT) {
    // label sits at col index 2, value at col index 3
    const row = rows.find((r) => typeof r[2] === 'string' && want.match.test(r[2]));
    out.push({
      owner: OWNER_UID,
      name: want.name,
      slug: want.slug,
      balance: row ? (num(row[3]) ?? 0) : 0,
      sort_order: sort++,
    });
  }
  return out;
}

// ── Upsert: clear this owner's rows, then insert (clean idempotent reseed) ─────
async function reseed(supabase, table, rows, conflictNote) {
  if (DRY) {
    console.log(`\n[dry] ${table}: ${rows.length} rows`);
    console.log(JSON.stringify(rows.slice(0, 2), null, 2));
    return;
  }
  const { error: delErr } = await supabase.from(table).delete().eq('owner', OWNER_UID);
  if (delErr) { console.error(`  ✗ ${table} clear: ${delErr.message}`); return; }
  const { error: insErr } = await supabase.from(table).insert(rows);
  if (insErr) { console.error(`  ✗ ${table} insert: ${insErr.message}`); return; }
  console.log(`  ✓ ${table}: ${rows.length} rows${conflictNote ? ` (${conflictNote})` : ''}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Reading workbooks…');
  const fin = readWB(FINANCIAL_PATH, 'Financial Workbook');
  const cf  = readWB(CASHFLOW_PATH, 'Cashflow Plan');

  const bills      = extractBills(fin);
  const debts      = extractDebts(fin);
  const digital    = extractDigital(fin);
  const consumable = extractConsumable(fin);
  const inputs     = extractInputs(cf);
  const accounts   = extractAccounts(cf);

  console.log(`Parsed: ${accounts.length} accounts, ${bills.length} bills, ${debts.length} debts, ` +
    `${digital.length} digital subs, ${consumable.length} consumable subs, ${inputs.length} inputs`);

  const supabase = DRY ? null : createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(DRY ? '\nDRY RUN — no writes' : '\nWriting to Supabase (owner-scoped reseed)…');
  await reseed(supabase, 'fin_accounts', accounts);
  await reseed(supabase, 'fin_bills', bills);
  await reseed(supabase, 'fin_debts', debts);
  await reseed(supabase, 'fin_digital_subscriptions', digital);
  await reseed(supabase, 'fin_consumable_subscriptions', consumable);
  await reseed(supabase, 'fin_inputs', inputs);

  console.log('\nDone. Re-running is safe — each table is cleared for this owner then reloaded.');
}

main().catch((err) => { console.error(err); process.exit(1); });
