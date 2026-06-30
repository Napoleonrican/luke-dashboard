-- ─────────────────────────────────────────────────────────────────────────────
-- 025 — Debt Payoff Calculator: side-gig + benchmark settings
-- ─────────────────────────────────────────────────────────────────────────────
-- The calculator's slider benchmarks become user-configurable (Settings page):
--   • hourly_rate          — flat average side-gig earnings per hour.
--   • hourly_rate_updated  — when that rate was last reviewed (freshness dot).
--   • benchmarks           — array of slider presets:
--       [{ id, name, subtext, color, computed?, hours? }]
--     Break-even is computed; the rest derive weekly $ = hours × hourly_rate.
--
-- debt_settings predates the migration history (created directly in Supabase),
-- so guard with IF EXISTS / IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS debt_settings ADD COLUMN IF NOT EXISTS hourly_rate         numeric;
ALTER TABLE IF EXISTS debt_settings ADD COLUMN IF NOT EXISTS hourly_rate_updated text;
ALTER TABLE IF EXISTS debt_settings ADD COLUMN IF NOT EXISTS benchmarks          jsonb;
