-- ─────────────────────────────────────────────────────────────────────────────
-- 022 — Subscriptions: workbook-faithful columns + monthly snapshots
-- ─────────────────────────────────────────────────────────────────────────────
-- Brings the subscription tables in line with the workbook so the dedicated
-- Subscriptions page can mirror it, and adds a history table that captures a
-- monthly snapshot on demand (the "track change over time" workflow).
--
--   Digital subs gain the sheet's left-edge columns:
--     • updated_on — the "Update" date (manual "last verified").
--     • priority   — the "Priori" column.
--     • active     — the "Activ" Yes/No flag (only active subs count toward
--                    monthly responsibilities). Defaults true.
--     • category   — the "Category" column (was stuffed into notes).
--
--   Consumable subs gain `category` too, so the by-category spend breakdown can
--   aggregate across both tables dynamically.
--
--   fin_subscription_snapshots stores one row per "Snapshot this month" press:
--   the totals, counts, a by-category map, and the full item set — enough to
--   diff two periods (what was added / dropped) without keeping a live audit log.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE fin_digital_subscriptions ADD COLUMN IF NOT EXISTS updated_on date;
ALTER TABLE fin_digital_subscriptions ADD COLUMN IF NOT EXISTS priority   int;
ALTER TABLE fin_digital_subscriptions ADD COLUMN IF NOT EXISTS active     boolean NOT NULL DEFAULT true;
ALTER TABLE fin_digital_subscriptions ADD COLUMN IF NOT EXISTS category   text;

ALTER TABLE fin_consumable_subscriptions ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE fin_consumable_subscriptions ADD COLUMN IF NOT EXISTS active   boolean NOT NULL DEFAULT true;

-- ── Monthly snapshots (history for period-over-period comparison) ─────────────
CREATE TABLE IF NOT EXISTS fin_subscription_snapshots (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  owner            uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  taken_on         date        NOT NULL DEFAULT current_date,
  label            text,                              -- e.g. "June 2026"
  digital_total    numeric     NOT NULL DEFAULT 0,    -- active digital $/mo
  consumable_total numeric     NOT NULL DEFAULT 0,    -- active consumable $/mo
  digital_count    int         NOT NULL DEFAULT 0,
  consumable_count int         NOT NULL DEFAULT 0,
  by_category      jsonb,                             -- { "Entertainment": 45.2, … }
  items            jsonb,                             -- [{ name, kind, category, monthly }]
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fin_subscription_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner select" ON fin_subscription_snapshots FOR SELECT TO authenticated USING (auth.uid() = owner);
CREATE POLICY "Owner insert" ON fin_subscription_snapshots FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner);
CREATE POLICY "Owner delete" ON fin_subscription_snapshots FOR DELETE TO authenticated USING (auth.uid() = owner);
