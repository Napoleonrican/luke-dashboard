-- ─────────────────────────────────────────────────────────────────────────────
-- 018 — Bills: workbook-faithful columns
-- ─────────────────────────────────────────────────────────────────────────────
-- Brings fin_bills in line with the "Monthly Bills" sheet so the dedicated Bills
-- page can mirror the workbook. `amount` now holds the raw per-frequency figure
-- (the sheet's "Amt." column); the monthly value ("Mon.") is derived in the UI
-- from amount + frequency, exactly like the spreadsheet.
--
--   • updated_on    — the sheet's "Updated" date (manual "last verified" date,
--                     distinct from updated_at which tracks row writes).
--   • total_updated — the sheet's "Total Updated" date.
--   • yoy_change    — year-over-year change, stored as a fraction (0.18 = 18%).
--   • frequency     — Annually | Monthly | Bi-Weekly | Weekly | Quarterly | …
--   • category2/3   — the sheet's Category 2 / Category 3 sub-classifications.
--   • priority      — the sheet's Priority column.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE fin_bills ADD COLUMN IF NOT EXISTS updated_on    date;
ALTER TABLE fin_bills ADD COLUMN IF NOT EXISTS total_updated date;
ALTER TABLE fin_bills ADD COLUMN IF NOT EXISTS yoy_change    numeric;
ALTER TABLE fin_bills ADD COLUMN IF NOT EXISTS frequency     text NOT NULL DEFAULT 'Monthly';
ALTER TABLE fin_bills ADD COLUMN IF NOT EXISTS category2     text;
ALTER TABLE fin_bills ADD COLUMN IF NOT EXISTS category3     text;
ALTER TABLE fin_bills ADD COLUMN IF NOT EXISTS priority      int;
