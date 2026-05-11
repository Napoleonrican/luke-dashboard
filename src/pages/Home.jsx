import { Inbox, Fuel, ListChecks, Wallet, Wrench } from 'lucide-react';
import ToolCard from '../components/ToolCard';

const tools = [
  {
    icon: Inbox,
    title: 'Inbox Dashboard',
    description: 'Monitor and triage your email threads from a single view.',
    href: 'https://script.google.com/macros/s/AKfycbwvCSxfyFnZkq35C-i6zHuS9ufnQoTMEBxUE0-_tmyGtiifxHyGFnn_JknEKLsbraE/exec',
    accentColor: 'text-emerald-400',
  },
  {
    icon: Fuel,
    title: 'Gas Forecast',
    description: 'Track local gas prices and see where they\'re heading this week.',
    href: 'https://gas-price-forecast.vercel.app',
    accentColor: 'text-orange-400',
  },
  {
    icon: ListChecks,
    title: 'Task Manager',
    description: 'Capture, prioritize, and knock out your to-do list.',
    to: '/task-manager',
    accentColor: 'text-blue-400',
  },
  {
    icon: Wallet,
    title: 'Debt Payoff Calculator',
    description: 'Model payoff timelines and find the fastest path to zero.',
    to: '/debt-calculator',
    accentColor: 'text-purple-400',
  },
  {
    icon: Wrench,
    title: 'Versa Repair',
    description: 'Log jobs, track parts, and manage repair tickets.',
    to: '/versa-repair',
    accentColor: 'text-red-400',
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-16">
      <div className="mx-auto max-w-3xl">
        <header className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Luke's Dashboard
          </h1>
          <p className="mt-3 text-zinc-400">Personal tools, one click away.</p>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <ToolCard key={tool.title} {...tool} />
          ))}
        </div>
      </div>
    </div>
  );
}
