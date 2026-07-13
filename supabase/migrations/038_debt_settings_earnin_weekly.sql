-- ─────────────────────────────────────────────────────────────────────────────
-- 038 — Debt Calculator: weekly Earnin reliance (scenario input)
-- ─────────────────────────────────────────────────────────────────────────────
-- The Debt Calculator's DoorDash slider models the gig income needed to hit
-- break-even (cover bill + debt minimums). This adds the weekly Earnin draw you
-- lean on as a *second* target to design out: how much DoorDash it takes to both
-- hit break-even AND replace the recurring Earnin advance, so the calculator can
-- show an "Earnin-free" weekly goal alongside plain break-even.
--
-- Purely a scenario input, persisted like take_home / bills_variable /
-- weekly_gross so it syncs across devices.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS debt_settings ADD COLUMN IF NOT EXISTS earnin_weekly numeric;
