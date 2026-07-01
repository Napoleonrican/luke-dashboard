-- ─────────────────────────────────────────────────────────────────────────────
-- 032 — Seed Mission Control with the current real state (2026-07-01)
-- ─────────────────────────────────────────────────────────────────────────────
-- Hand-seeded snapshot so Mission Control launches populated rather than empty.
-- Once the Sidekick agent routine is live, it takes over maintaining these rows.
-- Safe to re-run: clears its own seeded rows first (idempotent).
-- ─────────────────────────────────────────────────────────────────────────────

-- Reset seeded data (messages cascade from threads).
DELETE FROM mc_threads;
DELETE FROM mc_project_status;

-- ── Briefings: one row per active project ────────────────────────────────────
INSERT INTO mc_project_status (repo, health, headline, whats_changed, open_actions, last_reviewed) VALUES
  ('luke-dashboard', 'green',
   'All clear — no open issues.',
   'Locked down the debt_settings table: it was readable with the public key, now it''s sign-in only (verified live). Financial data is no longer exposed.',
   0, now()),
  ('gig-tracker', 'green',
   'Healthy — 43/43 tests passing, build green.',
   'Two items shipped recently: the Shift Setup moved into an "Edit Setup" modal, and the strike-control test coverage was extended. No open review issues.',
   0, now()),
  ('ac-schedule-agent', 'green',
   'Quiet — no open issues.',
   'Nothing new since the last check-in.',
   0, now()),
  ('personal-assistant', 'attention',
   '1 item needs you — the wake-alarm won''t fire until the Pi scripts are deployed.',
   'The dashboard side of the day-of-week wake picker is live, but the matching scripts on the climate Pi still need deploying.',
   1, now());

-- ── Inbox thread: OPEN — Pi scripts deploy (personal-assistant #69) ──────────
WITH t AS (
  INSERT INTO mc_threads (repo, github_issue, github_url, title, summary, action, category, severity, status)
  VALUES (
    'personal-assistant', 69,
    'https://github.com/napoleonrican/personal-assistant/issues/69',
    'Wake-alarm light won''t fire until you deploy the Pi scripts',
    'The Lighting Schedule''s day-of-week wake picker shipped in two halves. The dashboard half is live and saving your day selection. The other half lives on the climate Pi (strip_proto.py + schedule_control.py) and has to be copied over manually — until then the Pi keeps sending an empty day mask and the sunrise alarm never actually fires.',
    'On your machine, copy the updated strip_proto.py and schedule_control.py to the Pi (scp to luke@climate-pi:/home/luke/climate-agent/), then run: sudo systemctl restart climate-agent. Reply here once done and I''ll close it out.',
    'action', 'normal', 'needs_you'
  )
  RETURNING id
)
INSERT INTO mc_messages (thread_id, author, body, synced)
SELECT id, 'sidekick',
  'Heads up — this one''s been open a little while. It only needs a quick deploy from your machine (I can''t reach the Pi). Once the scripts are over and the service is restarted, the per-day wake alarm will start working. Let me know if you''re not sure where the current script files live and we can track them down.',
  true
FROM t;

-- ── Inbox thread: RESOLVED — debt_settings exposure (shows history) ──────────
WITH t AS (
  INSERT INTO mc_threads (repo, github_issue, github_url, title, summary, action, category, severity, status)
  VALUES (
    'luke-dashboard', 72,
    'https://github.com/napoleonrican/personal-assistant/issues/72',
    'Your income & debt data was publicly readable (now fixed)',
    'The debt_settings table was readable by anyone with the public site key — income, debt balances, lenders, APRs and Affirm loans. The UI sign-in gate looked fine, but the table itself was wide open. This is now locked to signed-in access only and verified.',
    NULL,
    'security', 'urgent', 'resolved'
  )
  RETURNING id
)
INSERT INTO mc_messages (thread_id, author, body, synced)
SELECT id, author, body, true FROM t, (VALUES
  ('sidekick', 'Found a live exposure: debt_settings returns your full financial profile to the public key. I''ve written the fix migration (029) — you''ll need to run it in the Supabase SQL editor since only you can touch the live DB.', 1),
  ('luke',     'Ran the query and merged the PR.', 2),
  ('sidekick', 'Confirmed — re-ran the public-key read and it now returns nothing, matching your other financial tables. Data''s no longer exposed. Closing this out.', 3)
) AS m(author, body, ord)
ORDER BY m.ord;
