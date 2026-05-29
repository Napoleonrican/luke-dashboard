import { Inbox, Fuel, Wallet, Wrench, ListChecks, Mail, Truck, ExternalLink } from 'lucide-react';
import ToolCard from '../components/ToolCard';

const tools = [
  {
    icon: Inbox,
    title: 'Personal Email',
    description: 'Monitor and triage your email threads from a single view. (napoleonrican08@gmail.com)',
    href: 'https://script.google.com/macros/s/AKfycbwvCSxfyFnZkq35C-i6zHuS9ufnQoTMEBxUE0-_tmyGtiifxHyGFnn_JknEKLsbraE/exec',
    accentColor: 'text-emerald-400',
  },
  {
    icon: Fuel,
    title: 'Gas Forecast',
    description: "Track local gas prices and see where they're heading this week.",
    href: 'https://gas-price-forecast.vercel.app',
    accentColor: 'text-orange-400',
  },
  {
    icon: ListChecks,
    title: 'Daily Planner',
    description: 'Connect your Microsoft To Do and let AI help you plan your day.',
    href: 'https://daily-planner-zeta-three.vercel.app/',
    accentColor: 'text-blue-400',
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
    icon: Wrench,
    title: 'Versa Repair',
    description: 'Log jobs, track parts, and manage repair tickets.',
    to: '/versa-repair',
    accentColor: 'text-red-400',
    locked: true,
  },
  {
    icon: Truck,
    title: 'Gig Tracker',
    description: 'Live shift tracker for DoorDash & UberEats.',
    to: '/gig-tracker',
    accentColor: 'text-green-400',
    locked: true,
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

export default function Home() {
  return (
    <div className="min-h-screen px-4 py-16">
      <div className="mx-auto max-w-3xl">
        <header className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Luke's Dashboards &amp; Tools
          </h1>
          <p className="mt-3 text-zinc-400">Personal tools, one click away.</p>
        </header>

        {/* ── KC TRIP SECTION ── */}
        <section className="mb-10 pb-8 border-b border-zinc-800">
          <div className="mb-4">
            <span className="font-mono text-xs tracking-widest uppercase text-amber-600 block mb-1">
              ✈️ Jun 1–6, 2026
            </span>
            <h2 className="text-xl font-semibold text-zinc-100 mb-1">Kansas City Trip</h2>
            <p className="text-sm text-zinc-500">H&R Block HQ work trip + personal time</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <a
              href="/kc-itinerary.html"
              className="flex flex-col gap-4 rounded-xl border border-amber-900/40 bg-amber-950/20 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-700/60 hover:bg-amber-950/30 hover:shadow-lg hover:shadow-black/30"
            >
              <div className="flex items-start justify-between">
                <div className="rounded-lg bg-zinc-800 p-2.5 text-amber-400 text-lg leading-none">🗓️</div>
                <ExternalLink size={14} className="text-zinc-600 transition-colors group-hover:text-zinc-400 mt-1" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">KC Itinerary</h3>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">Full day-by-day schedule — flights, hotels, office days, and personal time (Jun 1–6).</p>
              </div>
            </a>
            <a
              href="/kc-plans.html"
              className="flex flex-col gap-4 rounded-xl border border-amber-900/40 bg-amber-950/20 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-700/60 hover:bg-amber-950/30 hover:shadow-lg hover:shadow-black/30"
            >
              <div className="flex items-start justify-between">
                <div className="rounded-lg bg-zinc-800 p-2.5 text-amber-400 text-lg leading-none">🎒</div>
                <ExternalLink size={14} className="text-zinc-600 transition-colors group-hover:text-zinc-400 mt-1" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">KC Plans</h3>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">Three personal budget options for Thu–Sat: History &amp; Culture (~$167), BBQ &amp; Jazz (~$249), or Budget (~$98).</p>
              </div>
            </a>
          </div>
        </section>
        {/* ── END KC TRIP SECTION ── */}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-10">
          {tools.map((tool) => (
            <ToolCard key={tool.title} {...tool} />
          ))}
        </div>

        <div>
          <div className="mb-4">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Workshop</h2>
            <p className="text-xs text-zinc-600 mt-0.5">Tools in development</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {workshop.map((tool) => (
              <ToolCard key={tool.title} {...tool} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
