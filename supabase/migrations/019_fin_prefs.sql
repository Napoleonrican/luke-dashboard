-- ─────────────────────────────────────────────────────────────────────────────
-- 019 — fin_prefs: per-user UI settings that follow you across devices
-- ─────────────────────────────────────────────────────────────────────────────
-- Small key/value store for financial-module UI preferences (e.g. the Bills
-- table sort). Owner-scoped + RLS like every other fin_* table, so it syncs to
-- whatever device you sign in on without exposing anything publicly.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fin_prefs (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  owner       uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  key         text        NOT NULL,
  value       jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner, key)
);

ALTER TABLE fin_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner select" ON fin_prefs FOR SELECT TO authenticated USING (auth.uid() = owner);
CREATE POLICY "Owner insert" ON fin_prefs FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner);
CREATE POLICY "Owner update" ON fin_prefs FOR UPDATE TO authenticated USING (auth.uid() = owner) WITH CHECK (auth.uid() = owner);
CREATE POLICY "Owner delete" ON fin_prefs FOR DELETE TO authenticated USING (auth.uid() = owner);

CREATE TRIGGER fin_prefs_updated_at BEFORE UPDATE ON fin_prefs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
