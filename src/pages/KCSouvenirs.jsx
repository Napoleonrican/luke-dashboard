import { useState, useEffect } from 'react';
import { ShoppingBag, RotateCcw } from 'lucide-react';
import TopNav from '../components/TopNav';

const PEOPLE = [
  {
    name: 'Eric',
    tag: 'brother',
    items: [
      'Local KC craft beer or small-batch bourbon/whiskey',
      'Regional hot sauce or a BBQ rub sampler',
      'Local jerky or a snack/popcorn mix',
    ],
  },
  {
    name: 'Sasha',
    tag: "Eric's wife",
    items: [
      'Handmade soap or bath bombs',
      'Small potted cactus / succulent (or cactus mug, pin, print)',
      'Jeep / off-road sticker or keychain',
      'Anything fun pizza-themed',
      'Dunkin-adjacent coffee treat',
    ],
  },
  {
    name: 'Ava',
    tag: 'niece · under 6',
    items: [
      'Small plush or wooden toy',
      "Kids' picture book from a local maker",
      'Fun KC-themed tee in her size',
    ],
  },
  {
    name: 'Miranda',
    tag: 'SO · loves to cook',
    items: [
      'Spice blend set or single-origin spices',
      'Local finishing salt or infused oil / vinegar',
      'Handmade cooking tool or ceramic dish',
    ],
  },
  {
    name: 'Mom',
    tag: 'loves puzzles',
    items: [
      'Wooden or artisan jigsaw puzzle',
      'Brain-teaser / logic puzzle',
      'KC-skyline jigsaw if you can find one',
    ],
  },
  {
    name: 'Bill',
    tag: 'BBQ · beer · gadgets',
    items: [
      'KC BBQ rub or sauce set',
      'Grilling tool or gadget',
      'Local craft beer or spirits bottle',
    ],
  },
];

const STORAGE_KEY = 'kc_souvenirs_checked';

const TOTAL = PEOPLE.reduce((sum, p) => sum + p.items.length, 0);

function buildInitialChecked() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const init = {};
  PEOPLE.forEach((p) => {
    p.items.forEach((_, i) => {
      init[`${p.name}-${i}`] = false;
    });
  });
  return init;
}

export default function KCSouvenirs() {
  const [checked, setChecked] = useState(buildInitialChecked);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(checked));
    } catch {}
  }, [checked]);

  const found = Object.values(checked).filter(Boolean).length;

  function toggle(key) {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function resetAll() {
    const reset = {};
    Object.keys(checked).forEach((k) => (reset[k] = false));
    setChecked(reset);
  }

  return (
    <div className="min-h-screen text-white">
      <TopNav />

      <div className="mx-auto max-w-2xl px-4 py-10">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <ShoppingBag size={18} className="text-amber-400" />
            </div>
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-widest">
              Kansas City Trip · Souvenirs
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            River Market<br />Souvenir List
          </h1>
          <p className="mt-2 text-sm text-zinc-400 max-w-md">
            What to keep an eye out for at the City Market. Tap items to mark them found.
          </p>
        </header>

        {/* Progress bar */}
        <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-zinc-400">Items found</span>
            <span className="text-sm font-semibold text-amber-400">
              {found} / {TOTAL}
            </span>
          </div>
          <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-amber-500 transition-all duration-300"
              style={{ width: `${(found / TOTAL) * 100}%` }}
            />
          </div>
          {found === TOTAL && (
            <p className="mt-2 text-xs text-amber-400 font-medium">
              All found — great haul!
            </p>
          )}
        </div>

        {/* Person cards */}
        <div className="space-y-3">
          {PEOPLE.map((person) => {
            const personFound = person.items.filter(
              (_, i) => checked[`${person.name}-${i}`]
            ).length;
            return (
              <div
                key={person.name}
                className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden"
              >
                {/* Card header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/60">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-base font-semibold text-white">
                      {person.name}
                    </h2>
                    <span className="text-xs text-amber-500/80 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                      {person.tag}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-500">
                    {personFound}/{person.items.length}
                  </span>
                </div>

                {/* Items */}
                <ul>
                  {person.items.map((item, i) => {
                    const key = `${person.name}-${i}`;
                    const done = !!checked[key];
                    return (
                      <li
                        key={key}
                        onClick={() => toggle(key)}
                        className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-zinc-800/40 last:border-b-0 ${
                          done
                            ? 'bg-zinc-800/30'
                            : 'hover:bg-zinc-800/40'
                        }`}
                      >
                        {/* Checkbox */}
                        <span
                          className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                            done
                              ? 'bg-amber-500 border-amber-500'
                              : 'border-zinc-600 hover:border-amber-500/60'
                          }`}
                        >
                          {done && (
                            <svg
                              width="11"
                              height="9"
                              viewBox="0 0 11 9"
                              fill="none"
                            >
                              <path
                                d="M1 4L4 7.5L10 1"
                                stroke="white"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </span>
                        <span
                          className={`text-sm transition-colors ${
                            done
                              ? 'line-through text-zinc-600'
                              : 'text-zinc-300'
                          }`}
                        >
                          {item}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Footer / Reset */}
        <div className="mt-8 flex justify-center">
          <button
            onClick={resetAll}
            className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 hover:border-zinc-600 px-4 py-2 rounded-full transition-colors"
          >
            <RotateCcw size={12} />
            Reset list
          </button>
        </div>
      </div>
    </div>
  );
}
