-- ─────────────────────────────────────────────────────────────────────────────
-- 021 — Debts: payments_remaining → numeric
-- ─────────────────────────────────────────────────────────────────────────────
-- The workbook computes "Payments Remaining" as a fractional value
-- (balance ÷ payment, e.g. 31.0055…). The original column was `int`, which
-- rejected the seeded decimal. Widen it to `numeric` so we store the workbook's
-- true value; the UI rounds it for display.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE fin_debts ALTER COLUMN payments_remaining TYPE numeric;
