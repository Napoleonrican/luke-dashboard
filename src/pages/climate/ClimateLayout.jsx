import { NavLink, Outlet } from 'react-router-dom';
import { LayoutGrid, LineChart, CalendarClock, Target, History, Settings as SettingsIcon } from 'lucide-react';
import TopNav from '../../components/TopNav';
import { useClimateData } from './useClimateData';

const NAV_ITEMS = [
  { to: 'overview', label: 'Overview', icon: LayoutGrid },
  { to: 'history', label: 'History', icon: LineChart },
  { to: 'schedule', label: 'Schedule', icon: CalendarClock },
  { to: 'goals', label: 'Goals', icon: Target },
  { to: 'log', label: 'Agent Log', icon: History },
  { to: 'settings', label: 'Settings', icon: SettingsIcon },
];

export default function ClimateLayout() {
  // One shared fetch for every sub-page (passed down via Outlet context).
  const climate = useClimateData();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <TopNav />
      <main className="max-w-6xl mx-auto px-4 pb-12">
        <header className="mt-6 mb-5">
          <h1 className="text-2xl font-bold tracking-tight text-white">Climate</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Govee sensors, AC schedule &amp; the agent that manages the GE AWFS12WW
            {climate.lastRefresh && <span> · updated {climate.lastRefresh.toLocaleTimeString()}</span>}
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-5">
          {/* Left nav (sticky on desktop, horizontal scroll on mobile) */}
          <nav
            aria-label="Climate sections"
            className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible md:sticky md:top-4 self-start pb-1 md:pb-0"
          >
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors border ${
                    isActive
                      ? 'bg-zinc-800 border-zinc-700 text-white'
                      : 'border-transparent text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
                  }`
                }
              >
                <Icon size={15} className="shrink-0" />
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Right detail panel */}
          <div className="min-w-0">
            <Outlet context={climate} />
          </div>
        </div>
      </main>
    </div>
  );
}
