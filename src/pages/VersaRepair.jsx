import { useState, useEffect, useRef, useMemo } from 'react';
import TopNav from '../components/TopNav';

const PHASES = [
  {
    id: 'p1',
    number: '01',
    title: 'Get It Legal & Running',
    description: "Make it legal to drive, wake it up, see what we're dealing with",
    tasks: [
      {
        id: 'registration',
        name: 'Renew registration',
        costLo: 100, costHi: 100,
        costDisplay: '$100',
        badges: ['DIY', 'Cash'],
        note: "Do this first — required before driving anywhere. Maine's Rapid Renewal (maine.gov) lets you do it online from home; no inspection sticker needed to register.",
      },
      {
        id: 'battery',
        name: 'Test & replace battery',
        costLo: 0, costHi: 180,
        costDisplay: '$0–180',
        badges: ['DIY', 'Cash'],
        note: "Slow-charge first; replace if it won't hold above 12.4V resting. Lights don't come on currently — likely needs replacement.",
      },
      {
        id: 'oil',
        name: 'Oil change',
        costLo: 30, costHi: 80,
        costDisplay: '$30–80',
        badges: ['DIY', 'Cash'],
        note: 'Cheap insurance after a year of sitting. ~$30 DIY, ~$60–80 at a quick-lube.',
      },
      {
        id: 'tires-storage',
        name: 'Inspect stored tires & current rims',
        costLo: 0, costHi: 0,
        costDisplay: '$0',
        badges: ['DIY', 'Cash'],
        note: 'Check if stored tires are already mounted (potential easy win). Look at bead seats on current rims for pitting vs. surface rust.',
      },
      {
        id: 'inspect',
        name: 'Visual inspection: fluids, belts, rodent damage',
        costLo: 0, costHi: 0,
        costDisplay: '$0',
        badges: ['DIY', 'Cash'],
        note: 'Pop the hood, check cabin air filter for nests, look for chewed wiring, check brake/coolant/power steering fluid levels.',
      },
      {
        id: 'gas',
        name: 'Fresh gas / fuel stabilizer',
        costLo: 5, costHi: 50,
        costDisplay: '$5–50',
        badges: ['DIY', 'Cash'],
        note: 'Year-old ethanol gas is degraded. Top off with fresh fuel or add stabilizer before first start.',
      },
    ],
  },
  {
    id: 'p2',
    number: '02',
    title: 'Diagnose Before Committing',
    description: 'A cheap diagnostic that changes the entire math',
    tasks: [
      {
        id: 'coolant-diag',
        name: 'Coolant leak diagnostic',
        costLo: 53, costHi: 53,
        costDisplay: '$53',
        badges: ['Shop', 'Cash'],
        note: 'Could be a $30 hose clamp or a $1,500 head gasket. Find out before sinking money into the bigger repairs below.',
      },
    ],
  },
  {
    id: 'p3',
    number: '03',
    title: 'Street-Legal Repairs',
    description: 'Items that will fail Maine state inspection',
    tasks: [
      {
        id: 'tie-rods',
        name: 'Tie rod replacement (both sides)',
        costLo: 800, costHi: 800,
        costDisplay: '$800',
        badges: ['Shop', 'Finance'],
        note: 'Always bundle with alignment — never separate these two.',
      },
      {
        id: 'alignment',
        name: 'Wheel alignment',
        costLo: 130, costHi: 130,
        costDisplay: '$130',
        badges: ['Shop', 'Finance'],
        note: 'Mandatory follow-up to tie rod work. Some shops bundle the price.',
      },
      {
        id: 'exhaust',
        name: 'Exhaust repair',
        costLo: 500, costHi: 500,
        costDisplay: '$500',
        badges: ['Shop', 'Finance'],
        note: 'Welding required. Will fail inspection if leaking.',
      },
      {
        id: 'abs',
        name: 'ABS diagnostic & fix',
        costLo: 700, costHi: 700,
        costDisplay: '$700',
        badges: ['Shop', 'Finance'],
        note: 'Required for inspection pass in Maine. ABS warning light is currently active.',
      },
    ],
  },
  {
    id: 'p4',
    number: '04',
    title: 'Final Inspection',
    description: 'The last step — pass inspection and get the sticker',
    tasks: [
      {
        id: 'inspection',
        name: 'Maine state inspection + emissions',
        costLo: 12.5, costHi: 12.5,
        costDisplay: '$12.50',
        badges: ['Shop', 'Cash'],
        note: 'Required annually. Cumberland County includes emissions testing. Many shops bundle the sticker with the repair work in Phase 03.',
      },
    ],
  },
  {
    id: 'p5',
    number: '05',
    title: 'Optimization & Tune-Up',
    description: "Not blocking, but worth doing while you're in deep",
    tasks: [
      {
        id: 'plugs',
        name: 'Spark plug replacement',
        costLo: 30, costHi: 145,
        costDisplay: '$30–145',
        badges: ['DIY', 'Cash'],
        note: '~$30 DIY, ~$145 shop. Versa 1.6L plugs are accessible — good DIY candidate.',
      },
      {
        id: 'tpms',
        name: 'TPMS sensors (replace & program)',
        costLo: 250, costHi: 250,
        costDisplay: '$250',
        badges: ['Shop', 'Cash'],
        note: 'Try to bundle with tire mounting if you change wheels — saves a separate trip.',
      },
    ],
  },
];

const STORAGE_KEY = 'versa_repair_state';

const BADGE_STYLES = {
  diy:     'text-lime-400 border-lime-400/40 bg-lime-400/5',
  cash:    'text-amber-400 border-amber-400/40 bg-amber-400/5',
  finance: 'text-blue-400 border-blue-400/40 bg-blue-400/5',
  shop:    'text-zinc-400 border-zinc-600 bg-zinc-800/50',
};

function fmt(lo, hi) {
  const r = (n) => Math.round(n).toLocaleString();
  if (lo === hi) return `$${r(lo)}`;
  return `$${r(lo)}–${r(hi)}`;
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return null;
}

export default function VersaRepair() {
  const saved = useMemo(loadSaved, []);

  const [done, setDone] = useState(saved?.done ?? {});
  const [notes, setNotes] = useState(saved?.notes ?? '');
  const [saveLabel, setSaveLabel] = useState('Auto-saves as you type');
  const [saveGreen, setSaveGreen] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ done, notes }));
    } catch (_) {}
  }, [done, notes]);

  const allTasks = useMemo(() => PHASES.flatMap((p) => p.tasks), []);
  const totalTasks = allTasks.length;
  const doneTasks = useMemo(() => Object.values(done).filter(Boolean).length, [done]);

  const totalLo = useMemo(() => allTasks.reduce((s, t) => s + t.costLo, 0), [allTasks]);
  const totalHi = useMemo(() => allTasks.reduce((s, t) => s + t.costHi, 0), [allTasks]);
  const remainLo = useMemo(
    () => allTasks.filter((t) => !done[t.id]).reduce((s, t) => s + t.costLo, 0),
    [allTasks, done],
  );
  const remainHi = useMemo(
    () => allTasks.filter((t) => !done[t.id]).reduce((s, t) => s + t.costHi, 0),
    [allTasks, done],
  );

  function toggle(id) {
    setDone((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function handleNotesChange(e) {
    setNotes(e.target.value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSaveLabel('Saved ✓');
      setSaveGreen(true);
      setTimeout(() => {
        setSaveLabel('Auto-saves as you type');
        setSaveGreen(false);
      }, 1500);
    }, 500);
  }

  const stats = [
    { label: 'Total Estimate', value: fmt(totalLo, totalHi),           color: 'text-amber-400' },
    { label: 'Remaining',      value: fmt(remainLo, remainHi),         color: 'text-zinc-100'  },
    { label: 'Tasks Done',     value: `${doneTasks} / ${totalTasks}`,  color: 'text-green-400' },
    { label: 'Phases',         value: String(PHASES.length),           color: 'text-zinc-100'  },
  ];

  return (
    <div
      className="min-h-screen text-zinc-100"
      style={{
        backgroundImage:
          'radial-gradient(circle at 15% 0%, rgba(245,158,11,0.06), transparent 45%), radial-gradient(circle at 85% 100%, rgba(245,158,11,0.03), transparent 45%)',
        backgroundAttachment: 'fixed',
      }}
    >
      <TopNav />
      <div className="max-w-4xl mx-auto px-6 py-10">

        {/* Header */}
        <header className="border-b border-zinc-800 pb-6 mb-7 flex justify-between items-end gap-6 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5 font-mono text-[11px] tracking-[0.22em] text-amber-500 uppercase mb-2.5">
              <span className="w-6 h-px bg-amber-500 inline-block" />
              Vehicle Service Plan
            </div>
            <h1 className="text-[44px] font-bold uppercase tracking-tight leading-[0.95] text-zinc-100">
              2015 Nissan<br />Versa
            </h1>
            <p className="text-zinc-400 text-[13px] mt-2.5 tracking-wide">
              Recommissioning after long-term storage &middot; Portland, ME
            </p>
          </div>
          <div className="font-mono text-[11px] text-zinc-500 tracking-[0.1em] leading-[1.8] text-left sm:text-right">
            <span className="text-zinc-400">STATUS:</span> NON-OPERATIONAL<br />
            <span className="text-zinc-400">DOWNTIME:</span> ~12 MONTHS<br />
            <span className="text-zinc-400">TARGET:</span> ROAD-READY BY AUG
          </div>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-zinc-800 border border-zinc-800 mb-8">
          {stats.map((s) => (
            <div key={s.label} className="bg-zinc-900 px-5 py-[18px]">
              <div className="font-mono text-[10px] tracking-[0.2em] text-zinc-500 uppercase mb-2">
                {s.label}
              </div>
              <div className={`font-bold text-[26px] leading-tight ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Phases */}
        <div className="space-y-6">
          {PHASES.map((phase) => {
            const pLo = phase.tasks.reduce((s, t) => s + t.costLo, 0);
            const pHi = phase.tasks.reduce((s, t) => s + t.costHi, 0);
            const pDone = phase.tasks.filter((t) => done[t.id]).length;

            return (
              <div key={phase.id} className="border border-zinc-800 bg-zinc-900">

                {/* Phase header */}
                <div className="px-5 py-[14px] border-b border-zinc-800 bg-zinc-800/50 flex items-center gap-4 flex-wrap">
                  <span className="font-mono text-amber-500 text-[12px] font-semibold tracking-[0.1em]">
                    PHASE {phase.number}
                  </span>
                  <span className="font-bold text-[19px] uppercase tracking-[0.01em] flex-1 leading-tight">
                    {phase.title}
                  </span>
                  <span className="font-mono text-amber-400 text-[13px] font-medium">
                    {fmt(pLo, pHi)}
                  </span>
                  <span className="font-mono text-[12px] text-zinc-500 italic w-full mt-1">
                    {pDone} of {phase.tasks.length} complete &middot; {phase.description}
                  </span>
                </div>

                {/* Tasks */}
                {phase.tasks.map((task) => {
                  const isDone = !!done[task.id];
                  return (
                    <div
                      key={task.id}
                      className={`grid gap-[18px] px-5 py-4 border-b border-zinc-800 last:border-b-0 hover:bg-zinc-800/30 transition-colors ${isDone ? 'opacity-[0.45]' : ''}`}
                      style={{ gridTemplateColumns: '28px 1fr auto' }}
                    >
                      {/* Checkbox */}
                      <button
                        onClick={() => toggle(task.id)}
                        role="checkbox"
                        aria-checked={isDone}
                        className={`w-5 h-5 mt-0.5 flex-shrink-0 flex items-center justify-center border transition-all ${
                          isDone
                            ? 'bg-green-400 border-green-400'
                            : 'bg-zinc-950 border-zinc-600 hover:border-amber-500'
                        }`}
                      >
                        {isDone && (
                          <span className="text-zinc-950 font-bold text-[13px] leading-none">&#10003;</span>
                        )}
                      </button>

                      {/* Task info */}
                      <div className="min-w-0">
                        <div
                          className={`text-[15px] font-medium mb-1.5 leading-snug ${
                            isDone ? 'line-through text-zinc-500' : 'text-zinc-100'
                          }`}
                        >
                          {task.name}
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          {task.badges.map((b) => {
                            const key = b.toLowerCase();
                            return (
                              <span
                                key={b}
                                className={`font-mono text-[10px] tracking-[0.06em] px-[7px] py-[2px] border uppercase whitespace-nowrap ${BADGE_STYLES[key] ?? BADGE_STYLES.shop}`}
                              >
                                {b}
                              </span>
                            );
                          })}
                        </div>
                        {task.note && (
                          <div className="text-zinc-500 text-[12.5px] leading-relaxed border-l-2 border-zinc-700 pl-2.5 mt-2">
                            {task.note}
                          </div>
                        )}
                      </div>

                      {/* Cost */}
                      <div className="font-mono text-[14px] font-medium text-amber-400 text-right whitespace-nowrap pt-0.5">
                        {task.costDisplay}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Notes */}
        <div className="mt-8 bg-zinc-900 border border-zinc-800 px-6 py-[22px]">
          <h2 className="font-bold text-base uppercase tracking-[0.05em] text-amber-500 mb-3.5">
            Working Notes
          </h2>
          <textarea
            className="w-full min-h-[140px] bg-zinc-950 border border-zinc-800 text-zinc-100 px-3.5 py-3 text-[13.5px] resize-y leading-relaxed focus:outline-none focus:border-amber-500 transition-colors"
            placeholder="Quotes received, decisions made, things to ask the shop, parts ordered..."
            value={notes}
            onChange={handleNotesChange}
          />
          <div
            className={`font-mono text-[10.5px] tracking-[0.05em] mt-2 text-right transition-colors ${
              saveGreen ? 'text-green-400' : 'text-zinc-600'
            }`}
          >
            {saveLabel}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-8 pt-[18px] border-t border-zinc-800 flex justify-between font-mono text-[10px] text-zinc-600 tracking-[0.15em] uppercase flex-wrap gap-2">
          <span>Versa Service Plan &middot; v1</span>
          <span>versa-repair.luke-dashboard</span>
        </footer>

      </div>
    </div>
  );
}
