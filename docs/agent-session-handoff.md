# Session Handoff — ac-schedule-agent Review

## Context
This document carries over context from a `luke-dashboard` session into a new session
scoped to `Napoleonrican/ac-schedule-agent`. The goal is to review the agent's
decision-making code and address two specific behavioral problems Luke identified.

---

## What ac-schedule-agent is

A Raspberry Pi-based system that drives a GE window AC unit. Two components:

- **Executor ("hands")** — reads `ac_schedule` from Supabase, applies each block's
  `temp_f / mode / fan` at the correct time. Runs on the Pi on a cron/loop.
- **Agent ("brain")** — a daily Claude-driven review that reads sensor history and
  the change log, then decides whether to tune the schedule. Writes decisions back to
  `ac_schedule` and logs reasoning to `ac_change_log`.

The dashboard (`luke-dashboard`) is just the frontend — it shows the schedule,
live sensor tiles, history chart, and the `ac_change_log` audit trail. The Pi is
the thing that actually controls the AC.

---

## The three control layers

| Layer | Name | Behavior |
|---|---|---|
| 1 | Schedule baseline | Executor applies `temp_f / mode / fan` at each block's `time_local`. |
| 2 | Goal-follower | If a block has `goal_room` + `goal_temp_f`, actively drives that room toward the target *within* the block. Escalates: setpoint → fan → mode. |
| 3 | Comfort Mode | Free-text override Luke types on the dashboard. AI interprets it and adjusts AC hourly. Pauses the schedule. |

The `ac_schedule` table in Supabase has these relevant columns:
`id, position, days, time_local, action, temp_f, mode, fan, enabled,
goal_room (bedroom|living_room|null), goal_temp_f (numeric|null)`

---

## Two problems to investigate and fix

### Problem 1 — Agent freezes all schedule decisions while waiting for feedback

**What's happening:** After the agent makes one schedule change, it refuses to touch
*any other* blocks until Luke has confirmed/responded to the previous change. This means
one slow decision per day maximum, and nothing happens while it waits.

**What Luke wants:** The agent should be able to make one decision per day if it
sees a need — and should NOT freeze unrelated blocks just because it's waiting on
feedback about a different block. Changes to completely unrelated time slots should
proceed independently.

**Where to look:** The agent's daily review script — find the logic that checks for
pending/unacknowledged changes and gates further decisions on it. The gate is too broad.

**Suggested fix:** Scope the "wait for feedback" gate to the *same block or same
room* as the pending change, not the entire schedule.

---

### Problem 2 — Goal-follower toggled 23 times in one night chasing the bedroom goal

**What's happening:** The follower is making many small micro-adjustments (23 AC
state changes in one night) instead of escalating deliberately and holding.

**What Luke wants:** The follower should escalate once, hold the change for a
meaningful dwell period, observe whether the room is moving toward the goal, then
escalate further only if it isn't. 2–3 deliberate steps per night, not 23.

**Root cause hypothesis:** The follower is likely checking frequently and
oscillating — nudging the setpoint down, seeing a small temp bounce, nudging back.
It also wasn't using available fan speed or mode headroom to reduce toggles (Luke
confirmed there was headroom on both). This suggests it's reacting per-cycle without
any "hold and observe" logic.

**Where to look:** The goal-follower loop — find the escalation step, the re-check
interval, and any hysteresis/deadband logic (there probably isn't enough of it).

**Suggested fix:**
1. Add a **dwell time** — after making any change, don't act again for N minutes
   (e.g. 15–20 min) to let the room temperature respond.
2. Add a **toggle counter** — if the follower has toggled more than e.g. 3 times
   without the room reaching goal, jump to the next escalation rung (fan → mode)
   rather than keep micro-adjusting setpoint.
3. Add a **deadband** — don't act if the room is within e.g. 0.5°F of the goal
   (avoid hunting around the exact setpoint).

---

## What to do in the new session

1. Read the executor and goal-follower scripts first — understand the current
   check interval, escalation logic, and any "wait for confirmation" gating.
2. Read the agent's daily review script — find where it decides whether to make
   changes and what gates it.
3. Fix Problem 2 (goal-follower oscillation) — add dwell time + toggle counter +
   deadband. This is mechanical and well-scoped.
4. Fix Problem 1 (agent freeze) — narrow the "wait for feedback" gate to same-block
   or same-room changes only.
5. Test / reason through: does the agent feel like it's making one confident decision
   per day and the follower is making 2–3 deliberate escalations per night? That's
   the bar.

---

## Related repos / infrastructure

- **`Napoleonrican/luke-dashboard`** — React frontend + Supabase schema (migrations
  in `supabase/migrations/`). The `ac_change_log` table is the audit trail.
  Recent work (merged PR #23) added temperature + battery alert thresholds and a
  chart Brush to the dashboard — not directly relevant here.
- **Supabase** — shared backend. Tables: `sensors`, `sensor_readings`,
  `sensor_history`, `ac_schedule`, `ac_preferences`, `ac_comfort_mode`,
  `ac_change_log`.
- **Open-Meteo** — outdoor weather (no API key), hardwired to Lisbon Falls, ME
  (`43.9997, -70.0631`).

---

## Luke's overall expectation

The system isn't quite where he wants it yet — the agent is too passive at the
review level and the follower is too reactive at the execution level. The ideal:
**confident, deliberate changes at both levels** — one clean escalation path at
night, one well-reasoned schedule adjustment per morning review, neither blocking
the other.
