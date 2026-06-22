-- ─────────────────────────────────────────────────────────────────────────────
-- 020 — Debts: workbook-faithful columns
-- ─────────────────────────────────────────────────────────────────────────────
-- Brings fin_debts in line with the Debts sheet so the dedicated Debts page can
-- mirror the workbook.
--
--   • updated_on       — the sheet's "Updated" date (manual "last verified").
--   • available_credit — the sheet's "Available Credit" column.
--   • total_due        — the sheet's "Total Due" column.
--   • last_date        — the sheet's "Last Date" column.
--   • new_min          — the sheet's "New Min." column.
--   • pending_withdrawal — was numeric; the sheet uses a checkbox, so convert to
--     boolean (any nonzero seeded value becomes true).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE fin_debts ADD COLUMN IF NOT EXISTS updated_on       date;
ALTER TABLE fin_debts ADD COLUMN IF NOT EXISTS available_credit numeric;
ALTER TABLE fin_debts ADD COLUMN IF NOT EXISTS total_due        numeric;
ALTER TABLE fin_debts ADD COLUMN IF NOT EXISTS last_date        date;
ALTER TABLE fin_debts ADD COLUMN IF NOT EXISTS new_min          numeric;

-- pending_withdrawal: numeric → boolean checkbox flag.
ALTER TABLE fin_debts ALTER COLUMN pending_withdrawal DROP DEFAULT;
ALTER TABLE fin_debts ALTER COLUMN pending_withdrawal TYPE boolean USING (pending_withdrawal <> 0);
ALTER TABLE fin_debts ALTER COLUMN pending_withdrawal SET DEFAULT false;
ALTER TABLE fin_debts ALTER COLUMN pending_withdrawal SET NOT NULL;
