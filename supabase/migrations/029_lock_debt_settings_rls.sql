-- ─────────────────────────────────────────────────────────────────────────────
-- 029 — Lock debt_settings to authenticated-only
-- ─────────────────────────────────────────────────────────────────────────────
-- debt_settings predates the migration history (created directly in Supabase)
-- and inherited the permissive `anon` policy pattern used by the public
-- climate/lighting tables. Unlike those, it holds the Debt Payoff Calculator's
-- income, bills, debt balances/APRs/lenders, and Affirm loans — data that
-- should never be readable with just the public anon key (see cc-review #72).
--
-- It's a singleton config row (no `owner` column, keyed by a fixed SB_ROW_ID),
-- so this mirrors the authenticated-only pattern from 017_financial_tables.sql
-- without the per-row owner scoping fin_* tables use.
--
-- Safe to run even if some of these policies don't exist / were named
-- differently — DROP IF EXISTS guards each one.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS debt_settings ENABLE ROW LEVEL SECURITY;

-- Drop whatever permissive anon (or otherwise) policies currently exist.
DROP POLICY IF EXISTS "allow_anon_read_debt_settings"    ON debt_settings;
DROP POLICY IF EXISTS "allow_anon_write_debt_settings"   ON debt_settings;
DROP POLICY IF EXISTS "Enable read access for all users" ON debt_settings;
DROP POLICY IF EXISTS "Enable insert for all users"      ON debt_settings;
DROP POLICY IF EXISTS "Enable update for all users"      ON debt_settings;

-- Authenticated-only access, mirroring fin_debts / fin_prefs.
CREATE POLICY "authenticated_read_debt_settings"
  ON debt_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_write_debt_settings"
  ON debt_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
