import { Link } from 'react-router-dom';
import { Truck, Bot } from 'lucide-react';
import { useHomeData } from './useHomeData';
import { byPlacement, moduleById } from './homeModules';
import DashboardTopRow from '../components/dashboard/DashboardTopRow';
import ClimateRail from '../components/dashboard/ClimateRail';
import LightingRail from '../components/dashboard/LightingRail';
import MissionControlCenter from '../components/dashboard/MissionControlCenter';
import PlannerRail from '../components/dashboard/PlannerRail';
import LauncherTile from '../components/dashboard/LauncherTile';

// The dashboard is organized by how Luke actually uses it, not as a flat link
// grid: live panels for the things he wants constantly in view (Climate rail,
// Mission Control center, Planner rail), action buttons for focus-session tools
// (Gig, Money) in the top row, and compact launchers for everything else.
export default function Home() {
  const data = useHomeData();
  const hasClimate = !!data.climate?.indoorTemp;
  const others = byPlacement('other');

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <DashboardTopRow />

        {/* Slim live strip — only the ephemeral states not already shown in a panel */}
        {(data.gig?.active || data.claude) && (
          <div className="mb-4 flex flex-wrap gap-2">
            {data.gig?.active && (
              <Link to="/gig-tracker" className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-1.5 text-xs">
                <Truck size={14} className="text-green-400" />
                <span className="text-zinc-400">On shift</span>
                <span className="font-semibold tabular-nums text-green-300">${data.gig.earnings.toFixed(2)}</span>
                <span className="text-zinc-500">· {data.gig.orders} orders</span>
              </Link>
            )}
            {data.claude && (
              <Link to="/mission-control" className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-1.5 text-xs">
                <Bot size={14} className="text-amber-400" />
                <span className="text-zinc-500">Claude week</span>
                <span className="font-semibold tabular-nums text-zinc-200">{data.claude.pct.toFixed(0)}% elapsed</span>
              </Link>
            )}
          </div>
        )}

        {/* Three-panel dashboard: left rail · center stage · right rail.
            Stacks to a single column on mobile. */}
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,280px)]">
          {/* Left rail — Climate + Lighting */}
          <div className="space-y-4">
            {hasClimate
              ? <ClimateRail climate={data.climate} outdoor={data.outdoor} />
              : <LauncherTile module={moduleById('climate')} />}
            <LightingRail lighting={data.lighting} />
          </div>

          {/* Center — Mission Control (auth-gated inline) */}
          <MissionControlCenter />

          {/* Right rail — Daily Planner */}
          <PlannerRail />
        </div>

        {/* Everything else — compact launchers, descriptions on hover */}
        {others.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-600">More tools</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {others.map((m) => <LauncherTile key={m.id} module={m} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
