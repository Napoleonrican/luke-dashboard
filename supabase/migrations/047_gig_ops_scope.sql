-- ─────────────────────────────────────────────────────────────────────────────
-- 047 — Gig Ops scope (collaborator RLS)
-- ─────────────────────────────────────────────────────────────────────────────
-- The Gig Ops collaborator now has her own real Supabase Auth login (separate
-- from Luke's), used only to unlock /gig-ops. Before this migration, every
-- mc_* policy was "any authenticated user, full access" (031_mission_control.sql,
-- 033_projects.sql) — fine when Luke's account was the only one that existed,
-- but not a real boundary now that a second account does. This makes the split
-- real at the database layer instead of relying on the UI's own filtering:
--   • mc_threads / mc_messages: Luke's account sees everything; any other
--     signed-in account only ever sees rows for repo = 'gig-tracker'.
--   • mc_projects: unused by the Gig Ops page (no Projects tab there), so it
--     stays fully restricted to Luke's account.
--
-- The owner check is by email (auth.email()), matching OWNER_EMAIL in
-- src/lib/authConfig.js — keep the two in sync if that email ever changes.
--
-- ⚠️ Run this manually in the Supabase SQL editor. See the "Setup Guide" tab
-- on /gig-ops for the click-by-click walkthrough — do NOT auto-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── mc_threads ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_read_mc_threads"  ON mc_threads;
DROP POLICY IF EXISTS "authenticated_write_mc_threads" ON mc_threads;

CREATE POLICY "scoped_read_mc_threads" ON mc_threads FOR SELECT TO authenticated
  USING (auth.email() = 'napoleonrican08@gmail.com' OR repo = 'gig-tracker');

CREATE POLICY "scoped_write_mc_threads" ON mc_threads FOR ALL TO authenticated
  USING     (auth.email() = 'napoleonrican08@gmail.com' OR repo = 'gig-tracker')
  WITH CHECK (auth.email() = 'napoleonrican08@gmail.com' OR repo = 'gig-tracker');

-- ── mc_messages — scoped through the parent thread's repo. Project-attached
-- messages (project_id set) stay owner-only; Gig Ops has no Projects tab. ──
DROP POLICY IF EXISTS "authenticated_read_mc_messages"  ON mc_messages;
DROP POLICY IF EXISTS "authenticated_write_mc_messages" ON mc_messages;

CREATE POLICY "scoped_read_mc_messages" ON mc_messages FOR SELECT TO authenticated
  USING (
    auth.email() = 'napoleonrican08@gmail.com'
    OR thread_id IN (SELECT id FROM mc_threads WHERE repo = 'gig-tracker')
  );

CREATE POLICY "scoped_write_mc_messages" ON mc_messages FOR ALL TO authenticated
  USING (
    auth.email() = 'napoleonrican08@gmail.com'
    OR thread_id IN (SELECT id FROM mc_threads WHERE repo = 'gig-tracker')
  )
  WITH CHECK (
    auth.email() = 'napoleonrican08@gmail.com'
    OR thread_id IN (SELECT id FROM mc_threads WHERE repo = 'gig-tracker')
  );

-- ── mc_projects — unused by Gig Ops; stays fully Luke-only ──────────────────
DROP POLICY IF EXISTS "authenticated_read_mc_projects"  ON mc_projects;
DROP POLICY IF EXISTS "authenticated_write_mc_projects" ON mc_projects;

CREATE POLICY "owner_read_mc_projects" ON mc_projects FOR SELECT TO authenticated
  USING (auth.email() = 'napoleonrican08@gmail.com');

CREATE POLICY "owner_write_mc_projects" ON mc_projects FOR ALL TO authenticated
  USING     (auth.email() = 'napoleonrican08@gmail.com')
  WITH CHECK (auth.email() = 'napoleonrican08@gmail.com');
