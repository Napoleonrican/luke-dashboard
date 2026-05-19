-- Weekly schedule block from Scheduling tab AX3:BG9
-- week_start_date uses Sunday as the start of the week

CREATE TABLE IF NOT EXISTS weekly_schedule (
  week_start_date  date        PRIMARY KEY,
  rows             jsonb       NOT NULL,
  source_label     text,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS (reads allowed by anon; writes require service role)
ALTER TABLE weekly_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_anon_read_weekly_schedule"
  ON weekly_schedule FOR SELECT
  TO anon
  USING (true);

-- Allow authenticated users to upsert (for the paste-schedule UI)
CREATE POLICY "allow_authenticated_upsert_weekly_schedule"
  ON weekly_schedule FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
