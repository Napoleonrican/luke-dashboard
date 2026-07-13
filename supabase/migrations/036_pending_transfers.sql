-- ─────────────────────────────────────────────────────────────────────────────
-- 036 — Pending transfers (money in flight, not yet in the account)
-- ─────────────────────────────────────────────────────────────────────────────
-- Money you know is moving into or out of an account but that hasn't landed yet
-- — e.g. a $200 Earnin transfer that'll show in Bill Pay Checking on Monday but
-- isn't available over the weekend, or a payday Uber Pro Card payback going out
-- of Bill Pay. Purely informational: lets the Waterfall show a "projected"
-- balance (current ± pending) so you can see what you'll actually have on a
-- given date. It does NOT change the allocation math — the pour still uses real
-- current balances.
--
--   direction: 'in'  — lands INTO the account (adds to projected)
--              'out' — leaves the account (subtracts from projected)
--
-- account_id cascades: deleting an account clears its pending transfers too.
-- update_updated_at() is defined in 009_ai_backlog.sql.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fin_pending_transfers (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  owner         uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  account_id    uuid        NOT NULL REFERENCES fin_accounts (id) ON DELETE CASCADE,
  direction     text        NOT NULL DEFAULT 'in',   -- 'in' | 'out'
  amount        numeric     NOT NULL DEFAULT 0,
  expected_date date,
  label         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fin_pending_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner select" ON fin_pending_transfers FOR SELECT TO authenticated USING (auth.uid() = owner);
CREATE POLICY "Owner insert" ON fin_pending_transfers FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner);
CREATE POLICY "Owner update" ON fin_pending_transfers FOR UPDATE TO authenticated USING (auth.uid() = owner) WITH CHECK (auth.uid() = owner);
CREATE POLICY "Owner delete" ON fin_pending_transfers FOR DELETE TO authenticated USING (auth.uid() = owner);

CREATE TRIGGER fin_pending_transfers_updated_at BEFORE UPDATE ON fin_pending_transfers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
