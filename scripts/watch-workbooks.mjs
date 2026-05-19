/**
 * watch-workbooks.mjs
 * Watches both Side Gig Excel workbooks for saves and re-runs the seed script.
 *
 * Usage: node scripts/watch-workbooks.mjs
 * Or:    double-click scripts/start-watcher.bat
 */

import { watch } from 'chokidar';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const MASTER_PATH = 'C:\\Users\\napol\\OneDrive\\0 - Side Gig Tracking.xlsm';
const TODAY_PATH  = 'C:\\Users\\napol\\OneDrive\\0 - Side Gig Tracking (Today).xlsx';
const DEBOUNCE_MS = 2000;

function timestamp() {
  const d = new Date();
  const date = d.toISOString().slice(0, 10);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `[${date} ${time}]`;
}

let debounceTimer = null;
let seedRunning = false;

function runSeed(triggeredBy) {
  if (seedRunning) return; // prevent overlapping runs
  seedRunning = true;

  const shortName = triggeredBy.split(/[\\/]/).pop();
  console.log(`${timestamp()} Workbook saved (${shortName}) → running seed…`);

  const child = spawn(process.execPath, ['scripts/seed-from-workbooks.mjs'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', d => { output += d.toString(); });
  child.stderr.on('data', d => { output += d.toString(); });

  child.on('close', code => {
    seedRunning = false;
    if (code === 0) {
      const zoneMatch  = output.match(/zone_benchmarks\s*:\s*(\d+) rows/);
      const schedMatch = output.match(/weekly_schedule\s*:\s*1 record/);
      const zoneRows   = zoneMatch  ? zoneMatch[1] : '?';
      const schedRows  = schedMatch ? '1' : '0';
      console.log(`${timestamp()} Workbook saved → seed complete (${zoneRows} zone rows, ${schedRows} schedule row)`);
    } else {
      console.error(`${timestamp()} Seed failed (exit ${code}):`);
      console.error(output.trim());
    }
  });
}

function onWorkbookChange(filePath) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => runSeed(filePath), DEBOUNCE_MS);
}

console.log(`${timestamp()} Watcher started — watching 2 workbooks`);
console.log(`  ${MASTER_PATH}`);
console.log(`  ${TODAY_PATH}`);
console.log('  Save either file in Excel to trigger an auto-seed.\n');

const watcher = watch([MASTER_PATH, TODAY_PATH], {
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 200 },
});

watcher.on('change', onWorkbookChange);
watcher.on('error', err => console.error(`${timestamp()} Watcher error:`, err.message));
