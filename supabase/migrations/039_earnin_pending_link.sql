-- ─────────────────────────────────────────────────────────────────────────────
-- 039 — Link Earnin transactions to a pending transfer
-- ─────────────────────────────────────────────────────────────────────────────
-- Lets an Earnin advance/repay row be marked "pending" — money in flight that
-- hasn't landed/cleared yet. Checking the box on the Earnin tab creates a real
-- row in fin_pending_transfers (the same table Current Balances already reads
-- for its projected-balance lines), and this column links back to it so the
-- Earnin tab can find, update, or remove that transfer as the row changes.
-- ON DELETE SET NULL: if the transfer is somehow deleted elsewhere, the Earnin
-- row just falls back to "not pending" rather than erroring.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS fin_earnin_transactions
  ADD COLUMN IF NOT EXISTS pending_transfer_id uuid REFERENCES fin_pending_transfers (id) ON DELETE SET NULL;
