# Gig Tracker — Test Plan (PR #26)

Covers the three features ported from the standalone Gig Tracker into the dashboard:
full-screen quick-add order logging, two-button platform selection (UberEats / DoorDash),
and manual / hybrid / auto strike tracking.

## How to run the automated suite

```bash
npm test          # one-shot (vitest run)
npm run test:watch
```

The suite renders the real `GigTracker` page in jsdom and drives it the way a user would
(clicking buttons, typing amounts). Supabase is `null` in the test env, so the component
takes its offline path — no network, fully deterministic against the hardcoded zone
benchmarks.

## Automated coverage

### Order logging — `src/test/GigTracker.test.jsx`
| # | Scenario | Expected |
|---|----------|----------|
| 1 | Open the full-screen logger from "Log Order" | Modal shows title, two platform buttons, amount field, ± chips, OK button |
| 2 | Quick-add chips (`+5` twice, then `−1`) | Amount field reflects running total ($10.00 → $9.00) |
| 3 | Log an order | Modal closes; Total Earnings updates; order appears in the (expanded) log with the right platform badge |
| 4 | Amount of 0 / empty | Nothing is logged |

### Platform selection — `src/test/GigTracker.test.jsx`
| # | Scenario | Expected |
|---|----------|----------|
| 5 | Default platform | UberEats is preselected |
| 6 | Switch to DoorDash and log | Order carries the DoorDash (DD) badge; `gig_tracker_last_platform` = `DoorDash` |
| 7 | Reopen logger | Last-used platform (DoorDash) is preselected |

### Strike tracking — `src/test/GigTracker.test.jsx`
| # | Scenario | Expected |
|---|----------|----------|
| 8 | Default | 3 strike slots; +/− Strike buttons visible (hybrid) |
| 9 | Manual mode + tap "+ Strike" | One slot fills |
| 10 | Threshold → 1 | Strike slots reduce to 1 |
| 11 | Auto mode | Manual +/− Strike buttons hidden |
| 12 | Hybrid auto-clear | Logging an order that pushes EPH past the daily peak clears a strike |
| 13 | Auto auto-add | Logging a low-value order (EPH below zone average) adds a strike |

### SettingsPanel — `src/test/SettingsPanel.test.jsx`
| # | Scenario | Expected |
|---|----------|----------|
| 14 | Mode buttons | Selecting Manual/Hybrid/Auto fires `onStrikeModeChange` and updates the description |
| 15 | Threshold buttons | Selecting 1/2/3 fires `onStrikeThresholdChange` |
| 16 | Break timer | "Take Break" → "End Break" toggles via `onUpdate` |

## Manual / exploratory checks (against the Vercel preview)

These depend on real wall-clock elapsed time or cross-session persistence and are best
eyeballed on the preview deployment:

- **EPH accuracy over a real shift** — start a shift, log a few orders, confirm Current EPH
  and the per-order EPH stamps look right as minutes pass.
- **Crash recovery** — start a shift, log orders, reload the page → "Resume today's shift?"
  restores state from `localStorage`.
- **Strike-mode persistence across sessions** — pick a mode/threshold, reload → choice sticks.
- **Mobile one-handed layout** — verify the full-screen logger and ± chips are thumb-reachable
  at a 390px width.
