import {
  Thermometer, Lightbulb, Radar, ListChecks, Truck, Wallet, Droplets,
  Inbox, Mail, Fuel, Wrench,
} from 'lucide-react';

// Single source of truth for every module on the dashboard. `placement` decides
// how each one surfaces in the layout; the "All modules" launcher lists them all
// regardless, so nothing is ever more than a click or two away.
//
//   action-gig   → the standalone Gig Tracker button (top row)
//   action-money → grouped under the "Money" popover button (top row)
//   rail-left    → Climate + Lighting, custom-rendered in the left rail
//   center       → Mission Control, center stage
//   rail-right   → Daily Planner, right rail
//   other        → smaller launcher tiles below the fold
//
// `to` = in-app route, `href` = external tab.
export const MODULES = [
  {
    id: 'climate', icon: Thermometer, title: 'Climate', to: '/climate',
    accent: 'text-cyan-400', placement: 'rail-left',
    description: 'Live Govee readings, history, AC schedule & the agent that manages your AC.',
  },
  {
    id: 'lighting', icon: Lightbulb, title: 'Lighting', to: '/lighting',
    accent: 'text-fuchsia-400', placement: 'rail-left',
    description: 'Control your Govee strip light — color, brightness & scenes, over Bluetooth.',
  },
  {
    id: 'mission-control', icon: Radar, title: 'Mission Control', to: '/mission-control',
    accent: 'text-cyan-400', placement: 'center', locked: true,
    description: 'Your Sidekick, watching every project — what changed, what needs you, and your backlog.',
  },
  {
    id: 'planner', icon: ListChecks, title: 'Daily Planner',
    href: 'https://daily-planner-zeta-three.vercel.app/',
    accent: 'text-blue-400', placement: 'rail-right',
    description: 'Connect your Microsoft To Do and let AI help you plan your day.',
  },
  {
    id: 'gig', icon: Truck, title: 'Gig Tracker', to: '/gig-tracker',
    accent: 'text-green-400', placement: 'action-gig', locked: true,
    description: 'Live shift tracker for DoorDash & UberEats.',
  },
  {
    id: 'cashflow', icon: Droplets, title: 'Cashflow Plan', to: '/cashflow',
    accent: 'text-emerald-400', placement: 'action-money', locked: true,
    description: 'Weekly cash waterfall, daily runway & bills — your workbooks, on the dashboard.',
  },
  {
    id: 'debt', icon: Wallet, title: 'Debt Payoff Calculator', to: '/debt-calculator',
    accent: 'text-purple-400', placement: 'action-money', locked: true,
    description: 'Model payoff timelines and find the fastest path to zero.',
  },
  {
    id: 'email-personal', icon: Inbox, title: 'Personal Email',
    href: 'https://script.google.com/macros/s/AKfycbwvCSxfyFnZkq35C-i6zHuS9ufnQoTMEBxUE0-_tmyGtiifxHyGFnn_JknEKLsbraE/exec',
    accent: 'text-emerald-400', placement: 'other',
    description: 'Monitor and triage your email threads from a single view. (napoleonrican08@gmail.com)',
  },
  {
    id: 'gas', icon: Fuel, title: 'Gas Forecast',
    href: 'https://gas-price-forecast.vercel.app',
    accent: 'text-orange-400', placement: 'other',
    description: "Track local gas prices and see where they're heading this week.",
  },
  {
    id: 'versa', icon: Wrench, title: 'Versa Repair', to: '/versa-repair',
    accent: 'text-red-400', placement: 'other', locked: true,
    description: 'Log jobs, track parts, and manage repair tickets.',
  },
  {
    id: 'email-pro', icon: Mail, title: 'Professional Email',
    accent: 'text-emerald-400', placement: 'other', wip: true,
    description: 'Inbox digest (lnapoleon14@gmail.com) — in development.',
  },
];

export const byPlacement = (p) => MODULES.filter((m) => m.placement === p);
export const moduleById = (id) => MODULES.find((m) => m.id === id);
