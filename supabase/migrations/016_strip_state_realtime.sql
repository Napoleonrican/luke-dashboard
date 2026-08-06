-- Lighting — enable Supabase Realtime broadcasts for strip_state.
--
-- The Pi strip agent (govee-strip-agent) subscribes to changes on this table over
-- a websocket instead of polling every 2s, so it only wakes when the dashboard
-- actually changes the light. Cuts the agent from ~43k REST reads/day to a near-
-- idle websocket plus a slow safety-net poll.
--
-- Adding the table to the supabase_realtime publication is all that's required:
-- the agent re-reads the row over REST on each change event, so the default
-- replica identity (primary key) is sufficient — no REPLICA IDENTITY FULL needed.

ALTER PUBLICATION supabase_realtime ADD TABLE strip_state;
