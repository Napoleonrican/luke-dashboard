/**
 * import-vehicle-workbook.mjs
 *
 * Parses "Vehicle Maintenance & Fuel Usage.xlsx" and prints literal SQL INSERT
 * statements for the veh_* tables (see supabase/migrations/049_vehicle_tables.sql).
 * Committed so the import can be re-run against a newer export of the workbook;
 * the workbook itself is never committed.
 *
 * Usage: node scripts/import-vehicle-workbook.mjs <path-to-xlsx> > supabase/migrations/050_vehicle_seed.sql
 *
 * Imports BOTH vehicles:
 *   - CX-5: fuel log (Mazda-Fuel Tracking F:I), completed services
 *     (Mazda-Maintenance S:Y grouped into visits), schedule (Mazda-Maintenance
 *     E:I + N:O, rows 4 through the first blank row).
 *   - Versa: fuel log (Nissan-Fuel Tracking F:I), completed services
 *     (Nissan-Maintenance S:Y — note the column ORDER differs from Mazda's:
 *     Service, Date, Year, Mileage, Cost, Notes, "Mom Funded?" vs Mazda's
 *     Service, Date, Mileage, Cost, Notes, "Previous Costs?", Year), schedule
 *     (Nissan-Maintenance E:I + N:O, rows 4 through the first blank row).
 *
 * Not imported (spreadsheet-derived / out of scope, see the PR plan):
 *   Combined - Maint. & Repairs, Nissan Planned Repairs, *-Cost Per Week.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const path = process.argv[2];
if (!path) {
  console.error('Usage: node scripts/import-vehicle-workbook.mjs <path-to-xlsx>');
  process.exit(1);
}

const wb = XLSX.readFile(path, { cellDates: true });

// ── helpers ───────────────────────────────────────────────────────────────
function cell(ws, colLetter, row) {
  const addr = `${colLetter}${row}`;
  const c = ws[addr];
  return c ? c.v : null;
}

function sqlStr(v) {
  if (v == null) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}
function sqlNum(v) {
  if (v == null || v === '' || v === '-') return 'NULL';
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (!Number.isFinite(n)) return 'NULL';
  // Round away binary floating-point noise (e.g. 555.8399999999999) without
  // losing meaningful precision — the source workbook never has more than a
  // few decimal places.
  return String(Math.round(n * 1e6) / 1e6);
}
function sqlDate(v) {
  if (v == null) return 'NULL';
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return 'NULL';
  const p = (n) => String(n).padStart(2, '0');
  return `'${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}'`;
}
function sqlBool(v) {
  return v ? 'true' : 'false';
}

// ── fuel logs: cols F(date) G(total) H(mileage) I(gallons), header row 2 ───
function readFuelLog(ws, startRow = 3) {
  const rows = [];
  let row = startRow;
  while (row <= 1000) {
    const date = cell(ws, 'F', row);
    if (date == null) {
      // allow a few blank rows before giving up (trailing chart data etc.)
      if (row - startRow > 2000) break;
      row++;
      if (row - startRow > 5 && rows.length > 0 && cell(ws, 'F', row - 1) == null && cell(ws, 'F', row - 2) == null) break;
      continue;
    }
    rows.push({
      fill_date: date,
      total_cost: cell(ws, 'G', row),
      odometer: cell(ws, 'H', row),
      gallons: cell(ws, 'I', row),
    });
    row++;
  }
  return rows;
}

// ── schedule block: cols E(service) F(avg cost) [G(months) or H if there's an
// extra "Est. Yearly Cost" column] I(miles) N(last completed) O(last mileage).
// Mazda: E,F,G,H,I,...,N,O. Nissan: E,F,G(est yearly),H,I,...,N,O — one column
// shifted because of the extra "Est. Yearly Cost" column. Detect by reading
// the header row (row 3) rather than hard-coding.
function readSchedule(ws) {
  // Only scan the schedule block's own columns (B..Q) — the "Services
  // Completed" block starts at S with its own (identically-named) "Service"
  // header, which would otherwise clobber this lookup.
  const header = {};
  for (let c = 2; c <= 17; c++) {
    const colLetter = XLSX.utils.encode_col(c - 1);
    const label = cell(ws, colLetter, 3);
    if (label) header[label] = colLetter;
  }
  const monthsCol = header['Months'];
  const milesCol = header['Miles'];
  const avgCostCol = header['Service Avg. Cost'] || header['Average Cost'];
  const lastCompletedCol = header['Last Completed'];
  const lastMileageCol = header['Last Mileage'];
  const serviceCol = header['Service'];

  const rows = [];
  for (let row = 4; row < 100; row++) {
    const service = cell(ws, serviceCol, row);
    if (service == null) break; // first blank row after row 4 ends the block
    rows.push({
      service,
      avg_cost: cell(ws, avgCostCol, row),
      interval_months: cell(ws, monthsCol, row),
      interval_miles: cell(ws, milesCol, row),
      last_completed_date: cell(ws, lastCompletedCol, row),
      last_odometer: cell(ws, lastMileageCol, row),
    });
  }
  return rows;
}

// ── completed-services block, grouped into visits ────────────────────────
// colMap maps logical field -> column letter, since Mazda and Nissan order
// these columns differently.
function readCompletedServices(ws, colMap) {
  const items = [];
  for (let row = 4; row < 250; row++) {
    const service = cell(ws, colMap.service, row);
    if (service == null) continue;
    items.push({
      service,
      date: cell(ws, colMap.date, row),
      odometer: cell(ws, colMap.mileage, row),
      cost: cell(ws, colMap.cost, row),
      notes: cell(ws, colMap.notes, row),
    });
  }
  // group by (date, odometer) -> visit
  const groups = new Map();
  for (const it of items) {
    const dateKey = it.date instanceof Date ? it.date.toISOString().slice(0, 10) : String(it.date);
    const key = `${dateKey}|${it.odometer}`;
    if (!groups.has(key)) groups.set(key, { date: it.date, odometer: it.odometer, items: [] });
    groups.get(key).items.push(it);
  }
  const visits = [...groups.values()].sort((a, b) => new Date(a.date) - new Date(b.date));
  return { items, visits };
}

// summary: dominant (most expensive) service(s) in the visit, comma-joined.
function summarize(items) {
  const sorted = [...items].sort((a, b) => (b.cost || 0) - (a.cost || 0));
  const top = sorted.slice(0, 3).map((i) => i.service);
  return top.join(', ');
}

// ── build SQL ─────────────────────────────────────────────────────────────
function buildVehicleSQL({ label, name, make, model, modelYear, fuelRows, scheduleRows, visits }) {
  const lines = [];
  lines.push(`-- ── ${label} ──────────────────────────────────────────────────`);
  lines.push(`WITH v AS (`);
  lines.push(`  INSERT INTO veh_vehicles (name, make, model, model_year, active)`);
  lines.push(`  SELECT ${sqlStr(name)}, ${sqlStr(make)}, ${sqlStr(model)}, ${sqlNum(modelYear)}, true`);
  lines.push(`  WHERE NOT EXISTS (SELECT 1 FROM veh_vehicles WHERE name = ${sqlStr(name)})`);
  lines.push(`  RETURNING id`);
  lines.push(`)`);
  lines.push(`INSERT INTO veh_fuel_logs (vehicle_id, fill_date, odometer, gallons, total_cost)`);
  lines.push(`SELECT v.id, x.fill_date, x.odometer, x.gallons, x.total_cost FROM v, (VALUES`);
  lines.push(
    fuelRows
      .map((r, i) => `  (${sqlDate(r.fill_date)}, ${sqlNum(r.odometer)}, ${sqlNum(r.gallons)}, ${sqlNum(r.total_cost)})${i === fuelRows.length - 1 ? '' : ','}`)
      .join('\n'),
  );
  lines.push(`) AS x(fill_date, odometer, gallons, total_cost)`);
  lines.push(`WHERE NOT EXISTS (SELECT 1 FROM veh_fuel_logs fl JOIN veh_vehicles vv ON vv.id = fl.vehicle_id WHERE vv.name = ${sqlStr(name)});`);
  lines.push('');

  if (scheduleRows.length) {
    lines.push(`INSERT INTO veh_service_plan (vehicle_id, service, interval_months, interval_miles, avg_cost, last_completed_date, last_odometer, sort_order)`);
    lines.push(`SELECT v.id, x.service, x.interval_months, x.interval_miles, x.avg_cost, x.last_completed_date, x.last_odometer, x.sort_order`);
    lines.push(`FROM (SELECT id FROM veh_vehicles WHERE name = ${sqlStr(name)}) v, (VALUES`);
    lines.push(
      scheduleRows
        .map(
          (r, i) =>
            `  (${sqlStr(r.service)}, ${sqlNum(r.interval_months)}, ${sqlNum(r.interval_miles)}, ${sqlNum(r.avg_cost)}, ${sqlDate(r.last_completed_date)}, ${sqlNum(r.last_odometer)}, ${i})${i === scheduleRows.length - 1 ? '' : ','}`,
        )
        .join('\n'),
    );
    lines.push(`) AS x(service, interval_months, interval_miles, avg_cost, last_completed_date, last_odometer, sort_order)`);
    lines.push(`WHERE NOT EXISTS (SELECT 1 FROM veh_service_plan sp JOIN veh_vehicles vv ON vv.id = sp.vehicle_id WHERE vv.name = ${sqlStr(name)});`);
    lines.push('');
  }

  if (visits.length) {
    for (const visit of visits) {
      const totalCost = Math.round(visit.items.reduce((s, i) => s + (i.cost || 0), 0) * 100) / 100;
      const summary = summarize(visit.items);
      lines.push(`WITH visit AS (`);
      lines.push(`  INSERT INTO veh_service_visits (vehicle_id, service_date, odometer, summary, total_cost)`);
      lines.push(`  SELECT id, ${sqlDate(visit.date)}, ${sqlNum(visit.odometer)}, ${sqlStr(summary)}, ${sqlNum(totalCost)}`);
      lines.push(`  FROM veh_vehicles WHERE name = ${sqlStr(name)}`);
      lines.push(`  AND NOT EXISTS (`);
      lines.push(`    SELECT 1 FROM veh_service_visits sv JOIN veh_vehicles vv ON vv.id = sv.vehicle_id`);
      lines.push(`    WHERE vv.name = ${sqlStr(name)} AND sv.service_date = ${sqlDate(visit.date)} AND sv.odometer = ${sqlNum(visit.odometer)}`);
      lines.push(`  )`);
      lines.push(`  RETURNING id`);
      lines.push(`)`);
      lines.push(`INSERT INTO veh_service_items (visit_id, service_type, cost, notes, sort_order)`);
      lines.push(`SELECT visit.id, x.service_type, x.cost, x.notes, x.sort_order FROM visit, (VALUES`);
      lines.push(
        visit.items
          .map((it, i) => `  (${sqlStr(it.service)}, ${sqlNum(it.cost)}, ${sqlStr(it.notes)}, ${i})${i === visit.items.length - 1 ? '' : ','}`)
          .join('\n'),
      );
      lines.push(`) AS x(service_type, cost, notes, sort_order);`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ── read sheets ───────────────────────────────────────────────────────────
const mazdaFuel = readFuelLog(wb.Sheets['Mazda-Fuel Tracking']);
const mazdaSchedule = readSchedule(wb.Sheets['Mazda-Maintenance']);
const { visits: mazdaVisits } = readCompletedServices(wb.Sheets['Mazda-Maintenance'], {
  service: 'S', date: 'T', mileage: 'U', cost: 'V', notes: 'W',
});

const nissanFuel = readFuelLog(wb.Sheets['Nissan-Fuel Tracking']);
const nissanSchedule = readSchedule(wb.Sheets['Nissan-Maintenance']);
// Nissan-Maintenance's completed-services columns are in a DIFFERENT order
// than Mazda's: Service, Date, Year, Mileage, Cost, Notes, "Mom Funded?"
const { visits: nissanVisits } = readCompletedServices(wb.Sheets['Nissan-Maintenance'], {
  service: 'S', date: 'T', mileage: 'V', cost: 'W', notes: 'X',
});

console.log(`-- ─────────────────────────────────────────────────────────────────────────────
-- 050 — Vehicle seed data (generated from Vehicle Maintenance & Fuel Usage.xlsx
-- via scripts/import-vehicle-workbook.mjs). Idempotent: every INSERT is guarded
-- so re-running this migration is a no-op once the data exists.
-- ─────────────────────────────────────────────────────────────────────────────
`);

console.log(buildVehicleSQL({
  label: 'CX-5', name: 'CX-5', make: 'Mazda', model: 'CX-5', modelYear: 2016,
  fuelRows: mazdaFuel, scheduleRows: mazdaSchedule, visits: mazdaVisits,
}));

console.log(buildVehicleSQL({
  label: 'Versa', name: 'Versa', make: 'Nissan', model: 'Versa', modelYear: 2015,
  fuelRows: nissanFuel, scheduleRows: nissanSchedule, visits: nissanVisits,
}));

console.error(`
-- Summary (stderr):
--   CX-5:   fuel=${mazdaFuel.length} visits=${mazdaVisits.length} items=${mazdaVisits.reduce((s, v) => s + v.items.length, 0)} plan=${mazdaSchedule.length}
--   Versa:  fuel=${nissanFuel.length} visits=${nissanVisits.length} items=${nissanVisits.reduce((s, v) => s + v.items.length, 0)} plan=${nissanSchedule.length}
`);
