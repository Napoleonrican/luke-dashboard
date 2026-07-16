-- Gig Tracker: durable order/shift persistence
--
-- Motivation: order logs previously lived only in localStorage, so navigating
-- away mid-shift (back button, tab close on some devices) could lose the
-- in-progress shift. These tables make the active shift and completed-shift
-- history durable in Supabase so they survive across devices and reloads.
--
-- Single-user personal app: anon read/write, matching the existing
-- weekly_schedule / gig_tracker_prefs policy style.

-- ── Active (in-progress) shift ────────────────────────────────────────────
-- One row (id = 'default') holds the full serialized shift state as JSON.
-- Written (debounced) as the shift progresses; deleted when a shift ends,
-- resets, or a new one starts.
CREATE TABLE IF NOT EXISTS gig_tracker_active_shift (
  id          text        PRIMARY KEY DEFAULT 'default',
  state       jsonb       NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE gig_tracker_active_shift ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_anon_all_gig_active_shift"
  ON gig_tracker_active_shift FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "allow_authenticated_all_gig_active_shift"
  ON gig_tracker_active_shift FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── Completed shift history ───────────────────────────────────────────────
-- One row per finished shift, written by the End Shift routine.
CREATE TABLE IF NOT EXISTS gig_tracker_shift_history (
  id                bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shift_date        date        NOT NULL,
  start_time        text,
  zone              text,
  duration_minutes  integer     NOT NULL DEFAULT 0,
  total_earnings    numeric     NOT NULL DEFAULT 0,
  total_orders      integer     NOT NULL DEFAULT 0,
  eph               numeric     NOT NULL DEFAULT 0,
  order_log         jsonb,
  saved_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gig_shift_history_date
  ON gig_tracker_shift_history (shift_date DESC);

ALTER TABLE gig_tracker_shift_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_anon_all_gig_shift_history"
  ON gig_tracker_shift_history FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "allow_authenticated_all_gig_shift_history"
  ON gig_tracker_shift_history FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
