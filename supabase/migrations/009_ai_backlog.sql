-- AI Backlog tasks table — backs the /ai-backlog page in Luke's Dashboard
-- The page falls back to seed data if this migration hasn't been run yet.

CREATE TABLE IF NOT EXISTS ai_backlog_tasks (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  section        text        NOT NULL,
  task_number    text,
  task_name      text        NOT NULL,
  priority       text        NOT NULL DEFAULT 'medium',
  owner          text        NOT NULL DEFAULT 'agent',
  status         text        NOT NULL DEFAULT 'pending',
  notes          text,
  completed_date date,
  output_link    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Seed data mirroring AI_BACKLOG.md as of 2026-06-09
INSERT INTO ai_backlog_tasks (section, task_number, task_name, priority, owner, status, notes, completed_date)
VALUES
  ('active_queue', '1',
   'Build AI Backlog dashboard into Luke''s Dashboard',
   'high', 'agent', 'done',
   'All of the same features for the AI_BACKLOG.md file built into a dashboard with clickable features and dropdowns.',
   '2026-06-09'),
  ('active_queue', '2',
   'Luke''s Dashboard Branching Cleanup',
   'medium', 'agent', 'pending',
   'Several branches need reviewing and combining into one. KC trip section should be removed.',
   NULL),
  ('decisions', '1',
   'Move the Waterfall workbook into the Financial Workbook',
   'medium', 'luke', 'pending',
   'Combining these two workbooks removes the need to close the financial workbook before refreshing. First step toward a personal finance agent.',
   NULL),
  ('gig_tracker', '1',
   'Complete outstanding Luke Tasks and follow up on quick-add chips',
   'high', 'shared', 'pending',
   'Supabase work needed from Luke. Follow up on quick-add chips ($1, $5, $10 add buttons) that was never implemented.',
   NULL);

-- RLS
ALTER TABLE ai_backlog_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access for ai_backlog_tasks"
  ON ai_backlog_tasks FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_backlog_tasks_updated_at
  BEFORE UPDATE ON ai_backlog_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
