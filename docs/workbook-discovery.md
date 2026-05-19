# Workbook Discovery Report

**Date:** 2026-05-19  
**Analyst:** Claude (automated discovery pass)

---

## Workbooks Found

| File | Path | Last Modified |
|------|------|--------------|
| Master workbook | `C:\Users\napol\OneDrive\0 - Side Gig Tracking.xlsm` | 2026-05-19 |
| Road workbook | `C:\Users\napol\OneDrive\0 - Side Gig Tracking (Today).xlsx` | 2026-05-18 |

---

## Master Workbook: `0 - Side Gig Tracking.xlsm`

### Sheets
House Buying Power, M-Priorities, Priorities, Dashboards, Metrics, **Scheduling**, **Data**, Calculator, **CpM**, Seasonality WIP, **Pivots**, **Combined _WIP_**, **KPIs**, Pay Type Comparison, Profitable Start Times, Trends, Millionaire Plan, Taxes

### Key tabs for benchmark data: **KPIs**

The KPIs tab contains multiple side-by-side metric tables. Relevant sections (columns C–L, rows 1–50):

| Row(s) | Metric | Notes |
|--------|--------|-------|
| 2–8 | **Gross Earnings Per Hour (EPH)** | By zone + day, Sun=col D, Sat=col J |
| 11–18 | **Gross Earnings Per Mile** | By zone + day |
| 20–27 | **Average Miles Per Delivery** | By zone + day |
| 29–36 | **Estimated Time Per Trip** | In Excel day fractions — multiply × 1440 for minutes |
| 38–45 | **Order Density (Trips/Hour)** | By zone + day |
| 47–50+ | **Trips Per Shift** | By zone |

**Gross Earnings Per Trip** also lives on the KPIs tab in a second column group (cols L–T approx), rows 12–16.

Day column order throughout: **Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday**

---

### Zone EPH Values (KPIs tab, rows 4–7)

| Zone | Sun | Mon | Tue | Wed | Thu | Fri | Sat |
|------|-----|-----|-----|-----|-----|-----|-----|
| Augusta | 17.4862 | 17.6065 | 19.3500 | 15.9181 | 16.2341 | 18.9763 | 21.4313 |
| Brunswick/Bath/Freeport | 21.4017 | 21.2519 | 22.0561 | 23.0357 | 23.4169 | 23.6033 | 25.1545 |
| Lewiston | 17.1360 | 15.4056 | 16.1147 | 23.0191 | 18.3732 | 23.5396 | 21.2478 |
| Portland | 21.9314 | 20.9007 | 21.9912 | 19.2203 | 18.5159 | 22.3884 | 20.6221 |

**Match vs. hardcoded GigTracker.jsx:** Exact match to 2 decimal places (values rounded identically).

---

### Trip Minutes Values (KPIs tab, rows 31–34, converted from day fractions × 1440)

| Zone | Sun | Mon | Tue | Wed | Thu | Fri | Sat |
|------|-----|-----|-----|-----|-----|-----|-----|
| Augusta | 30.97 | 35.61 | 32.76 | 44.48 | 35.77 | 36.51 | 27.53 |
| Brunswick/Bath/Freeport | 29.24 | 30.25 | 30.97 | 28.21 | 28.57 | 30.10 | 26.81 |
| Lewiston | 27.38 | 30.68 | 27.35 | 27.27 | 27.80 | 26.82 | 28.63 |
| Portland | 33.93 | 32.36 | 34.42 | 29.42 | 37.07 | 33.39 | 34.51 |

**Match vs. hardcoded:** Exact match.

---

### Miles Values (KPIs tab, rows 22–25)

| Zone | Sun | Mon | Tue | Wed | Thu | Fri | Sat |
|------|-----|-----|-----|-----|-----|-----|-----|
| Augusta | 11.30 | 15.23 | 12.44 | 20.50 | 15.28 | 15.79 | 10.67 |
| Brunswick/Bath/Freeport | 10.54 | 11.64 | 11.79 | 10.76 | 10.51 | 12.04 | 10.09 |
| Lewiston | 8.33 | 9.19 | 9.94 | 7.59 | 8.51 | 6.80 | 9.31 |
| Portland | 11.60 | 12.61 | 15.60 | 9.86 | 13.73 | 13.31 | 12.84 |

**Match vs. hardcoded GigTracker.jsx:** Exact match. (Note: the task description listed different Portland values — Mon=12.05, Tue=12.48, etc. — but those appear to be stale. The workbook matches the current code.)

---

### Per-Order Average (Gross Earnings Per Trip, KPIs tab rows ~13–16 second column group)

This data is **per zone per day** — not a single global number.

| Zone | Sun | Mon | Tue | Wed | Thu | Fri | Sat |
|------|-----|-----|-----|-----|-----|-----|-----|
| Augusta | 8.94 | 10.32 | 10.46 | 11.67 | 9.12 | 11.61 | 9.70 |
| Brunswick/Bath/Freeport | 10.32 | 10.60 | 11.17 | 10.60 | 10.99 | 11.30 | 10.95 |
| Lewiston | 7.80 | 7.65 | 7.28 | 10.12 | 8.56 | 10.42 | 10.04 |
| Portland | 12.02 | 11.35 | 12.69 | 9.11 | 11.48 | 11.82 | 11.68 |

**Implication for schema:** Drop `global_averages` table. Populate `per_order_avg` column in `zone_benchmarks` per zone/day.

---

### Scheduling Tab — AX3:BG9 Block

**Location:** Scheduling tab, range `AX2:BG9`  
**Size:** 10 columns × 8 rows (1 header + 7 data rows, one per day)  
**Note:** The task description said "7 rows × 16 cols" — actual is **7 rows × 10 cols**.

#### Column Headers (AX2:BG2)
| Col | Header |
|-----|--------|
| AX | LOB (weight/rank score) |
| AY | DOW (day of week name) |
| AZ | Area (recommended zone) |
| BA | Earliest (Excel time fraction) |
| BB | Latest (Excel time fraction) |
| BC | Type (Hourly / Order / Hourly-Test) |
| BD | Min earnings |
| BE | Min hours |
| BF | Max earnings |
| BG | Max hours |

#### Sample Data (as of last save)
| LOB | DOW | Area | Earliest | Latest | Type | Min$ | Min hrs | Max$ | Max hrs |
|-----|-----|------|----------|--------|------|------|---------|------|---------|
| 7 | Monday | (none) | — | — | — | 0 | 3 | 74.68 | 3 |
| 5.5 | Tuesday | Brunswick/Bath/Freeport | 18:30 | 18:30 | Hourly | 74.68 | 3.15 | 88.88 | 3.57 |
| 2 | Wednesday | (none) | — | — | — | 0 | 2.63 | 123.85 | 4.97 |
| 4 | Thursday | Portland | 17:00 | 17:30 | Hourly-Test | 52.90 | 2.13 | 74.68 | 3 |
| 1 | Friday | Lewiston | 18:00 | 20:00 | Hourly | 40.45 | 1.63 | 81.53 | 3.27 |
| 3 | Saturday | Brunswick/Bath/Freeport | 15:30 | 16:00 | Order | 25.52 | 1.03 | 61.61 | 2.47 |
| 5.5 | Sunday | Lewiston | 14:00 | 18:00 | Hourly-Test | 13.07 | 0.53 | 39.21 | 1.57 |

Earliest/Latest are stored as Excel time fractions (e.g., 0.7708 = 18:30). The seed script converts these to "HH:MM" strings.

---

## Today Workbook: `0 - Side Gig Tracking (Today).xlsx`

### Sheets
- **Today** — live shift tracker (A1:V37)
- **Data Tables** — pulls benchmark data (A1:L29)

### Data Tables Sheet
Mirrors four KPIs-tab tables: EPH, Estimated Time Per Trip, Average Miles Per Delivery, Gross Earnings Per Trip — all appear to be externally linked from the master workbook (values match exactly). No formula text was visible (XLSX parser returns cached values for external links).

### Today Sheet — Schedule Block
The schedule block from the master Scheduling tab (AX3:BG9) is echoed in Today columns I–R, rows 3–9. The data is sorted by priority ranking (LOB column). Per-session runtime data (start time, orders, EPH, goals) lives in columns B–G rows 1–20.

### External Links
The XLSX parser could not read formula text for external links (a limitation of .xlsm → .xlsx cross-workbook references when the source file isn't open). Values are present as cached data.

---

## Discrepancies vs. Hardcoded Constants

| Metric | Source | Status |
|--------|--------|--------|
| Zone EPH | Workbook KPIs tab | ✓ Match (2dp rounding) |
| Trip minutes | Workbook KPIs tab | ✓ Match (2dp rounding) |
| Miles | Workbook KPIs tab | ✓ Match (2dp rounding) |
| Portland miles in task description | Task prompt | ⚠ Stale — code already has correct values |
| Per-order avg | Not previously hardcoded | New data — added to zone_benchmarks |

---

## Credentials Status

| Credential | Location | Status |
|-----------|----------|--------|
| VITE_SUPABASE_URL | luke-dashboard/.env | ✓ Present |
| VITE_SUPABASE_ANON_KEY | luke-dashboard/.env | ✓ Present |
| SUPABASE_SERVICE_ROLE_KEY | — | ✗ Missing |

**Action required:** Luke must add `SUPABASE_SERVICE_ROLE_KEY` to `luke-dashboard/.env` (not committed). Run the seed script after adding it.

---

## Data Model Proposal

Three tables are needed. The `global_averages` table from the default schema is **dropped** because per-order average exists per zone/day.

### `zone_benchmarks`

```sql
CREATE TABLE zone_benchmarks (
  zone          text        NOT NULL,
  day           text        NOT NULL,  -- 'Sun','Mon','Tue','Wed','Thu','Fri','Sat'
  eph           numeric     NOT NULL,
  trip_mins     numeric     NOT NULL,
  miles         numeric     NOT NULL,
  per_order_avg numeric,               -- Gross Earnings Per Trip, per zone/day
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (zone, day)
);
```

28 rows (4 zones × 7 days). Seed from KPIs tab.

### `weekly_schedule`

```sql
CREATE TABLE weekly_schedule (
  week_start_date  date        PRIMARY KEY,  -- Sunday of that week
  rows             jsonb       NOT NULL,     -- array of 7 schedule row objects
  source_label     text,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
```

Each element in `rows`:
```json
{
  "lob": 7,
  "dow": "Monday",
  "area": "",
  "earliest": "18:30",
  "latest": "18:30",
  "type": "Hourly",
  "min_earnings": 74.68,
  "min_hours": 3.15,
  "max_earnings": 88.88,
  "max_hours": 3.57
}
```

---

## How to Re-seed

1. Add `SUPABASE_SERVICE_ROLE_KEY=<your key>` to `luke-dashboard/.env` (get from Supabase dashboard → Project Settings → API).
2. Ensure both workbook files are in their discovered paths on OneDrive.
3. From the `luke-dashboard/` directory:
   ```sh
   node scripts/seed-from-workbooks.mjs
   ```
4. The script logs a summary of upserted rows. Safe to re-run (idempotent upsert).

---

## Manual Steps Required

1. **Run SQL migrations** — Luke needs to paste the contents of `supabase/migrations/001_zone_benchmarks.sql` and `supabase/migrations/002_weekly_schedule.sql` into the Supabase SQL editor (https://supabase.com/dashboard), or use `supabase db push` with the CLI.
2. **Add service role key** — Add `SUPABASE_SERVICE_ROLE_KEY` to `luke-dashboard/.env` before running the seed script.
3. **Run seed** — `node scripts/seed-from-workbooks.mjs` from `luke-dashboard/`.
