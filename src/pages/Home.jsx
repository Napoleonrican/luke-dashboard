import { Link } from 'react-router-dom';
import {
  Inbox, Fuel, Wallet, Wrench, ListChecks, Mail, Truck, Thermometer, ListTodo, Lightbulb, Droplets, Bot, Radar, Gauge,
  Thermometer as ThermoChip, Cloud, ListTodo as TaskChip, Truck as GigChip, Lightbulb as LightChip,
} from 'lucide-react';
import ToolCard from '../components/ToolCard';
import ClimateHero from '../components/ClimateHero';
import Sparkline from '../components/Sparkline';
import { useHomeData } from './useHomeData';
import { useCountUp } from '../utils/useCountUp';

// Tools grouped into sections so the page reads as a dashboard, not a flat link
// list. `feature: true` renders a wider tile (for data-rich in-app tools);
// `statKey` maps a tile to its live mini-stat from useHomeData.
const SECTIONS = [
  {
    label: 'Home & Climate',
    items: [
      {
        icon: Thermometer,
        title: 'Climate',
        description: 'Live Govee readings, history, AC schedule & the agent that manages your AC.',
        to: '/climate',
        accentColor: 'text-cyan-400',
        feature: true,
        statKey: 'climate',
      },
      {
        icon: Lightbulb,
        title: 'Lighting',
        description: 'Control your Govee strip light — color, brightness & scenes, over Bluetooth.',
        to: '/lighting',
        accentColor: 'text-fuchsia-400',
        feature: true,
        statKey: 'lighting',
      },
    ],
  },
  {
    label: 'Money',
    items: [
      {
        icon: Truck,
        title: 'Gig Tracker',
        description: 'Live shift tracker for DoorDash & UberEats.',
        to: '/gig-tracker',
        accentColor: 'text-green-400',
        locked: true,
        feature: true,
        statKey: 'gig',
      },
      {
        icon: Wallet,
        title: 'Debt Payoff Calculator',
        description: 'Model payoff timelines and find the fastest path to zero.',
        to: '/debt-calculator',
        accentColor: 'text-purple-400',
        locked: true,
      },
      {
        icon: Droplets,
        title: 'Cashflow Plan',
        description: 'Weekly cash waterfall, daily runway & bills — your workbooks, on the dashboard.',
        to: '/cashflow',
        accentColor: 'text-emerald-400',
        feature: true,
        locked: true,
      },
    ],
  },
  {
    label: 'Productivity',
    items: [
      {
        icon: Radar,
        title: 'Mission Control',
        description: 'Your Sidekick, watching every project — what changed, what needs you, and your backlog, in one place.',
        to: '/mission-control',
        accentColor: 'text-cyan-400',
        feature: true,
        statKey: 'backlog',
      },
      {
        icon: Gauge,
        title: 'Routine Usage',
        description: 'Real token burn per agent, summed from each run — spot heavy routines and plan model or schedule changes.',
        to: '/routine-usage',
        accentColor: 'text-emerald-400',
      },
      {
        icon: Inbox,
        title: 'Personal Email',
        description: 'Monitor and triage your email threads from a single view. (napoleonrican08@gmail.com)',
        href: 'https://script.google.com/macros/s/AKfycbwvCSxfyFnZkq35C-i6zHuS9ufnQoTMEBxUE0-_tmyGtiifxHyGFnn_JknEKLsbraE/exec',
        accentColor: 'text-emerald-400',
      },
      {
        icon: ListChecks,
        title: 'Daily Planner',
        description: 'Connect your Microsoft To Do and let AI help you plan your day.',
        href: 'https://daily-planner-zeta-three.vercel.app/',
        accentColor: 'text-blue-400',
      },
      {
        icon: Fuel,
        title: 'Gas Forecast',
        description: "Track local gas prices and see where they're heading this week.",
        href: 'https://gas-price-forecast.vercel.app',
        accentColor: 'text-orange-400',
      },
    ],
  },
  {
    label: 'Vehicle',
    items: [
      {
        icon: Wrench,
        title: 'Versa Repair',
        description: 'Log jobs, track parts, and manage repair tickets.',
        to: '/versa-repair',
        accentColor: 'text-red-400',
        locked: true,
      },
    ],
  },
];

const workshop = [
  {
    icon: Mail,
    title: 'Professional Email',
    description: 'Inbox digest (lnapoleon14@gmail.com)',
    accentColor: 'text-emerald-400',
    wip: true,
  },
];

// All groups flow into the bento columns (Workshop included).
const GROUPS = [...SECTIONS, { label: 'Workshop', note: 'Tools in development', items: workshop }];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const todayLabel = () =>
  new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

// Resolve a tile's live mini-stat string from the home data slices.
function statFor(key, data) {
  if (key === 'climate' && data.climate) {
    const parts = [];
    if (data.climate.indoorTemp) parts.push(`${data.climate.indoorTemp} indoor`);
    if (data.climate.acState) parts.push(data.climate.acState);
    return parts.join(' · ') || null;
  }
  if (key === 'lighting' && data.lighting) {
    return data.lighting.power
      ? `On · ${data.lighting.label} · ${data.lighting.brightness}%`
      : 'Off';
  }
  if (key === 'backlog' && data.backlog) {
    return `${data.backlog.pending} pending · ${data.backlog.inProgress} in progress`;
  }
  if (key === 'gig' && data.gig?.active) {
    return `On shift · $${data.gig.earnings.toFixed(2)} · ${data.gig.orders} orders`;
  }
  return null;
}

// Counts a number up on mount, then renders it through `format`.
function CountUpValue({ to: target, format }) {
  const v = useCountUp(target);
  return <>{format(v)}</>;
}

function SnapshotChip({ to, icon: Icon, label, value, countTo, format, accent, delay = 0 }) {
  return (
    <Link
      to={to}
      style={{ animationDelay: `${delay}ms` }}
      className="animate-enter flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2 transition-colors hover:border-zinc-600 hover:bg-zinc-800/60"
    >
      <Icon size={15} className={accent} strokeWidth={1.75} />
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-xs font-semibold tabular-nums text-zinc-200">
        {countTo != null ? <CountUpValue to={countTo} format={format} /> : value}
      </span>
    </Link>
  );
}

export default function Home() {
  const data = useHomeData();

  // Proof-of-concept: when live climate data is present, promote it to a hero
  // widget above the grid and drop its launcher tile below to avoid duplication.
  const heroActive = !!data.climate?.indoorTemp;

  const chips = [];
  if (data.climate?.indoorTemp) {
    chips.push({ to: '/climate', icon: ThermoChip, label: 'Indoor', value: data.climate.indoorTemp, accent: 'text-cyan-400' });
  }
  if (data.outdoor) {
    chips.push({ to: '/climate', icon: Cloud, label: 'Outdoor', value: data.outdoor, accent: 'text-sky-400' });
  }
  if (data.backlog) {
    chips.push({
      to: '/mission-control', icon: TaskChip, label: 'Backlog',
      countTo: data.backlog.pending, format: (n) => `${Math.round(n)} pending`,
      accent: 'text-violet-400',
    });
  }
  if (data.gig?.active) {
    chips.push({
      to: '/gig-tracker', icon: GigChip, label: 'Shift',
      countTo: data.gig.earnings, format: (n) => `$${n.toFixed(2)}`,
      accent: 'text-green-400',
    });
  }
  if (data.lighting?.power) {
    chips.push({ to: '/lighting', icon: LightChip, label: 'Strip', value: `${data.lighting.label} · ${data.lighting.brightness}%`, accent: 'text-fuchsia-400' });
  }
  if (data.claude) {
    chips.push({
      to: '/mission-control', icon: Bot, label: 'Claude week',
      countTo: data.claude.pct, format: (n) => `${n.toFixed(0)}% elapsed`,
      accent: 'text-amber-400',
    });
  }

  // Per-tile live extras (sparkline) and status dots.
  const extraFor = (key) =>
    key === 'climate' && data.climate?.spark
      ? <Sparkline values={data.climate.spark} color="#22d3ee" />
      : null;
  const statusFor = (key) => {
    if (key === 'climate' && data.climate?.stale) return { tone: 'stale' };
    if (key === 'gig' && data.gig?.active) return { tone: 'live' };
    if (key === 'lighting' && data.lighting?.power) return { tone: 'live' };
    return null;
  };

  return (
    <div className="min-h-screen px-4 py-16">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Luke's Dashboards &amp; Tools
          </h1>
          <p className="mt-3 text-zinc-400">
            {greeting()} — {todayLabel()}
          </p>
        </header>

        {/* Hero widget POC — renders the Climate module's live content + an
            inline AC control, instead of a plain shortcut card. */}
        {heroActive && <ClimateHero climate={data.climate} outdoor={data.outdoor} />}

        {/* Live snapshot strip — only renders chips that have data */}
        {chips.length > 0 && (
          <div className="mb-10 flex flex-wrap gap-2">
            {chips.map((c, i) => (
              <SnapshotChip key={c.label} {...c} delay={i * 60} />
            ))}
          </div>
        )}

        {/* Bento columns — groups flow side-by-side and pack tightly to cut
            scrolling, while keeping the category labels. 3 cols → 2 → 1. */}
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
          {GROUPS.map((group, gi) => (
            <section
              key={group.label}
              className="mb-4 break-inside-avoid animate-enter"
              style={{ animationDelay: `${120 + gi * 60}ms` }}
            >
              <div className="mb-3">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                  {group.label}
                </h2>
                {group.note && <p className="mt-0.5 text-xs text-zinc-600">{group.note}</p>}
              </div>
              <div className="space-y-3">
                {group.items
                  .filter((tool) => !(heroActive && tool.statKey === 'climate'))
                  .map((tool) => (
                  <ToolCard
                    key={tool.title}
                    {...tool}
                    feature={false}
                    stat={statFor(tool.statKey, data)}
                    statLoading={tool.statKey ? data.loading : false}
                    extra={extraFor(tool.statKey)}
                    status={statusFor(tool.statKey)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
