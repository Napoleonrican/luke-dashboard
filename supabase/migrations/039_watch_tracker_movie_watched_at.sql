-- ─────────────────────────────────────────────────────────────────────────────
-- 039 — Watch Tracker: movie watched date
-- ─────────────────────────────────────────────────────────────────────────────
-- The export's 'watch' event (see seed-watchtracker.mjs's movie-watched fix)
-- carries a created_at timestamp we never captured — needed for the
-- quick-rate prompt's "you last watched X on ..." copy.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE wt_movies ADD COLUMN IF NOT EXISTS watched_at timestamptz;
