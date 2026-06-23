-- ─────────────────────────────────────────────────────────────────────────────
-- 023 — Consumable subscriptions: workbook-faithful columns
-- ─────────────────────────────────────────────────────────────────────────────
-- Brings fin_consumable_subscriptions in line with the workbook's Consumables
-- sheet so the dedicated table can mirror it (and the Cost/Type + Cost/Year
-- conditional formatting can be derived).
--
--   • updated_on — the "Updated" date (freshness, like the other tabs).
--   • priority   — the "Priority" column.
--   • store      — the "Store" column (Amazon, SodaStream, …).
--   • count      — the "Count" column (units per order).
--   • unit       — the "Type" column (Pills, Rolls, oz., …).
--
-- Existing columns map as:
--   cost_per_order        ← "Amt." (total cost per order)
--   order_frequency_days  ← "Freq. (Wks)" × 7   (UI edits in weeks)
--   monthly_estimate      ← generated (cost_per_order × 30.44 / days)
-- Derived in the UI: Cost Per Type = Amt. / Count, Cost/Year = Amt. × Orders/Yr.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE fin_consumable_subscriptions ADD COLUMN IF NOT EXISTS updated_on date;
ALTER TABLE fin_consumable_subscriptions ADD COLUMN IF NOT EXISTS priority   int;
ALTER TABLE fin_consumable_subscriptions ADD COLUMN IF NOT EXISTS store      text;
ALTER TABLE fin_consumable_subscriptions ADD COLUMN IF NOT EXISTS count      numeric;
ALTER TABLE fin_consumable_subscriptions ADD COLUMN IF NOT EXISTS unit       text;
