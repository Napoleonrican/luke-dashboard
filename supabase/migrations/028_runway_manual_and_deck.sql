-- ─────────────────────────────────────────────────────────────────────────────
-- 028 — Runway: ad-hoc manual bills + "On Deck" state
-- ─────────────────────────────────────────────────────────────────────────────
-- The Runway tab shows everything coming due in the next N days, pulled live
-- from fin_bills / fin_debts / fin_digital_subscriptions. Two things it needs
-- that don't belong on those source tables:
--
--   1. fin_runway_manual — ad-hoc / one-off items that don't live on any of the
--      recurring tables (e.g. a Livble rent payment, a manual MaineHealth
--      charge). They flow into the same upcoming list.
--
--   2. fin_runway_deck — which upcoming items have been moved "On Deck" (a
--      staging list of what you're about to pay) and, once triggered, which are
--      "Pending Withdrawal" (waiting to clear the account). This is pure UI
--      state keyed back to the source row, so the source tables stay clean and
--      an item can be un-decked without touching its real data.
--
-- Both are owner-scoped with RLS, like every other fin_* table.
-- update_updated_at() is defined in 009_ai_backlog.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Ad-hoc / manual-entry bills ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fin_runway_manual (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  owner         uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  name          text        NOT NULL DEFAULT 'New item',
  next_due_date date,
  amount        numeric,
  bill_type     text        NOT NULL DEFAULT 'One-Time',  -- Bill | Debt/Loan | One-Time | …
  frequency     text,                                     -- null / 'One-Time' = doesn't recur
  notes         text,
  sort_order    int         NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── On Deck / Pending Withdrawal state (references a source item) ─────────────
CREATE TABLE IF NOT EXISTS fin_runway_deck (
  id                 uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  owner              uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  source_kind        text        NOT NULL,   -- 'bill' | 'debt' | 'digital' | 'manual'
  source_id          uuid        NOT NULL,   -- the id in the corresponding source table
  pending_withdrawal boolean     NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner, source_kind, source_id)
);

-- ── RLS: owner-only, authenticated-only ──────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fin_runway_manual', 'fin_runway_deck'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format($f$
      CREATE POLICY "Owner select" ON %1$I FOR SELECT TO authenticated USING (auth.uid() = owner);
    $f$, t);
    EXECUTE format($f$
      CREATE POLICY "Owner insert" ON %1$I FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner);
    $f$, t);
    EXECUTE format($f$
      CREATE POLICY "Owner update" ON %1$I FOR UPDATE TO authenticated USING (auth.uid() = owner) WITH CHECK (auth.uid() = owner);
    $f$, t);
    EXECUTE format($f$
      CREATE POLICY "Owner delete" ON %1$I FOR DELETE TO authenticated USING (auth.uid() = owner);
    $f$, t);
    EXECUTE format('CREATE TRIGGER %1$I_updated_at BEFORE UPDATE ON %1$I FOR EACH ROW EXECUTE FUNCTION update_updated_at();', t);
  END LOOP;
END $$;
