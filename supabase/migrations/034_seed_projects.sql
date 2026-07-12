-- ─────────────────────────────────────────────────────────────────────────────
-- 034 — Seed Projects with the current real initiatives (2026-07-03)
-- ─────────────────────────────────────────────────────────────────────────────
-- Hand-seeded from a sweep of recently-closed PRs across all repos, so the
-- Projects tab launches populated. The weekly Project Sweep routine takes over
-- maintaining these afterwards. Idempotent: clears its own seeded rows first.
--
-- last_activity_at is spread realistically so the oldest-first sort demonstrates
-- the intended behavior — stalled initiatives (AC agent, Lighting) rise to the
-- top as reminders AND cross the 14-day STALLED_DAYS threshold so their "stalled"
-- badge actually shows on load (16d / 15d, both < the 30d DORMANT cutoff); the
-- freshest (Mission Control) sits at the bottom.
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM mc_projects;

INSERT INTO mc_projects (title, blurb, status, driver, repos, last_done, current, next_step, last_activity_at) VALUES
  ('AC Schedule Agent',
   'The climate/AC scheduling agent — quiet lately and worth a revisit.',
   'paused', 'agents', 'ac-schedule-agent',
   'A handoff doc was written up capturing two goal-follower behavioral issues to fix.',
   'Nothing active — it''s been sitting since the handoff doc, waiting for a session scoped to it.',
   'Spin up a session focused on ac-schedule-agent to work through the two goal-follower issues.',
   now() - interval '16 days'),

  ('Lighting & Wake Alarm',
   'Day-of-week sunrise wake alarm for the LED strip — half shipped, half stuck.',
   'paused', 'luke', 'luke-dashboard, climate-pi',
   'The dashboard half shipped: the day-of-week wake picker saves your selection, and a rapid-tap write bug got fixed.',
   'Blocked on you — the matching Pi scripts (strip_proto.py, schedule_control.py) still need copying to the climate Pi.',
   'Deploy the two scripts to the Pi and restart climate-agent; then the per-day alarm actually fires. (See your Inbox.)',
   now() - interval '15 days'),

  ('Debt Payoff Calculator & Cashflow',
   'The financial module — payoff strategies, cashflow, and the debt calculator.',
   'active', 'collab', 'luke-dashboard',
   'Locked down debt_settings so it''s no longer publicly readable, added an "Export for Claude" snapshot, and fixed the balance-over-time chart axes.',
   'Steady — no open issues right now.',
   'Your call: merge the Waterfall workbook into the Financial Workbook (a decision item in the Backlog).',
   now() - interval '4 days'),

  ('Gig Tracker App',
   'The standalone shift-tracker app — Builder and Reviewer are actively building it.',
   'active', 'agents', 'gig-tracker',
   'Moved Shift Setup into its own "Edit Setup" modal and extended strike-control test coverage (43/43 passing, CI added).',
   'Healthy and building through the Phase 1 backlog on its own.',
   'Next backlog items: quick-add chips ($5/$8/$10) and CSV export.',
   now() - interval '2 days'),

  ('Agent Routine Tuning',
   'Ongoing tuning of the Builder / Reviewer / Sidekick routines themselves.',
   'active', 'agents', 'all repos',
   'Replaced sleep-loop CI polling with webhook-based waits, added context-hygiene rules, and stood up a CI workflow.',
   'Continuous — small reliability and cost improvements as they surface.',
   'Roll proven patterns (webhook CI, context hygiene) across the remaining routines.',
   now() - interval '2 days'),

  ('Mission Control',
   'This command center — the Inbox, Projects, and Backlog you''re looking at.',
   'active', 'collab', 'luke-dashboard, personal-assistant',
   'Shipped the page + the Sidekick routine that feeds it, then verified the token math and removed the tracking experiment.',
   'Reworking this Briefings tab into Projects (what you''re seeing now) and wiring the interaction.',
   'Stand up a weekly Project Sweep routine so this list stays fresh on its own.',
   now() - interval '1 hour');
