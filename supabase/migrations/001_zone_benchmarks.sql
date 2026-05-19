-- Zone benchmark averages: EPH, trip minutes, miles, and per-order avg
-- Seeded from KPIs tab of 0 - Side Gig Tracking.xlsm
-- Day values: 'Sun','Mon','Tue','Wed','Thu','Fri','Sat'

CREATE TABLE IF NOT EXISTS zone_benchmarks (
  zone          text        NOT NULL,
  day           text        NOT NULL,
  eph           numeric     NOT NULL,
  trip_mins     numeric     NOT NULL,
  miles         numeric     NOT NULL,
  per_order_avg numeric,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (zone, day)
);

-- Enable RLS (reads allowed by anon; writes require service role)
ALTER TABLE zone_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_anon_read_zone_benchmarks"
  ON zone_benchmarks FOR SELECT
  TO anon
  USING (true);
