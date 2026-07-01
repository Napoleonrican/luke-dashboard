-- ─────────────────────────────────────────────────────────────────────────────
-- 031 — Mission Control
-- ─────────────────────────────────────────────────────────────────────────────
-- Backs the Mission Control page: a single command center that replaces the
-- raw "GitHub Issues" and "AI Sidekick Backlog" pages. GitHub issues stay the
-- source of truth for the agents; these tables hold the Sidekick's DIGESTED
-- layer — the distilled, plain-language version Luke actually reads and replies
-- to, persisted so it's identical across phone / desktop / web.
--
-- Three sections:
--   • mc_threads  + mc_messages  → Inbox: items needing Luke, email-style threads
--   • mc_project_status          → Briefings: one at-a-glance row per project
--   • (Backlog reuses ai_backlog_tasks — see 009_ai_backlog.sql)
--
-- Security: this is Luke's private ops data, so it follows the authenticated-only
-- pattern (like fin_debts / debt_settings), NOT the public climate-table pattern.
-- Single-user, so access is role-gated rather than owner-scoped.
-- update_updated_at() is defined in 009_ai_backlog.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Inbox threads — a topic the Sidekick raised that may need Luke ───────────
CREATE TABLE IF NOT EXISTS mc_threads (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  repo          text        NOT NULL,                     -- which project
  github_issue  int,                                      -- linked issue number (nullable)
  github_url    text,                                     -- direct link to the raw issue
  title         text        NOT NULL,                     -- plain-language headline
  summary       text,                                     -- short "here's what's going on"
  action        text,                                     -- explicit "what you need to do" (null = FYI)
  category      text        NOT NULL DEFAULT 'attention', -- attention | security | action | fyi
  severity      text        NOT NULL DEFAULT 'normal',    -- urgent | normal | low
  status        text        NOT NULL DEFAULT 'needs_you', -- needs_you | waiting_on_agent | resolved
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Messages — the email-style back-and-forth on a thread ────────────────────
CREATE TABLE IF NOT EXISTS mc_messages (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id   uuid        NOT NULL REFERENCES mc_threads (id) ON DELETE CASCADE,
  author      text        NOT NULL,                       -- 'sidekick' | 'luke'
  body        text        NOT NULL,
  synced      boolean     NOT NULL DEFAULT false,         -- pushed back to GitHub / a worker yet?
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mc_messages_thread_idx ON mc_messages (thread_id, created_at);

-- ── Per-project status — the Briefings tab (one row per project) ─────────────
CREATE TABLE IF NOT EXISTS mc_project_status (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  repo          text        NOT NULL UNIQUE,
  health        text        NOT NULL DEFAULT 'green',     -- green | attention | blocked
  headline      text        NOT NULL,                     -- one-liner
  whats_changed text,                                     -- short digest since last check-in
  open_actions  int         NOT NULL DEFAULT 0,           -- count of open needs-you items
  last_reviewed timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── RLS: authenticated-only, for every table ─────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mc_threads', 'mc_messages', 'mc_project_status'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format($f$
      CREATE POLICY "authenticated_read_%1$s"  ON %1$I FOR SELECT TO authenticated USING (true);
    $f$, t);
    EXECUTE format($f$
      CREATE POLICY "authenticated_write_%1$s" ON %1$I FOR ALL TO authenticated USING (true) WITH CHECK (true);
    $f$, t);
  END LOOP;
END $$;

-- ── updated_at triggers ──────────────────────────────────────────────────────
CREATE TRIGGER mc_threads_updated_at
  BEFORE UPDATE ON mc_threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER mc_project_status_updated_at
  BEFORE UPDATE ON mc_project_status
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
