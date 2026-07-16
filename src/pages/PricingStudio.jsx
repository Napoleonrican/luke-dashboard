import { useState, useEffect, useCallback } from 'react';

/*
 * Pricing Studio — a standalone decision tool living on the dashboard (public,
 * not behind the auth gate, and not linked from the Home hub). Reached directly
 * at /pricing-studio so Luke can send the URL to family/helpers to collaboratively
 * sort GIG TRACKER features into tiers and pin down pricing. Feeds the Gig Tracker
 * backlog's Open Decisions (tier feature line + pricing model; unblocks 3.7/3.8/6.4)
 * without touching the gig-tracker repo itself.
 *
 * A plan lives entirely in the URL hash (#plan=<base64 json>) — no login, no
 * backend — so each person builds theirs on their phone and sends the link back.
 * The Compare panel lets Luke paste everyone's links to see where they agree.
 */

// ── Feature catalog: ~50 backlog items grouped into plain-language features,
//    each seeded with the tier currently proposed in BACKLOG.md's Tier column.
const CATS = [
  ['core', 'The core loop'],
  ['coaching', 'Coaching & smarts'],
  ['history', 'Accounts & history'],
  ['pro', 'Pro analytics & customization'],
];

const FEATURES = [
  ['eph_live', 'core', 'Live EPH dashboard', 'Real-time $/hr, orders/hr and earnings', 'free'],
  ['order_log', 'core', 'Order logging & quick entry', 'Quick-add chips, +/− entry, voice input', 'free'],
  ['mile_calc', 'core', '$/mile calculator & reference table', 'Judge an offer before you accept it', 'free'],
  ['shift_setup', 'core', 'Shift setup & goals', 'Zones, min and stretch goals', 'free'],
  ['break_timer', 'core', 'Break timer', 'Pause the clock without wrecking your EPH', 'free'],
  ['appearance', 'core', 'Appearance & layouts', 'Dark/light, layout picker, big-number, density', 'free'],
  ['recap', 'core', 'End-of-shift Night Recap', 'A results screen when you clock out', 'free'],
  ['onboarding', 'core', 'Onboarding & in-app guide', 'First-run walkthrough and tips', 'free'],

  ['strikes', 'coaching', 'Smart strike coaching', 'Auto/hybrid nudges, aggressiveness, custom thresholds, alerts', 'sh'],
  ['recommendations', 'coaching', 'Smart order recommendations', 'Accept / decline guidance by dollars and miles', 'sh'],
  ['eph_goal', 'coaching', 'EPH goal tracking', 'Set a target and see it on the dashboard', 'sh'],
  ['per_order_mile', 'coaching', 'Per-order $/mile in the log', 'The ratio shown on every logged order', 'sh'],
  ['drop_alert', 'coaching', 'EPH drop alerts', 'A notification when your rate dips', 'sh'],
  ['multi_app', 'coaching', 'Multi-app earnings breakdown', 'Split earnings across DoorDash, UberEats, etc.', 'sh'],
  ['auto_endshift', 'coaching', 'Auto end-shift detection', 'Prompt to close out after you go idle', 'sh'],

  ['account', 'history', 'Account & sign-in', 'Magic link / Google — sync across devices', 'free'],
  ['history', 'history', 'Shift & order history', 'Last 30/90 days, weekly & monthly summaries', 'sh'],
  ['personalized', 'history', 'Personalized benchmarks', 'Compare against YOUR own averages', 'ft'],

  ['heatmaps', 'pro', 'Zone × day × time heatmaps', 'Where and when you actually earn the most', 'ft'],
  ['predictor', 'pro', '“Should I go out?” predictor', 'Demand & weather insight before you drive', 'ft'],
  ['mileage', 'pro', 'Mileage tracking', 'Manual now, GPS later', 'ft'],
  ['expenses', 'pro', 'Expense tracking', 'Gas, maintenance, phone', 'ft'],
  ['tax', 'pro', 'Tax exports', 'Schedule C-ready, IRS mileage deduction', 'ft'],
  ['custom_zones', 'pro', 'Custom zone definitions', "Draw your own market's zones", 'ft'],
  ['dashboard_custom', 'pro', 'Advanced dashboard customization', 'Show/hide cards, arrange your view', 'ft'],
  ['household', 'pro', 'Household / multi-user mode', 'Share a plan across drivers', 'ft'],
];

const TIER_ORDER = ['free', 'sh', 'ft'];
const TIER = {
  free: {
    name: 'Free', short: 'Free', tag: 'Starter',
    dot: 'bg-zinc-400',
    seg: 'bg-zinc-600 text-zinc-50',
    edgeL: 'border-l-zinc-500', edgeT: 'border-t-zinc-500',
    pill: 'bg-zinc-800 text-zinc-300',
  },
  sh: {
    name: 'Side Hustler', short: 'Side H.', tag: 'Most popular (planned)',
    dot: 'bg-amber-400',
    seg: 'bg-amber-500 text-amber-950',
    edgeL: 'border-l-amber-500', edgeT: 'border-t-amber-500',
    pill: 'bg-amber-950 text-amber-300',
  },
  ft: {
    name: 'Full-Timer', short: 'Full-T.', tag: 'Everything',
    dot: 'bg-emerald-400',
    seg: 'bg-emerald-500 text-emerald-950',
    edgeL: 'border-l-emerald-500', edgeT: 'border-t-emerald-500',
    pill: 'bg-emerald-950 text-emerald-300',
  },
};

const AVG_ORDER = 5; // reframe price in the app's own currency: deliveries

const DEFAULTS = {
  author: '',
  billing: 'monthly',
  assign: Object.fromEntries(FEATURES.map((f) => [f[0], f[4]])),
  prices: {
    sh: { monthly: 4.99, annual: 39, lifetime: 79 },
    ft: { monthly: 9.99, annual: 89, lifetime: 149 },
  },
};

// ── encode / decode a plan to a compact base64 string ────────────────────────
function encodePlan(s) {
  const mini = { a: s.author, b: s.billing, g: s.assign, p: s.prices };
  return btoa(unescape(encodeURIComponent(JSON.stringify(mini))));
}
function decodePlan(str) {
  try {
    const o = JSON.parse(decodeURIComponent(escape(atob(str))));
    const st = structuredClone(DEFAULTS);
    if (o.a != null) st.author = String(o.a);
    if (o.b) st.billing = o.b;
    if (o.g) FEATURES.forEach((f) => { if (o.g[f[0]]) st.assign[f[0]] = o.g[f[0]]; });
    if (o.p) ['sh', 'ft'].forEach((t) => ['monthly', 'annual', 'lifetime'].forEach((m) => {
      if (o.p[t] && o.p[t][m] != null) st.prices[t][m] = Number(o.p[t][m]);
    }));
    return st;
  } catch {
    return null;
  }
}
function readHash() {
  const m = (window.location.hash || '').match(/[#&]plan=([^&\s]+)/);
  return m ? decodePlan(m[1]) : null;
}
function money(n) {
  if (n == null || isNaN(n)) return '0';
  const r = Math.round(n * 100) / 100;
  return r % 1 === 0 ? String(r) : r.toFixed(2);
}

export default function PricingStudio() {
  const [author, setAuthor] = useState('');
  const [billing, setBilling] = useState('monthly');
  const [assign, setAssign] = useState(DEFAULTS.assign);
  const [prices, setPrices] = useState(DEFAULTS.prices);
  const [toast, setToast] = useState('');
  const [cmpInput, setCmpInput] = useState('');
  const [cmpPlans, setCmpPlans] = useState(null);

  // Load any plan encoded in the URL on first mount.
  useEffect(() => {
    const st = readHash();
    if (st) {
      setAuthor(st.author);
      setBilling(st.billing);
      setAssign(st.assign);
      setPrices(st.prices);
    }
  }, []);

  // Keep the URL hash in sync so the current view is always shareable/refresh-safe.
  useEffect(() => {
    const code = encodePlan({ author, billing, assign, prices });
    window.history.replaceState(null, '', `${window.location.pathname}#plan=${code}`);
  }, [author, billing, assign, prices]);

  const flash = useCallback((msg) => {
    setToast(msg);
    window.clearTimeout(flash._t);
    flash._t = window.setTimeout(() => setToast(''), 2100);
  }, []);

  const setTier = (fid, tier) => setAssign((a) => ({ ...a, [fid]: tier }));
  const setPrice = (tier, val) => {
    const v = parseFloat(String(val).replace(/[^0-9.]/g, ''));
    setPrices((p) => ({ ...p, [tier]: { ...p[tier], [billing]: isNaN(v) ? 0 : v } }));
  };

  const priceLabel = (tier) => {
    const val = prices[tier][billing];
    if (billing === 'monthly') return { amt: `$${money(val)}`, per: '/mo', sub: '', orders: orderLine(val, 'mo') };
    if (billing === 'annual') return { amt: `$${money(val)}`, per: '/yr', sub: `$${money(val / 12)}/mo, billed annually`, orders: orderLine(val / 12, 'mo') };
    return { amt: `$${money(val)}`, per: 'once', sub: 'one-time — no subscription', orders: orderLine(val, 'once') };
  };
  function orderLine(amount, unit) {
    const n = Math.max(1, Math.round(amount / AVG_ORDER));
    if (unit === 'once') return `≈ ${n} order${n === 1 ? '' : 's'}, then it's yours`;
    return `≈ ${n} order${n === 1 ? '' : 's'} a month`;
  }

  const copy = (text, msg) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => flash(msg), () => fallbackCopy(text, msg));
    } else {
      fallbackCopy(text, msg);
    }
  };
  const fallbackCopy = (text, msg) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.className = 'fixed opacity-0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); flash(msg); } catch { flash('Press ⌘/Ctrl+C to copy'); }
    document.body.removeChild(ta);
  };

  const shareLink = () => `${window.location.origin}${window.location.pathname}#plan=${encodePlan({ author, billing, assign, prices })}`;

  const textSummary = () => {
    const lines = [`GIG TRACKER — PRICING PLAN${author ? ` (by ${author})` : ''}`, `Billing: ${billing}`];
    TIER_ORDER.forEach((tier) => {
      const feats = FEATURES.filter((f) => assign[f[0]] === tier);
      let head = TIER[tier].name;
      head += tier === 'free'
        ? ' — $0'
        : ` — $${money(prices[tier][billing])}${billing === 'lifetime' ? ' once' : billing === 'annual' ? '/yr' : '/mo'}`;
      lines.push('', `${head}  (${feats.length})`);
      feats.forEach((f) => lines.push(`  - ${f[2]}`));
    });
    return lines.join('\n');
  };

  const runCompare = () => {
    const plans = cmpInput.split(/\s*\n\s*/).map((s) => s.trim()).filter(Boolean).map((line) => {
      const m = line.match(/[#&]plan=([^&\s]+)/);
      return decodePlan(m ? m[1] : line);
    }).filter(Boolean);
    plans.unshift({ author: author || 'You', assign }); // include the current plan
    setCmpPlans(plans);
  };

  const reset = () => {
    setBilling('monthly');
    setAssign(DEFAULTS.assign);
    setPrices(structuredClone(DEFAULTS.prices));
    flash("Reset to Luke's starting proposal");
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-5">

        {/* header */}
        <header className="flex items-start gap-3">
          <div className="mt-0.5 h-8 w-8 flex-none rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-900 ring-1 ring-zinc-700" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-zinc-50">Pricing Studio</h1>
            <p className="text-xs font-medium text-zinc-400">Gig Tracker · shape the Free / Side Hustler / Full-Timer plans</p>
          </div>
        </header>

        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-400">
          Every real Gig Tracker feature is a card below.{' '}
          <span className="font-semibold text-zinc-200">Tap each one into the tier you think it belongs in</span>, set
          what the paid tiers should cost, and watch the three plans build themselves. When you're happy, hit{' '}
          <span className="font-semibold text-zinc-200">Copy my share link</span> and text it back to Luke. No login,
          nothing to install.
        </p>

        {/* who */}
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3">
          <label htmlFor="ps-author" className="text-sm font-semibold text-zinc-400">This plan is by</label>
          <input
            id="ps-author" type="text" value={author} onChange={(e) => setAuthor(e.target.value)}
            placeholder="your name — so Luke knows whose plan this is"
            className="min-w-[160px] flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          />
        </div>

        {/* STEP 1 — assign */}
        <Section step="01" title="Sort every feature into a tier"
          note="No wrong answers — this is exactly the judgment call we're gathering. Free should feel genuinely useful on its own, or nobody sticks around; the paid tiers have to feel clearly worth paying for. The colors are Luke's current guess from the backlog — move anything.">
          {CATS.map(([cid, clabel]) => (
            <div key={cid} className="mb-5">
              <div className="mb-2 flex items-center gap-3 px-0.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">{clabel}</span>
                <span className="h-px flex-1 bg-zinc-800" />
              </div>
              {FEATURES.filter((f) => f[1] === cid).map((f) => (
                <div key={f[0]} className={`mb-2 grid grid-cols-1 items-center gap-3 rounded-xl border border-zinc-800 border-l-4 bg-zinc-900 p-3 sm:grid-cols-[1fr_auto] ${TIER[assign[f[0]]].edgeL}`}>
                  <div>
                    <div className="text-sm font-semibold text-zinc-100">{f[2]}</div>
                    <div className="mt-0.5 text-xs text-zinc-500">{f[3]}</div>
                  </div>
                  <div className="justify-self-start sm:justify-self-end">
                    <div className="inline-flex gap-0.5 rounded-full border border-zinc-800 bg-zinc-800/70 p-0.5" role="group" aria-label={`Tier for ${f[2]}`}>
                      {TIER_ORDER.map((t) => {
                        const on = assign[f[0]] === t;
                        return (
                          <button
                            key={t} type="button" aria-pressed={on} onClick={() => setTier(f[0], t)}
                            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 ${on ? TIER[t].seg : 'text-zinc-500 hover:text-zinc-300'}`}
                          >
                            {TIER[t].name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </Section>

        {/* STEP 2 — price */}
        <Section step="02" title="Set the prices"
          note="Pick how you'd bill, then set a number for each paid tier. Gig drivers are subscription-tired, so the “≈ orders” line reframes each price in the app's own currency: deliveries.">
          <div className="mb-4 inline-flex gap-0.5 rounded-full border border-zinc-800 bg-zinc-800/70 p-0.5" role="group" aria-label="Billing model">
            {['monthly', 'annual', 'lifetime'].map((m) => (
              <button
                key={m} type="button" aria-pressed={billing === m} onClick={() => setBilling(m)}
                className={`rounded-full px-4 py-2 text-sm font-bold capitalize transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 ${billing === m ? 'bg-emerald-500 text-emerald-950' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {['sh', 'ft'].map((tier) => {
              const pl = priceLabel(tier);
              return (
                <div key={tier} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                  <div className="mb-2.5 flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${TIER[tier].dot}`} />
                    <span className="text-sm font-bold text-zinc-200">{TIER[tier].name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xl text-zinc-500">$</span>
                    <input
                      type="text" inputMode="decimal" value={prices[tier][billing]}
                      onChange={(e) => setPrice(tier, e.target.value)}
                      aria-label={`${TIER[tier].name} ${billing} price`}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-xl font-semibold tabular-nums text-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    />
                  </div>
                  <div className="mt-2 min-h-[16px] text-xs text-zinc-500">
                    {pl.sub && <span>{pl.sub}&nbsp; · &nbsp;</span>}
                    <span className="font-semibold text-emerald-400">{pl.orders}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* STEP 3 — cards */}
        <Section step="03" title="Your three plans, live"
          note="This is what a driver would see on the pricing screen. If a paid tier looks thin — or Free looks too generous to ever upgrade from — go back up and re-sort.">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {TIER_ORDER.map((tier) => {
              const feats = FEATURES.filter((f) => assign[f[0]] === tier);
              const inherits = tier === 'sh' ? ' + everything in Free' : tier === 'ft' ? ' + everything in Side Hustler' : '';
              const pl = tier === 'free' ? null : priceLabel(tier);
              return (
                <div key={tier} className={`flex flex-col rounded-xl border border-zinc-800 border-t-4 bg-zinc-900 p-4 ${TIER[tier].edgeT}`}>
                  <div className="flex items-center gap-2 text-base font-extrabold text-zinc-50">
                    <span className={`h-2.5 w-2.5 rounded-full ${TIER[tier].dot}`} />{TIER[tier].name}
                  </div>
                  <div className="mt-0.5 text-[10.5px] font-bold uppercase tracking-widest text-zinc-500">{TIER[tier].tag}</div>

                  {tier === 'free' ? (
                    <>
                      <div className="mb-0.5 mt-3.5 flex items-baseline gap-1.5">
                        <span className="font-mono text-3xl font-bold tracking-tight">$0</span>
                        <span className="text-sm font-semibold text-zinc-400">forever</span>
                      </div>
                      <div className="min-h-[15px] text-xs text-zinc-500">The reason people open the app</div>
                      <div className="mt-1.5 min-h-[15px] text-xs" />
                    </>
                  ) : (
                    <>
                      <div className="mb-0.5 mt-3.5 flex items-baseline gap-1.5">
                        <span className="font-mono text-3xl font-bold tracking-tight tabular-nums">{pl.amt}</span>
                        <span className="text-sm font-semibold text-zinc-400">{pl.per}</span>
                      </div>
                      <div className="min-h-[15px] text-xs text-zinc-500">{pl.sub || ' '}</div>
                      <div className="mt-1.5 min-h-[15px] text-xs font-semibold text-emerald-400">{pl.orders}</div>
                    </>
                  )}

                  <div className="my-3 text-xs text-zinc-500">
                    <b className="font-mono text-zinc-200">{feats.length}</b> feature{feats.length === 1 ? '' : 's'} land here{inherits}
                  </div>
                  {feats.length ? (
                    <ul className="flex flex-col gap-1.5">
                      {feats.map((f) => (
                        <li key={f[0]} className="flex items-start gap-1.5 text-xs text-zinc-400">
                          <span className={tier === 'free' ? 'text-zinc-600' : 'font-mono font-bold text-emerald-500'}>{tier === 'free' ? '•' : '+'}</span>
                          {f[2]}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-xs italic text-zinc-600">No features here yet — sort some in above.</div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        {/* weigh */}
        <Section title="Things to weigh while you decide">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              ['Free has to earn love', 'The core loop — logging orders and watching your EPH — is what makes a driver open the app every shift. Gate that and there’s nothing to upgrade from.'],
              ['Each paid step needs a clear “why”', 'A tier only sells if its headline feature is obvious at a glance. If you can’t name the one thing Side Hustler unlocks, it’s priced on vapor.'],
              ['Subscription fatigue is real', 'This audience resents another monthly bill. A one-time Lifetime price or a cheap annual can convert people who’d never start a subscription.'],
              ['Price it in deliveries', 'Drivers think in orders, not dollars. “About one $5 order a month” is a far easier yes than “$4.99/mo,” even though they’re the same thing.'],
            ].map(([h, p]) => (
              <div key={h} className="rounded-xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-900/40 p-4">
                <h3 className="mb-1.5 flex items-center gap-2 text-sm font-bold text-zinc-200">
                  <span className="h-4 w-1.5 flex-none rounded-sm bg-emerald-500" />{h}
                </h3>
                <p className="text-xs leading-relaxed text-zinc-400">{p}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* share */}
        <Section title="Share your plan with Luke">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="mb-3 text-xs text-zinc-400">
              Your plan lives entirely inside the link — copy it and send it however you like. Luke opens it and sees exactly what you built.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <button type="button" onClick={() => copy(shareLink(), 'Share link copied — send it to Luke')}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-emerald-950 hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500">
                🔗 Copy my share link
              </button>
              <button type="button" onClick={() => copy(textSummary(), 'Text summary copied')}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm font-bold text-zinc-100 hover:border-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500">
                📋 Copy as text summary
              </button>
            </div>

            {/* compare */}
            <details className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/60">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-zinc-200">
                Luke's tool — compare everyone's plans
              </summary>
              <div className="px-4 pb-4">
                <p className="mb-2 text-xs text-zinc-400">Paste the share links people sent you — one per line — to see where you all agree and where you differ (your own plan is included automatically).</p>
                <textarea
                  value={cmpInput} onChange={(e) => setCmpInput(e.target.value)}
                  placeholder={'https://…#plan=…\nhttps://…#plan=…'}
                  className="h-20 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 font-mono text-xs text-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                />
                <div className="mt-2.5">
                  <button type="button" onClick={runCompare}
                    className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm font-bold text-zinc-100 hover:border-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500">
                    Compare plans
                  </button>
                </div>
                {cmpPlans && cmpPlans.length >= 2 && (
                  <div className="mt-3.5 overflow-x-auto">
                    <table className="w-full min-w-[460px] border-collapse text-xs">
                      <thead>
                        <tr>
                          <th className="border-b border-zinc-800 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide text-zinc-500">Feature</th>
                          {cmpPlans.map((p, i) => (
                            <th key={i} className="border-b border-zinc-800 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                              {(p.author && p.author.trim()) || (i === 0 ? 'You' : `Plan ${i + 1}`)}
                            </th>
                          ))}
                          <th className="border-b border-zinc-800 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide text-zinc-500">Agreement</th>
                        </tr>
                      </thead>
                      <tbody>
                        {FEATURES.map((f) => {
                          const picks = cmpPlans.map((p) => (p.assign && p.assign[f[0]]) || 'na');
                          const uniq = [...new Set(picks)];
                          const agree = uniq.length === 1;
                          return (
                            <tr key={f[0]}>
                              <td className="border-b border-zinc-800/60 px-2 py-1.5 font-semibold text-zinc-200">{f[2]}</td>
                              {picks.map((t, i) => (
                                <td key={i} className="border-b border-zinc-800/60 px-2 py-1.5">
                                  <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-bold ${TIER[t] ? TIER[t].pill : 'bg-zinc-800 text-zinc-600'}`}>
                                    {TIER[t] ? TIER[t].short : '—'}
                                  </span>
                                </td>
                              ))}
                              <td className={`border-b border-zinc-800/60 px-2 py-1.5 text-[11px] font-bold ${agree ? 'text-emerald-400' : 'text-amber-400'}`}>
                                {agree ? '✓ all agree' : `${uniq.length} views`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </details>
          </div>
        </Section>

        <footer className="mt-10 flex flex-wrap items-center gap-3 text-xs text-zinc-600">
          <span>Starting points are Luke's current backlog guess — not decisions.</span>
          <button type="button" onClick={reset} className="text-zinc-400 underline underline-offset-2 hover:text-zinc-200">
            Reset to Luke's starting proposal
          </button>
        </footer>
      </div>

      {/* toast */}
      <div className={`pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-emerald-500 px-4 py-2.5 text-sm font-bold text-emerald-950 shadow-lg transition-all ${toast ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}

function Section({ step, title, note, children }) {
  return (
    <section className="mt-8">
      <div className="mb-1 flex flex-wrap items-baseline gap-3">
        {step && <span className="rounded-md border border-zinc-700 px-1.5 py-0.5 font-mono text-[11px] font-bold text-emerald-400">{step}</span>}
        <h2 className="text-base font-bold tracking-tight text-zinc-100">{title}</h2>
      </div>
      {note && <p className="mb-4 max-w-2xl text-xs leading-relaxed text-zinc-500">{note}</p>}
      {children}
    </section>
  );
}
