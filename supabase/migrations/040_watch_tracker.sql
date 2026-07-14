-- ─────────────────────────────────────────────────────────────────────────────
-- 040 — Watch Tracker (wt_*)
-- ─────────────────────────────────────────────────────────────────────────────
-- TVTime is shutting down; this recreates its core tracking loop (followed
-- shows, per-episode watch history, movie watchlist, addiction score, lifetime
-- stats) from the user's GDPR export, plus a TMDB metadata cache for posters/
-- episode detail the export itself doesn't contain. Owner-scoped + RLS, same
-- shape as the fin_* tables (see 019_fin_prefs.sql for the reference policy
-- set). update_updated_at() is defined in 009_ai_backlog.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Shows — one row per tracked TVTime show ──────────────────────────────────
CREATE TABLE IF NOT EXISTS wt_shows (
  id                          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  owner                       uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  tvtime_show_id              bigint      NOT NULL,
  series_name                 text        NOT NULL,
  is_followed                 boolean     NOT NULL DEFAULT true,
  is_for_later                boolean     NOT NULL DEFAULT false,
  is_archived                 boolean     NOT NULL DEFAULT false,
  is_favorited                boolean,
  followed_at                 timestamptz,
  ep_watch_count              int,
  last_watched_episode_id     bigint,
  last_watched_season         int,
  last_watched_episode_number int,
  last_watched_at             timestamptz,
  tmdb_id                     int,
  tmdb_match_status           text        NOT NULL DEFAULT 'unmatched', -- unmatched | auto | confirmed | manual
  notes                       text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner, tvtime_show_id)
);

-- ── Episodes — one row per distinct episode watched (rewatches folded in) ────
CREATE TABLE IF NOT EXISTS wt_episodes (
  id                 uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  owner              uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  show_id            uuid        NOT NULL REFERENCES wt_shows (id) ON DELETE CASCADE,
  season_number      int         NOT NULL,
  episode_number     int         NOT NULL,
  tvtime_episode_id  bigint,
  watch_count        int         NOT NULL DEFAULT 1,
  first_watched_at   timestamptz,
  last_watched_at    timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner, show_id, season_number, episode_number)
);

-- ── Movies — followed/watchlisted/watched movies (older export is the only
--    source with movie detail) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wt_movies (
  id                 uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  owner              uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  movie_name         text        NOT NULL,
  is_followed        boolean     NOT NULL DEFAULT false,
  is_for_later       boolean     NOT NULL DEFAULT false,
  rewatch_count      int         NOT NULL DEFAULT 0,
  release_date       date,
  tmdb_id            int,
  tmdb_match_status  text        NOT NULL DEFAULT 'unmatched',
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner, movie_name)
);

-- ── Show addiction scores (direct import of show_addiction_score.csv) ────────
CREATE TABLE IF NOT EXISTS wt_show_scores (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  owner          uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  show_id        uuid        NOT NULL REFERENCES wt_shows (id) ON DELETE CASCADE,
  daily_score    int,
  weekly_score   int,
  monthly_score  int,
  last_action_at timestamptz,
  UNIQUE (owner, show_id)
);

-- ── User-level lifetime stats snapshot (from user_statistics.csv) ───────────
CREATE TABLE IF NOT EXISTS wt_user_stats (
  owner                uuid        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  nb_shows_followed    int,
  nb_episodes_watched  int,
  time_spent_seconds   int,
  score                int,
  nb_friends           int,
  nb_reviews           int,
  nb_comments          int,
  imported_at          timestamptz NOT NULL DEFAULT now()
);

-- ── TMDB metadata cache — shared across owners, keyed by TMDB id ────────────
CREATE TABLE IF NOT EXISTS wt_metadata_cache (
  id                 uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tmdb_id            int         NOT NULL,
  media_type         text        NOT NULL, -- 'tv' | 'movie'
  title              text,
  overview           text,
  poster_path        text,
  backdrop_path      text,
  first_air_date     date,
  release_date       date,
  genres             jsonb,
  number_of_seasons  int,
  number_of_episodes int,
  network            text,
  raw_json           jsonb,
  fetched_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tmdb_id, media_type)
);

-- ── Per-episode TMDB detail cache, fetched lazily per watched season ────────
CREATE TABLE IF NOT EXISTS wt_episode_metadata_cache (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tmdb_id        int         NOT NULL,
  season_number  int         NOT NULL,
  episode_number int         NOT NULL,
  name           text,
  overview       text,
  air_date       date,
  still_path     text,
  fetched_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tmdb_id, season_number, episode_number)
);

-- ── Watch Tracker UI prefs (mirrors fin_prefs, kept decoupled) ──────────────
CREATE TABLE IF NOT EXISTS wt_prefs (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  owner       uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  key         text        NOT NULL,
  value       jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner, key)
);

CREATE INDEX IF NOT EXISTS wt_episodes_show_idx ON wt_episodes (show_id);

-- ── RLS: owner-scoped on personal tables, public-read on the shared caches ──
ALTER TABLE wt_shows                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE wt_episodes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE wt_movies                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE wt_show_scores            ENABLE ROW LEVEL SECURITY;
ALTER TABLE wt_user_stats             ENABLE ROW LEVEL SECURITY;
ALTER TABLE wt_prefs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE wt_metadata_cache         ENABLE ROW LEVEL SECURITY;
ALTER TABLE wt_episode_metadata_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner select" ON wt_shows FOR SELECT TO authenticated USING (auth.uid() = owner);
CREATE POLICY "Owner insert" ON wt_shows FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner);
CREATE POLICY "Owner update" ON wt_shows FOR UPDATE TO authenticated USING (auth.uid() = owner) WITH CHECK (auth.uid() = owner);
CREATE POLICY "Owner delete" ON wt_shows FOR DELETE TO authenticated USING (auth.uid() = owner);

CREATE POLICY "Owner select" ON wt_episodes FOR SELECT TO authenticated USING (auth.uid() = owner);
CREATE POLICY "Owner insert" ON wt_episodes FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner);
CREATE POLICY "Owner update" ON wt_episodes FOR UPDATE TO authenticated USING (auth.uid() = owner) WITH CHECK (auth.uid() = owner);
CREATE POLICY "Owner delete" ON wt_episodes FOR DELETE TO authenticated USING (auth.uid() = owner);

CREATE POLICY "Owner select" ON wt_movies FOR SELECT TO authenticated USING (auth.uid() = owner);
CREATE POLICY "Owner insert" ON wt_movies FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner);
CREATE POLICY "Owner update" ON wt_movies FOR UPDATE TO authenticated USING (auth.uid() = owner) WITH CHECK (auth.uid() = owner);
CREATE POLICY "Owner delete" ON wt_movies FOR DELETE TO authenticated USING (auth.uid() = owner);

CREATE POLICY "Owner select" ON wt_show_scores FOR SELECT TO authenticated USING (auth.uid() = owner);
CREATE POLICY "Owner insert" ON wt_show_scores FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner);
CREATE POLICY "Owner update" ON wt_show_scores FOR UPDATE TO authenticated USING (auth.uid() = owner) WITH CHECK (auth.uid() = owner);
CREATE POLICY "Owner delete" ON wt_show_scores FOR DELETE TO authenticated USING (auth.uid() = owner);

CREATE POLICY "Owner select" ON wt_user_stats FOR SELECT TO authenticated USING (auth.uid() = owner);
CREATE POLICY "Owner insert" ON wt_user_stats FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner);
CREATE POLICY "Owner update" ON wt_user_stats FOR UPDATE TO authenticated USING (auth.uid() = owner) WITH CHECK (auth.uid() = owner);
CREATE POLICY "Owner delete" ON wt_user_stats FOR DELETE TO authenticated USING (auth.uid() = owner);

CREATE POLICY "Owner select" ON wt_prefs FOR SELECT TO authenticated USING (auth.uid() = owner);
CREATE POLICY "Owner insert" ON wt_prefs FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner);
CREATE POLICY "Owner update" ON wt_prefs FOR UPDATE TO authenticated USING (auth.uid() = owner) WITH CHECK (auth.uid() = owner);
CREATE POLICY "Owner delete" ON wt_prefs FOR DELETE TO authenticated USING (auth.uid() = owner);

-- Metadata caches are shared reference data, not personal — any authenticated
-- user of this dashboard may read/write them (single-user dashboard today,
-- same trust level as the mc_* tables).
CREATE POLICY "authenticated_read_wt_metadata_cache"  ON wt_metadata_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_write_wt_metadata_cache" ON wt_metadata_cache FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read_wt_episode_metadata_cache"  ON wt_episode_metadata_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_write_wt_episode_metadata_cache" ON wt_episode_metadata_cache FOR ALL    TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER wt_shows_updated_at   BEFORE UPDATE ON wt_shows   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER wt_episodes_updated_at BEFORE UPDATE ON wt_episodes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER wt_movies_updated_at  BEFORE UPDATE ON wt_movies  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER wt_prefs_updated_at   BEFORE UPDATE ON wt_prefs   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
