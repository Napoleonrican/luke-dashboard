-- Downsampled history for the dashboard chart.
--
-- sensor_history holds one row per minute per sensor (~20 days = thousands of
-- rows). This Supabase project caps any plain SELECT at 1000 rows, and a 7-day
-- chart at 1-minute resolution would be both truncated and slow to render. This
-- function buckets the history into fixed time intervals and averages each
-- bucket, so a week of data becomes a few hundred points instead of tens of
-- thousands — fast, and comfortably under the row cap.
--
-- Called from the Thermometers page as:
--   supabase.rpc('history_series', { since: <iso>, bucket_seconds: <int> })

CREATE OR REPLACE FUNCTION history_series(since timestamptz, bucket_seconds integer)
RETURNS TABLE (bucket timestamptz, mac text, temp_c numeric, humidity numeric)
LANGUAGE sql
STABLE
AS $$
  SELECT
    date_bin(make_interval(secs => bucket_seconds), ts, timestamptz 'epoch') AS bucket,
    mac,
    round(avg(temp_c)::numeric, 2)   AS temp_c,
    round(avg(humidity)::numeric, 1) AS humidity
  FROM sensor_history
  WHERE ts >= since
  GROUP BY 1, 2
  ORDER BY 1;
$$;

-- Let the dashboard's anon role call it (it only reads, and sensor_history's
-- RLS already permits anon SELECT).
GRANT EXECUTE ON FUNCTION history_series(timestamptz, integer) TO anon, authenticated;
