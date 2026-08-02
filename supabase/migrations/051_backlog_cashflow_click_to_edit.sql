-- ─────────────────────────────────────────────────────────────────────────────
-- 051 — Backlog: bring the Vehicle module's "click name to open modal" UX to
-- the Cashflow tables (Bills, Debts, Subscriptions, etc.)
-- ─────────────────────────────────────────────────────────────────────────────
-- Requested while reviewing the Vehicle module: Luke liked replacing the
-- separate maximize-icon + inline-rename-box pattern with "click the row's
-- name to open its full editor modal" (done for Upcoming/Service Log/Fuel
-- Log), and wants the same treatment applied to Cashflow's tables.

INSERT INTO ai_backlog_tasks (section, task_number, task_name, priority, owner, status, notes)
SELECT 'decisions', '2',
  'Cashflow: click row name to open modal, drop the maximize icon',
  'medium', 'luke', 'pending',
  'Applied first on the Vehicle module''s Upcoming/Service Log/Fuel Log tabs — clicking a row''s name/date opens its full-row modal directly instead of a separate maximize icon plus click-to-rename inline box. Luke asked for the same pattern on Bills, Debts, Subscriptions, and any other Cashflow table using that combo.'
WHERE NOT EXISTS (
  SELECT 1 FROM ai_backlog_tasks WHERE section = 'decisions' AND task_name = 'Cashflow: click row name to open modal, drop the maximize icon'
);
