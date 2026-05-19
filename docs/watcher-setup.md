# Workbook Watcher Setup

The watcher detects when either Excel workbook is saved and automatically re-runs the seed script to sync data to Supabase.

---

## Starting the watcher

**Double-click** `scripts/start-watcher.bat` in the `luke-dashboard` folder.

A terminal window will open and show:

```
[2026-05-19 10:30] Watcher started — watching 2 workbooks
  C:\Users\napol\OneDrive\0 - Side Gig Tracking.xlsm
  C:\Users\napol\OneDrive\0 - Side Gig Tracking (Today).xlsx
  Save either file in Excel to trigger an auto-seed.
```

To start it manually from a terminal:

```sh
cd luke-dashboard
node scripts/watch-workbooks.mjs
```

---

## How to tell it's working

When you save either workbook in Excel, the watcher prints:

```
[2026-05-19 10:34] Workbook saved (0 - Side Gig Tracking.xlsm) → running seed…
[2026-05-19 10:34] Workbook saved → seed complete (28 zone rows, 1 schedule row)
```

If the seed fails (e.g. missing service role key), the error is printed in the same window.

---

## Auto-start at login (Windows startup folder)

1. Press **Win + R**, type `shell:startup`, press Enter — the Startup folder opens.
2. Right-click `scripts/start-watcher.bat` → **Create shortcut**.
3. Drag (or copy) the shortcut into the Startup folder.

The watcher will now launch automatically each time Windows starts.

---

## Requirements

- The watcher must be running for auto-sync to work — it does not run in the background on its own.
- `SUPABASE_SERVICE_ROLE_KEY` must be present in `luke-dashboard/.env` (the seed script needs it).
- Both workbook files must exist at their OneDrive paths.

---

## Stopping the watcher

Close the terminal window, or press **Ctrl + C** inside it.
