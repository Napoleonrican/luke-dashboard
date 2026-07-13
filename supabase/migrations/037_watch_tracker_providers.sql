-- ─────────────────────────────────────────────────────────────────────────────
-- 037 — Watch Tracker: TMDB watch-provider cache
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds a "where to watch" cache to wt_metadata_cache, sourced from TMDB's
-- watch/providers endpoint (real per-region streaming availability) rather
-- than a manual per-episode picker. Kept on the same shared-cache table/RLS
-- policies as 036_watch_tracker.sql — just two more columns.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE wt_metadata_cache ADD COLUMN IF NOT EXISTS watch_providers jsonb;
ALTER TABLE wt_metadata_cache ADD COLUMN IF NOT EXISTS watch_providers_fetched_at timestamptz;
