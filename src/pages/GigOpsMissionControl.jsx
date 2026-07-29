import { useState } from 'react';
import { Compass, ListTodo } from 'lucide-react';
import TopNav from '../components/TopNav';
import MissionTab from './gig-ops/MissionTab';
import DecisionsTab from './gig-ops/DecisionsTab';

// Gig Ops Mission Control — a scoped, non-technical-friendly command center
// for the Gig Tracker project, reached at /gig-ops (direct link only, no
// Home-hub tile). Same "digested Sidekick layer over GitHub issues" idea as
// the general /mission-control page, but filtered to repo = 'gig-tracker'
// (enforced by RLS, see supabase/migrations/047_gig_ops_scope.sql) and
// reachable by the collaborator's own separate Supabase Auth login.
//
// Everything here is hers — the owner-only setup walkthrough lives in
// docs/GIG_OPS_SETUP.md, deliberately not in this UI.
export default function GigOpsMissionControl() {
  const [activeTab, setActiveTab] = useState('mission');

  const tabs = [
    { key: 'mission',   label: 'Mission & Background', Icon: Compass,  accent: 'text-cyan-300 border-cyan-500' },
    { key: 'decisions', label: 'Backlog & Decisions',   Icon: ListTodo, accent: 'text-amber-300 border-amber-500' },
  ];

  return (
    <div className="min-h-screen text-white">
      <TopNav title="Gig Tracker — Mission Control" />
      <div className="max-w-3xl mx-auto px-4 py-8">

        <div className="mb-6">
          <p className="text-xs text-zinc-500">
            What Gig Tracker is, what's happening with it, and anything that needs a decision.
          </p>
        </div>

        <div className="flex gap-1 mb-5 border-b border-zinc-800">
          {tabs.map(({ key, label, Icon, accent }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
                activeTab === key ? accent : 'text-zinc-600 border-transparent hover:text-zinc-400'
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'decisions' ? <DecisionsTab /> : <MissionTab />}

      </div>
    </div>
  );
}
