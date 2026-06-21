import { useState, useEffect } from 'react';
import {
  Plus, ChevronDown, ChevronUp, X, Check,
  Bot, Users, User, CheckCircle2, ListTodo
} from 'lucide-react';
import TopNav from '../components/TopNav';
import { supabase } from '../lib/supabase';

const SECTIONS = [
  { id: 'active_queue', label: 'Active Queue',                       short: 'Active Queue' },
  { id: 'research',     label: 'Research & Analysis',                 short: 'Research' },
  { id: 'writing',      label: 'Writing & Drafts',                    short: 'Writing' },
  { id: 'decisions',    label: 'Decisions & Thinking',                short: 'Decisions' },
  { id: 'gig_tracker',  label: 'Gig Tracker — Business & Strategy',   short: 'Gig Tracker' },
];

const PRIORITY_MAP = {
  high:   { label: '🔴 Do soon',             dot: 'bg-red-500',    badge: 'bg-red-900/40 text-red-300' },
  medium: { label: '🟡 When you get to it',  dot: 'bg-yellow-500', badge: 'bg-yellow-900/40 text-yellow-300' },
  low:    { label: '🟢 No rush',              dot: 'bg-green-500',  badge: 'bg-green-900/40 text-green-300' },
};

const OWNER_MAP = {
  agent:  { label: '🤖 Agent only',             Icon: Bot,   color: 'text-blue-400' },
  shared: { label: '👥 Agent + Luke reviews',   Icon: Users, color: 'text-purple-400' },
  luke:   { label: '🧑 Luke only',              Icon: User,  color: 'text-orange-400' },
};

const STATUS_MAP = {
  pending:     { label: '⏳ Pending',     badge: 'bg-zinc-700/80 text-zinc-300' },
  in_progress: { label: '🔄 In Progress', badge: 'bg-blue-900/50 text-blue-300' },
  done:        { label: '✅ Done',         badge: 'bg-green-900/50 text-green-300' },
  cancelled:   { label: '❌ Cancelled',    badge: 'bg-zinc-800 text-zinc-500' },
  blocked:     { label: '🔒 Blocked',      badge: 'bg-orange-900/50 text-orange-300' },
};

const PRIORITY_OPTIONS = Object.entries(PRIORITY_MAP).map(([value, d]) => ({ value, ...d }));
const OWNER_OPTIONS    = Object.entries(OWNER_MAP).map(([value, d]) => ({ value, ...d }));
const STATUS_OPTIONS   = Object.entries(STATUS_MAP).map(([value, d]) => ({ value, ...d }));

const SEED_TASKS = [
  {
    id: 'seed-1', section: 'active_queue', task_number: '1',
    task_name: "Build AI Backlog dashboard into Luke's Dashboard",
    priority: 'high', owner: 'agent', status: 'done',
    notes: 'All of the same features for the AI_BACKLOG.md file built into a dashboard with clickable features, dropdowns, etc.',
    completed_date: '2026-06-09', output_link: null,
  },
  {
    id: 'seed-2', section: 'active_queue', task_number: '2',
    task_name: "Luke's Dashboard Branching Cleanup",
    priority: 'medium', owner: 'agent', status: 'done',
    notes: 'Several branches need reviewing and combining into one. KC trip section should be removed.',
    completed_date: '2026-06-10', output_link: null,
  },
  {
    id: 'seed-3', section: 'decisions', task_number: '1',
    task_name: 'Move the Waterfall workbook into the Financial Workbook',
    priority: 'medium', owner: 'luke', status: 'pending',
    notes: 'Combining these two workbooks removes the need to close the financial workbook before refreshing. First step toward a personal finance agent.',
    completed_date: null, output_link: null,
  },
  {
    id: 'seed-4', section: 'gig_tracker', task_number: '1',
    task_name: 'Complete outstanding Luke Tasks and follow up on the quick-add chips request',
    priority: 'high', owner: 'shared', status: 'pending',
    notes: 'Supabase work needed from Luke. Follow up on quick-add chips ($1, $5, $10 add buttons) that was never implemented.',
    completed_date: null, output_link: null,
  },
];

const BLANK_FORM = { task_name: '', priority: 'medium', owner: 'agent', notes: '', section: 'active_queue' };

export default function AIBacklog() {
  const [tasks, setTasks]                   = useState([]);
  const [loading, setLoading]               = useState(true);
  const [dbAvailable, setDbAvailable]       = useState(false);
  const [expandedNotes, setExpandedNotes]   = useState({});
  const [openStatus, setOpenStatus]         = useState(null);
  const [openPriority, setOpenPriority]     = useState(null);
  const [adding, setAdding]                 = useState(false);
  const [newTask, setNewTask]               = useState(BLANK_FORM);
  const [filterStatus, setFilterStatus]     = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  useEffect(() => { loadTasks(); }, []);

  useEffect(() => {
    if (!openStatus && !openPriority) return;
    function close(e) {
      if (openStatus   && !e.target.closest('[data-status-dropdown]'))   setOpenStatus(null);
      if (openPriority && !e.target.closest('[data-priority-dropdown]')) setOpenPriority(null);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [openStatus, openPriority]);

  async function loadTasks() {
    if (!supabase) { setTasks(SEED_TASKS); setLoading(false); return; }
    try {
      const { data, error } = await supabase
        .from('ai_backlog_tasks')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      setTasks(data?.length ? data : SEED_TASKS);
      setDbAvailable(true);
    } catch {
      setTasks(SEED_TASKS);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(taskId, status) {
    setOpenStatus(null);
    const completedDate = status === 'done' ? new Date().toISOString().split('T')[0] : null;
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status, completed_date: completedDate } : t));
    if (dbAvailable && supabase) {
      await supabase
        .from('ai_backlog_tasks')
        .update({ status, completed_date: completedDate })
        .eq('id', taskId);
    }
  }

  async function updatePriority(taskId, priority) {
    setOpenPriority(null);
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, priority } : t));
    if (dbAvailable && supabase) {
      await supabase
        .from('ai_backlog_tasks')
        .update({ priority })
        .eq('id', taskId);
    }
  }

  async function addTask() {
    if (!newTask.task_name.trim()) return;
    const count = tasks.filter(t => t.section === newTask.section).length;
    const task = {
      id:             `local-${Date.now()}`,
      section:        newTask.section,
      task_number:    String(count + 1),
      task_name:      newTask.task_name.trim(),
      priority:       newTask.priority,
      owner:          newTask.owner,
      status:         'pending',
      notes:          newTask.notes.trim(),
      completed_date: null,
      output_link:    null,
    };
    if (dbAvailable && supabase) {
      const { data } = await supabase
        .from('ai_backlog_tasks')
        .insert({
          section:     task.section,
          task_number: task.task_number,
          task_name:   task.task_name,
          priority:    task.priority,
          owner:       task.owner,
          status:      task.status,
          notes:       task.notes,
        })
        .select()
        .single();
      if (data) task.id = data.id;
    }
    setTasks(prev => [...prev, task]);
    setNewTask(BLANK_FORM);
    setAdding(false);
  }

  async function deleteTask(taskId) {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    if (dbAvailable && supabase) {
      await supabase.from('ai_backlog_tasks').delete().eq('id', taskId);
    }
  }

  const activeTasks    = tasks.filter(t => t.status !== 'done');
  const completedTasks = tasks.filter(t => t.status === 'done');

  const visibleActive = activeTasks.filter(t =>
    (!filterStatus   || t.status   === filterStatus) &&
    (!filterPriority || t.priority === filterPriority)
  );

  const stats = [
    { label: 'Total',       value: tasks.length,                                         color: 'text-zinc-200' },
    { label: 'Pending',     value: tasks.filter(t => t.status === 'pending').length,     color: 'text-zinc-400' },
    { label: 'In Progress', value: tasks.filter(t => t.status === 'in_progress').length, color: 'text-blue-400' },
    { label: 'Done',        value: completedTasks.length,                                color: 'text-green-400' },
  ];

  if (loading) return (
    <div className="min-h-screen text-white">
      <TopNav />
      <div className="flex items-center justify-center py-32 text-zinc-500 text-sm">Loading...</div>
    </div>
  );

  return (
    <div className="min-h-screen text-white">
      <TopNav />
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ListTodo size={18} className="text-violet-400" />
              <h1 className="text-lg font-semibold">AI Sidekick — Backlog</h1>
            </div>
            <p className="text-xs text-zinc-500">
              One task completed per daily run. Add tasks anytime — the Sidekick picks them up overnight.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
            {!dbAvailable && (
              <span className="text-[10px] text-zinc-600 bg-zinc-800 border border-zinc-700 px-2 py-1 rounded">
                local data
              </span>
            )}
            <button
              onClick={() => { setAdding(a => !a); setNewTask(BLANK_FORM); }}
              className="flex items-center gap-1.5 text-xs bg-violet-600 hover:bg-violet-500 text-white rounded px-3 py-1.5 transition-colors"
            >
              <Plus size={13} /> Add Task
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 mb-6">
          {stats.map(s => (
            <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-zinc-600 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Add Task Form */}
        {adding && (
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 mb-4 space-y-2.5">
            <input
              autoFocus
              value={newTask.task_name}
              onChange={e => setNewTask(p => ({ ...p, task_name: e.target.value }))}
              placeholder="Task name..."
              className="w-full bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 placeholder-zinc-600 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500"
              onKeyDown={e => {
                if (e.key === 'Enter')  addTask();
                if (e.key === 'Escape') setAdding(false);
              }}
            />
            <textarea
              value={newTask.notes}
              onChange={e => setNewTask(p => ({ ...p, notes: e.target.value }))}
              placeholder="Notes (optional)..."
              rows={2}
              className="w-full bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 placeholder-zinc-600 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
            />
            <div className="flex gap-2 flex-wrap">
              <select
                value={newTask.section}
                onChange={e => setNewTask(p => ({ ...p, section: e.target.value }))}
                className="flex-1 min-w-[140px] text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-2 py-1.5 focus:outline-none"
              >
                {SECTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <select
                value={newTask.priority}
                onChange={e => setNewTask(p => ({ ...p, priority: e.target.value }))}
                className="flex-1 min-w-[130px] text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-2 py-1.5 focus:outline-none"
              >
                {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              <select
                value={newTask.owner}
                onChange={e => setNewTask(p => ({ ...p, owner: e.target.value }))}
                className="flex-1 min-w-[120px] text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-2 py-1.5 focus:outline-none"
              >
                {OWNER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setAdding(false)}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1"
              >
                Cancel
              </button>
              <button
                onClick={addTask}
                disabled={!newTask.task_name.trim()}
                className="text-xs bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded px-3 py-1 flex items-center gap-1 transition-colors"
              >
                <Check size={11} /> Add
              </button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-2 py-1.5 focus:outline-none"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value)}
            className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-2 py-1.5 focus:outline-none"
          >
            <option value="">All priorities</option>
            {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {(filterStatus || filterPriority) && (
            <button
              onClick={() => { setFilterStatus(''); setFilterPriority(''); }}
              className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors flex items-center gap-1"
            >
              <X size={11} /> Clear
            </button>
          )}
        </div>

        {/* Task List */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-5">
          {visibleActive.length === 0 ? (
            <p className="px-4 py-6 text-xs text-zinc-700 text-center">
              {activeTasks.length === 0
                ? 'No active tasks — add one above.'
                : 'No tasks match the current filter.'}
            </p>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {visibleActive.map(task => {
                const st      = STATUS_MAP[task.status]     || STATUS_MAP.pending;
                const pr      = PRIORITY_MAP[task.priority] || PRIORITY_MAP.medium;
                const ow      = OWNER_MAP[task.owner]       || OWNER_MAP.agent;
                const OwnIcon = ow.Icon;
                const noted   = expandedNotes[task.id];

                return (
                  <div key={task.id} className="px-4 py-2.5 hover:bg-zinc-800/25 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <OwnIcon size={12} className={`flex-shrink-0 ${ow.color}`} />
                      <span className={`text-sm flex-1 min-w-0 truncate ${
                        task.status === 'cancelled' ? 'text-zinc-600 line-through' : 'text-zinc-200'
                      }`}>
                        {task.task_name}
                      </span>
                      {task.notes && (
                        <button
                          onClick={() => setExpandedNotes(p => ({ ...p, [task.id]: !p[task.id] }))}
                          className="text-zinc-700 hover:text-zinc-400 transition-colors flex-shrink-0"
                          title="Toggle notes"
                        >
                          {noted ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                      )}
                      {/* Priority badge — editable */}
                      <div className="relative flex-shrink-0" data-priority-dropdown>
                        <button
                          onClick={() => setOpenPriority(openPriority === task.id ? null : task.id)}
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5 ${pr.badge}`}
                          title={pr.label}
                        >
                          {pr.label.split(' ')[0]}
                          <ChevronDown size={9} className="flex-shrink-0" />
                        </button>
                        {openPriority === task.id && (
                          <div className="absolute right-0 top-full mt-1 z-20 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl min-w-[180px] overflow-hidden">
                            {PRIORITY_OPTIONS.map(p => (
                              <button
                                key={p.value}
                                onClick={() => updatePriority(task.id, p.value)}
                                className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-zinc-700 ${
                                  p.value === task.priority ? 'text-white font-medium' : 'text-zinc-400'
                                }`}
                              >
                                {p.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Status badge — editable */}
                      <div className="relative flex-shrink-0" data-status-dropdown>
                        <button
                          onClick={() => setOpenStatus(openStatus === task.id ? null : task.id)}
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5 ${st.badge}`}
                        >
                          {st.label}
                          <ChevronDown size={9} />
                        </button>
                        {openStatus === task.id && (
                          <div className="absolute right-0 top-full mt-1 z-20 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl min-w-[150px] overflow-hidden">
                            {STATUS_OPTIONS.map(s => (
                              <button
                                key={s.value}
                                onClick={() => updateStatus(task.id, s.value)}
                                className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-zinc-700 ${
                                  s.value === task.status ? 'text-white font-medium' : 'text-zinc-400'
                                }`}
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="text-zinc-700 hover:text-red-400 transition-colors flex-shrink-0"
                        title="Delete task"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    {noted && task.notes && (
                      <div className="mt-2 ml-4 text-xs text-zinc-500 leading-relaxed bg-zinc-800/50 rounded px-2.5 py-2">
                        {task.notes}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Completed */}
        {completedTasks.length > 0 && (
          <div>
            <h2 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-2">Completed</h2>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="divide-y divide-zinc-800/50">
                {completedTasks.map(task => {
                  const ow = OWNER_MAP[task.owner] || OWNER_MAP.agent;
                  const OwnIcon = ow.Icon;
                  return (
                    <div key={task.id} className="flex items-center gap-2.5 px-4 py-2.5">
                      <CheckCircle2 size={12} className="text-green-500 flex-shrink-0" />
                      <OwnIcon size={12} className={`flex-shrink-0 ${ow.color}`} />
                      <span className="text-xs text-zinc-500 line-through flex-1 min-w-0 truncate">
                        {task.task_name}
                      </span>
                      {task.completed_date && (
                        <span className="text-[10px] text-zinc-700 flex-shrink-0">{task.completed_date}</span>
                      )}
                      {task.output_link && (
                        <a
                          href={task.output_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-violet-400 hover:text-violet-300 flex-shrink-0"
                        >
                          Output ↗
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
