-- Weekly schedule block from Scheduling tab AX3:BG9
-- week_start_date uses Sunday as the start of the week

CREATE TABLE IF NOT EXISTS weekly_schedule (
  week_start_date  date        PRIMARY KEY,
  rows             jsonb       NOT NULL,
  source_label     text,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE weekly_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_anon_read_weekly_schedule"
  ON weekly_schedule FOR SELECT
  TO anon
  USING (true);

-- Allow anon to write (paste-schedule UI runs as anon in this single-user personal app)
CREATE POLICY "allow_anon_write_weekly_schedule"
  ON weekly_schedule FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to upsert as well
CREATE POLICY "allow_authenticated_upsert_weekly_schedule"
  ON weekly_schedule FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
