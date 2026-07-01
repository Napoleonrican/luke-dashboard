import { useState, useEffect, useCallback } from 'react';
import { Radar, Inbox, ClipboardList, ListTodo, RefreshCw } from 'lucide-react';
import TopNav from '../components/TopNav';
import { supabase } from '../lib/supabase';
import InboxTab from './mission-control/InboxTab';
import BriefingsTab from './mission-control/BriefingsTab';
import BacklogTab from './mission-control/BacklogTab';

// Mission Control — one command center over the Sidekick's digested layer.
// Inbox (things needing Luke) and Briefings (per-project status) read the
// mc_* tables; Backlog reuses ai_backlog_tasks. GitHub issues remain the raw
// source of truth for the agents; this page is the plain-language front for it.
export default function MissionControl() {
  const [activeTab, setActiveTab]   = useState('inbox');
  const [threads, setThreads]       = useState([]);
  const [messages, setMessages]     = useState([]);
  const [projects, setProjects]     = useState([]);
  const [loading, setLoading]       = useState(!!supabase);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const [{ data: t }, { data: m }, { data: p }] = await Promise.all([
      supabase.from('mc_threads').select('*').order('updated_at', { ascending: false }),
      supabase.from('mc_messages').select('*').order('created_at', { ascending: true }),
      supabase.from('mc_project_status').select('*').order('repo', { ascending: true }),
    ]);
    setThreads(t || []);
    setMessages(m || []);
    setProjects(p || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openThreadCount     = threads.filter(t => t.status !== 'resolved').length;
  const attentionProjects   = projects.filter(p => p.health !== 'green').length;

  const tabs = [
    { key: 'inbox',     label: 'Inbox',     Icon: Inbox,         count: openThreadCount,   accent: 'text-amber-300 border-amber-500',  badge: 'bg-amber-900/50 text-amber-300' },
    { key: 'briefings', label: 'Briefings', Icon: ClipboardList, count: attentionProjects, accent: 'text-cyan-300 border-cyan-500',     badge: 'bg-cyan-900/50 text-cyan-300' },
    { key: 'backlog',   label: 'Backlog',   Icon: ListTodo,      count: 0,                 accent: 'text-violet-300 border-violet-500', badge: 'bg-violet-900/50 text-violet-300' },
  ];

  return (
    <div className="min-h-screen text-white">
      <TopNav />
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Radar size={18} className="text-cyan-400" />
              <h1 className="text-lg font-semibold">Mission Control</h1>
            </div>
            <p className="text-xs text-zinc-500">
              Your Sidekick, watching every project — what changed, what needs you, and what to hand back.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50 mt-0.5 flex-shrink-0"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 border-b border-zinc-800">
          {tabs.map(({ key, label, Icon, count, accent, badge }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
                activeTab === key ? accent : 'text-zinc-600 border-transparent hover:text-zinc-400'
              }`}
            >
              <Icon size={13} />
              {label}
              {count > 0 && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${
                  activeTab === key ? badge : 'bg-zinc-800 text-zinc-600'
                }`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Active tab */}
        {loading ? (
          <div className="text-center py-16 text-zinc-600 text-sm">Loading…</div>
        ) : activeTab === 'inbox' ? (
          <InboxTab threads={threads} messages={messages} reload={load} />
        ) : activeTab === 'briefings' ? (
          <BriefingsTab projects={projects} />
        ) : (
          <BacklogTab />
        )}

      </div>
    </div>
  );
}
