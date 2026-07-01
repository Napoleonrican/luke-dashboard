-- ─────────────────────────────────────────────────────────────────────────────
-- 033 — Routine usage logs
-- ─────────────────────────────────────────────────────────────────────────────
-- Backs the /routine-usage page: real per-run token accounting for the cloud
-- routines (Builders, Reviewers, Sidekick). Each routine, as its final step,
-- reads its OWN Claude Code transcript (~/.claude/projects/**/<session>.jsonl),
-- sums the per-turn `usage` blocks the harness writes, and inserts one row here.
--
-- Why the token fields are split out: the transcript records four distinct
-- token classes and they are NOT billed the same. cache_read_tokens are the
-- cheap ones (a large discount vs. fresh input); folding them into one number
-- would wildly overstate real bucket impact. The page keeps them separate.
--
-- Open RLS (anon read/write) on purpose: every routine already carries the
-- publishable anon key — the gig-tracker Builder/Reviewer don't have the
-- service-role key — so this table stays anon-writable so ALL six can log.
-- Token counts aren't sensitive, so this is a safe trade for universal logging.
-- update_updated_at() is defined in 009_ai_backlog.sql.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_routine_logs (
  id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  routine               text        NOT NULL,          -- 'pa-sidekick', 'pa-builder', 'gt-reviewer', …
  repo                  text,                           -- primary repo it operates on
  model                 text,                           -- e.g. 'claude-opus-4-8'
  run_at                timestamptz NOT NULL DEFAULT now(),
  input_tokens          bigint      NOT NULL DEFAULT 0, -- fresh (uncached) input
  output_tokens         bigint      NOT NULL DEFAULT 0,
  cache_creation_tokens bigint      NOT NULL DEFAULT 0, -- cache writes (near full price)
  cache_read_tokens     bigint      NOT NULL DEFAULT 0, -- cache hits (heavily discounted)
  total_tokens          bigint      NOT NULL DEFAULT 0, -- raw sum of the four above
  turns                 int,                            -- assistant turns in the run
  summary               text,                           -- one-line "what it did this run"
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_routine_logs_routine_run_idx
  ON ai_routine_logs (routine, run_at DESC);

-- RLS — open (anon), same pattern as ai_backlog_tasks, so every routine can log.
ALTER TABLE ai_routine_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access for ai_routine_logs"
  ON ai_routine_logs FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
