-- ─────────────────────────────────────────────────────────────────────────────
-- 038 — Watch Tracker: personal 1-5 ratings
-- ─────────────────────────────────────────────────────────────────────────────
-- Private ratings (not TVTime's social/display stars — this is purely an
-- input signal for the recommendation engine) for shows and movies.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE wt_shows  ADD COLUMN IF NOT EXISTS rating smallint CHECK (rating BETWEEN 1 AND 5);
ALTER TABLE wt_movies ADD COLUMN IF NOT EXISTS rating smallint CHECK (rating BETWEEN 1 AND 5);
