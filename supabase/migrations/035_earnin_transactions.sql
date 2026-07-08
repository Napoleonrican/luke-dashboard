-- ─────────────────────────────────────────────────────────────────────────────
-- 035 — Earnin transaction log
-- ─────────────────────────────────────────────────────────────────────────────
-- A standalone log of Earnin advances/repayments so usage can be tracked down
-- over time — separate from the Waterfall's single "currently owed" field
-- (fin_prefs key `waterfall_inputs.earninOwed`), which stays a manual figure
-- for now. Once a Monarch export is available, historical transactions can be
-- imported here without touching the Waterfall wiring.
--
-- `kind`: 'advance' (money drawn from Earnin) or 'repay' (paid back, usually
-- same-day as payday). Running balance is derived in the UI (advances add,
-- repayments subtract) rather than stored, so edits/deletes never leave a
-- stale balance behind.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fin_earnin_transactions (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  owner       uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  txn_date    date        NOT NULL DEFAULT current_date,
  kind        text        NOT NULL DEFAULT 'advance',  -- 'advance' | 'repay'
  amount      numeric     NOT NULL DEFAULT 0,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fin_earnin_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner select" ON fin_earnin_transactions FOR SELECT TO authenticated USING (auth.uid() = owner);
CREATE POLICY "Owner insert" ON fin_earnin_transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner);
CREATE POLICY "Owner update" ON fin_earnin_transactions FOR UPDATE TO authenticated USING (auth.uid() = owner) WITH CHECK (auth.uid() = owner);
CREATE POLICY "Owner delete" ON fin_earnin_transactions FOR DELETE TO authenticated USING (auth.uid() = owner);

CREATE TRIGGER fin_earnin_transactions_updated_at BEFORE UPDATE ON fin_earnin_transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
