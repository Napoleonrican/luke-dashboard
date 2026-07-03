-- ─────────────────────────────────────────────────────────────────────────────
-- 033 — Projects (replaces the per-repo Briefings)
-- ─────────────────────────────────────────────────────────────────────────────
-- Reworks the Mission Control "Briefings" tab from one-row-per-repo into
-- PROJECTS: the major initiatives actually being worked on, which don't map 1:1
-- to repos (Mission Control spans two repos; the Gig Tracker app is one repo but
-- many efforts; "agent routine tuning" cuts across all of them).
--
-- Each project reads like an Inbox thread — a title + short blurb, and on expand
-- a little human detail (what was last done, what's in progress, what's next)
-- plus a message thread so Luke can ask a question right on the project. The
-- Sidekick (and a new weekly Project Sweep routine) keep these fresh.
--
-- The list is sorted OLDEST-activity-first on the page, so initiatives that have
-- gone quiet surface to the top as a "you left this half-finished" reminder.
--
-- Also drops ai_routine_logs (the token-tracking experiment) — reverted; the
-- per-turn transcript math confirmed the dashboard numbers were correct, so the
-- standalone tracking page/table isn't needed. IF EXISTS makes this safe whether
-- or not migration 033_routine_logs was ever run.
-- update_updated_at() is defined in 009_ai_backlog.sql.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS ai_routine_logs;

-- ── Projects — the major initiatives in flight ───────────────────────────────
CREATE TABLE IF NOT EXISTS mc_projects (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  title            text        NOT NULL,                     -- plain-language name
  blurb            text,                                     -- one-liner shown collapsed
  status           text        NOT NULL DEFAULT 'active',    -- active | paused | shipped | idea
  driver           text        NOT NULL DEFAULT 'agents',    -- agents | luke | collab (who's moving it)
  repos            text,                                     -- comma list of repos it touches
  last_done        text,                                     -- the last thing that got done
  current          text,                                     -- what's being worked on now
  next_step        text,                                     -- what's next (null = nothing queued)
  last_activity_at timestamptz NOT NULL DEFAULT now(),       -- drives oldest-first sort + staleness
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ── Let mc_messages attach to a project OR a thread (reuse the Inbox chat) ────
ALTER TABLE mc_messages ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES mc_projects (id) ON DELETE CASCADE;
ALTER TABLE mc_messages ALTER COLUMN thread_id DROP NOT NULL;
-- exactly one of thread_id / project_id must be set
ALTER TABLE mc_messages DROP CONSTRAINT IF EXISTS mc_messages_one_parent;
ALTER TABLE mc_messages ADD CONSTRAINT mc_messages_one_parent
  CHECK ((thread_id IS NOT NULL) <> (project_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS mc_messages_project_idx ON mc_messages (project_id, created_at);

-- ── RLS: authenticated-only, matching the rest of the mc_* tables ────────────
ALTER TABLE mc_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read_mc_projects"  ON mc_projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_write_mc_projects" ON mc_projects FOR ALL    TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER mc_projects_updated_at
  BEFORE UPDATE ON mc_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- mc_project_status (the old per-repo Briefings) is now superseded by mc_projects.
-- Left in place (harmless) rather than dropped, in case anything still references it.
