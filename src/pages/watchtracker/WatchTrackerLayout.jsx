import { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Tv, Clapperboard, CalendarClock, History as HistoryIcon, BarChart3 } from 'lucide-react';
import TopNav from '../../components/TopNav';
import { getPref, setPref } from '../../lib/watchtracker';

// Mirrors CashflowLayout.jsx's shell exactly — tab bar with subtle per-tab
// accent color, full-bleed main, theme persisted via wt_prefs.
const NAV_ITEMS = [
  { to: 'shows',    label: 'Shows',    icon: Tv,           color: '#ef4444' },
  { to: 'movies',   label: 'Movies',   icon: Clapperboard, color: '#f59e0b' },
  { to: 'upcoming', label: 'Upcoming', icon: CalendarClock, color: '#22c55e' },
  { to: 'history',  label: 'History',  icon: HistoryIcon,  color: '#8b5cf6' },
  { to: 'stats',    label: 'Stats',    icon: BarChart3,    color: '#06b6d4' },
];

const THEME_PREF = 'watch_tracker_theme';

export default function WatchTrackerLayout() {
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    let active = true;
    getPref(THEME_PREF).then(({ data }) => { if (active && (data === 'light' || data === 'dark')) setTheme(data); });
    return () => { active = false; };
  }, []);

  const toggleTheme = () => setTheme((t) => {
    const next = t === 'dark' ? 'light' : 'dark';
    setPref(THEME_PREF, next);
    return next;
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <TopNav
        title="Watch Tracker"
        subtitle="Shows, movies & episode history — imported from TVTime, backed by TMDB"
        right={
          <button
            onClick={toggleTheme}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-200 hover:border-zinc-500"
          >
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        }
      />
      <main className="w-full px-6 pb-12 pt-4">
        <nav aria-label="Watch Tracker sections" className="flex gap-1 overflow-x-auto border-b border-zinc-800 mb-6 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {NAV_ITEMS.map(({ to, label, icon: Icon, color }) => (
            <NavLink
              key={to}
              to={to}
              title={label}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 sm:px-4 py-2.5 text-sm font-medium whitespace-nowrap shrink-0 transition-colors rounded-t-lg border-b-2 -mb-px ${
                  isActive ? 'text-white' : 'text-zinc-400 hover:text-zinc-100'
                }`
              }
              style={({ isActive }) => ({
                backgroundColor: isActive ? `${color}26` : `${color}0d`,
                borderBottomColor: isActive ? color : 'transparent',
              })}
            >
              <Icon size={15} className="shrink-0" style={{ color }} />
              <span className="hidden sm:inline">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="min-h-[75vh]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
