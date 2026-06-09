-- Free-text goals for the AC schedule advisor.
--
-- Luke types his desired outcome / constraints in plain language on the Climate
-- page (e.g. "keep the bedroom 65 at night, I don't care about the living room
-- while I'm at the gym in the evenings"). It's stored on the single preferences
-- row and passed to the advisor alongside the structured data, so Claude can
-- weigh his intent when recommending schedule changes.

ALTER TABLE ac_preferences
  ADD COLUMN IF NOT EXISTS goals_text text;
