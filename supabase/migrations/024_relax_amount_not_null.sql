-- ─────────────────────────────────────────────────────────────────────────────
-- 024 — Allow blank amounts on user-editable numeric columns
-- ─────────────────────────────────────────────────────────────────────────────
-- The table UIs send NULL when you clear a numeric cell (a blank field). Several
-- amount columns were NOT NULL, so clearing them returned a 400 from PostgREST
-- ("null value violates not-null constraint"). Since data is entered
-- incrementally — and the workbooks leave figures blank — these should accept
-- NULL. Defaults stay 0 for fresh inserts; reads coalesce NULL→0 in the UI.
--
-- Checkbox/flag columns (pending_withdrawal, active) and identifiers
-- (purchase, name) intentionally stay NOT NULL.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE fin_debts                    ALTER COLUMN balance              DROP NOT NULL;
ALTER TABLE fin_debts                    ALTER COLUMN normal_payment       DROP NOT NULL;
ALTER TABLE fin_bills                    ALTER COLUMN amount               DROP NOT NULL;
ALTER TABLE fin_digital_subscriptions    ALTER COLUMN amount               DROP NOT NULL;
ALTER TABLE fin_consumable_subscriptions ALTER COLUMN cost_per_order       DROP NOT NULL;
ALTER TABLE fin_consumable_subscriptions ALTER COLUMN order_frequency_days DROP NOT NULL;
