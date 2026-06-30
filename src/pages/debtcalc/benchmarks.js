// Shared config + helpers for the Debt Payoff Calculator's side-gig benchmarks.
// Kept out of the components so both the calculator and its Settings page agree.

export const DEFAULT_HOURLY_RATE = 25.27;   // flat average $/hr (editable in Settings)

// Slider benchmark presets. Break-even is computed live; the rest derive a
// weekly $ target from hours/week × the hourly rate. Hours defaults mirror the
// old fixed $ presets (161 / 203 / 270 ≈ 6.4 / 8 / 10.7 hrs at $25.27).
export const DEFAULT_BENCHMARKS = [
  { id: 'breakeven', name: 'Break-even', subtext: 'min to cover', color: '#f59e0b', computed: true },
  { id: 'b1', name: 'HRB avg',  subtext: 'all weeks',  color: '#94a3b8', hours: 6.4 },
  { id: 'b2', name: 'HRB avg',  subtext: 'work weeks', color: '#6366f1', hours: 8 },
  { id: 'b3', name: '3 days/wk', subtext: 'Scenario 2', color: '#10b981', hours: 10.7 },
];

// Weekly $ for a non-computed benchmark.
export const benchmarkWeekly = (b, hourlyRate) => Math.round((b.hours || 0) * (hourlyRate || 0));

// Freshness of the "rate last updated" date → a dot color that reddens as it
// approaches 90 days old (green today → red at/after 90d). Returns a hex color.
export function freshnessColor(iso) {
  if (!iso) return '#71717a';                 // unknown → zinc
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y) return '#71717a';
  const then = new Date(y, m - 1, d);
  const days = Math.max(0, Math.round((Date.now() - then.getTime()) / 86400000));
  const t = Math.min(1, days / 90);            // 0 today → 1 at 90d+
  const hue = 120 * (1 - t);                   // 120 green → 0 red
  return `hsl(${hue} 70% 50%)`;
}

export const freshnessLabel = (iso) => {
  if (!iso) return 'not set';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y) return 'not set';
  const days = Math.max(0, Math.round((Date.now() - new Date(y, m - 1, d).getTime()) / 86400000));
  return days === 0 ? 'today' : `${days}d ago`;
};
