import { Link } from 'react-router-dom';
import { Thermometer, Cloud, ArrowRight, History } from 'lucide-react';
import Sparkline from '../Sparkline';

// Source → color for the agent-log line (mirrors Climate's AgentLog view).
const SOURCE_TONE = {
  executor: 'text-cyan-400',
  agent: 'text-violet-400',
  goal_follower: 'text-amber-400',
  comfort_mode: 'text-emerald-400',
  manual: 'text-zinc-400',
};

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// Left-rail Climate panel: the three things Luke opens Climate for kept in
// constant view — living-room temp, current AC setting, and the last agent
// action. Header links into the module. (No quick-toggle for AC control here
// by design — that's a deliberate action, not a dashboard-glance one.)
export default function ClimateRail({ climate, outdoor }) {
  if (!climate?.indoorTemp) return null;
  const comfort = climate.comfortActive;
  const stateLabel = comfort ? 'Comfort Mode' : climate.executorEnabled ? 'Dashboard control' : 'Manual control';

  const s = climate.acSetting;
  const settingLine = s && (s.setpointF != null || s.mode || s.power)
    ? [s.power === false ? 'Off' : null, s.setpointF != null ? `${s.setpointF}°` : null, s.mode, s.fan && `fan ${s.fan}`]
        .filter(Boolean).join(' · ')
    : null;

  return (
    <section className="animate-enter rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
      {/* Header → into the Climate module */}
      <Link to="/climate" className="group mb-3 flex items-center gap-2">
        <Thermometer size={16} className="text-cyan-400" strokeWidth={1.75} />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 group-hover:text-white">Climate</h2>
        {climate.stale
          ? <span className="h-2 w-2 rounded-full bg-amber-400" title="Readings are stale" />
          : <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" title="Live" />}
        <ArrowRight size={13} className="ml-auto text-zinc-600 transition-colors group-hover:text-cyan-400" />
      </Link>

      {/* Living-room temp */}
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold tabular-nums text-white">{climate.indoorTemp}</span>
        <span className="text-xs text-zinc-500">living room</span>
      </div>
      {outdoor && (
        <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
          <Cloud size={13} className="text-sky-400" /> {outdoor} outside
        </p>
      )}
      {climate.spark && <div className="mt-2"><Sparkline values={climate.spark} color="#22d3ee" width={200} height={30} /></div>}

      {/* Current AC setting */}
      <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
        <p className="text-[10px] uppercase tracking-wide text-zinc-500">AC control</p>
        <p className="text-sm font-medium text-zinc-200">{stateLabel}</p>
        {settingLine && <p className="mt-0.5 text-xs tabular-nums text-zinc-400">Set to {settingLine}</p>}
      </div>

      {/* Last agent action */}
      {climate.lastLog && (
        <div className="mt-3 border-t border-zinc-800 pt-3">
          <div className="mb-1 flex items-center gap-1.5">
            <History size={12} className="text-zinc-500" />
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">Last agent action</span>
            <span className="ml-auto text-[10px] text-zinc-600">{timeAgo(climate.lastLog.ts)}</span>
          </div>
          <p className="text-xs leading-snug text-zinc-300">
            <span className={`font-medium ${SOURCE_TONE[climate.lastLog.source] || 'text-zinc-400'}`}>{climate.lastLog.source}</span>
            {' · '}{climate.lastLog.text}
          </p>
          {climate.lastLog.reason && <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-zinc-500">{climate.lastLog.reason}</p>}
        </div>
      )}
    </section>
  );
}
