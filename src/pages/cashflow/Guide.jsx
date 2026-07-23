import { Link } from 'react-router-dom';
import {
  ArrowLeft, Droplets, Layers, Receipt, CreditCard, Repeat, Banknote,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Cashflow "How it works" guide.
//
// MAINTENANCE: this page documents how each Cashflow tab behaves. When you
// change a tab's behavior or UI, update that tab's section here IN THE SAME PR
// and bump its `updated` date below. Stale docs are worse than none. (This rule
// is also recorded in CLAUDE.md so it survives across sessions.)
// ─────────────────────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'waterfall',     label: 'Waterfall',     icon: Droplets,   color: '#06b6d4', updated: '2026-07-23' },
  { id: 'summary',       label: 'Summary',       icon: Layers,     color: '#64748b', updated: '2026-07-15' },
  { id: 'bills',         label: 'Bills',         icon: Receipt,    color: '#3b82f6', updated: '2026-07-15' },
  { id: 'debts',         label: 'Debts',         icon: CreditCard, color: '#8b5cf6', updated: '2026-07-22' },
  { id: 'subscriptions', label: 'Subscriptions', icon: Repeat,     color: '#ec4899', updated: '2026-07-15' },
  { id: 'earnin',        label: 'Earnin',        icon: Banknote,   color: '#f59e0b', updated: '2026-07-15' },
];

// Every waterfall step, in pour order, in plain English. Mirrors DEFAULT_STEPS
// in waterfallCalc.js — keep in sync when steps change.
const TIERS = [
  {
    key: 'gate', label: 'Stability & Timing (hard gates)',
    blurb: 'Always funded first, in order — each takes the smaller of what it needs and what’s left. These protect timing and core runway.',
    steps: [
      ['0a', 'Uber Pro Card — Backup Repayment', 'Uber Pro Card', 'Tops the Uber Pro Card back up to the backup balance you owe it.'],
      ['0b', 'Bill Pay — Earnin Repayment', 'Bill Pay Checking', 'Covers what you owe Earnin (it auto-repays same-day as your paycheck). Live from the Earnin tab’s running balance.'],
      ['0c', 'Bill Pay — On-Deck Bills', 'Bill Pay Checking', 'Covers the Bill-type items you’ve staged On Deck, after Earnin is covered.'],
      ['1', 'Operating — Weekly Essentials', 'Operating Checking', 'This week’s fuel + groceries need (tapered by day of week), net of what’s already in Operating + the Uber Pro Card.'],
      ['2', 'Bill Pay — Immediate Bills', 'Bill Pay Checking', 'Bills due within your selected window (the 7/14/30/Until-Paycheck selector drives this), plus the subscription floor, net of the Bill Pay balance left after Earnin.'],
      ['3', 'Debt Pay — Debt/Loan Radar', 'Debt Pay Checking', 'Debt/loan minimums due within your selected window (plus anything on deck), net of the Debt/Loan Checking balance.'],
      ['4', 'Bill Pay — Floor Build', 'Bill Pay Checking', 'Builds Bill Pay up toward your total fixed monthly bills (live from the Bills tab), after step 2’s allocation.'],
    ],
  },
  {
    key: 'surplus', label: 'Surplus Slices',
    blurb: 'Fixed percentages of whatever survives the gates (the “surplus pool”). Both percentages here are editable directly in the table.',
    steps: [
      ['5a', 'Debt Pay — Extra to Debt Payoff', 'Debt Pay Checking', '35% of the surplus, straight toward paying down debt.'],
      ['5b', 'Primary Savings — House Savings', 'Primary Savings', '25% of the surplus — but only once the emergency fund is fully funded (gated).'],
    ],
  },
  {
    key: 'absorber', label: 'Absorbers (target-based)',
    blurb: 'Take whatever remains, in order, until each target is met.',
    steps: [
      ['6', 'Operating — Buffer', 'Operating Checking', 'Fills Operating up to its buffer target, crediting any Uber Pro Card surplus toward it.'],
      ['7', 'Credit Union — Relationship Fund', 'Credit Union Checking', 'A flat weekly amount (editable in the table — the other directly-editable Need).'],
      ['8a', 'Vehicle Savings — CX-5 Catch-Up', 'Vehicle Maintenance Savings', 'Catches the CX-5 repair balance up to its outstanding target.'],
      ['8b', 'Vehicle Savings — CX-5 Ongoing', 'Vehicle Maintenance Savings', 'The ongoing vehicle-maintenance target.'],
      ['8c', 'Vehicle Savings — Versa Revival', 'Vehicle Maintenance Savings', 'Toward the Versa — only after the CX-5 catch-up is done (gated).'],
      ['9', 'Primary Savings — Emergency Fund', 'Primary Savings', 'Builds the emergency fund toward its goal.'],
    ],
  },
  {
    key: 'remainder', label: 'Sweep',
    blurb: 'Whatever is still left over after everything above.',
    steps: [
      ['nw', 'Operating — Needs & Wants / Extra to Avalanche', 'Operating Checking', 'The leftover — for a planned purchase, or throw it at the avalanche.'],
    ],
  },
];

function Chip({ s }) {
  const Icon = s.icon;
  return (
    <a
      href={`#${s.id}`}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 text-xs font-medium text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors whitespace-nowrap shrink-0"
    >
      <Icon size={13} style={{ color: s.color }} /> {s.label}
    </a>
  );
}

function SectionHeader({ s }) {
  const Icon = s.icon;
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Icon size={20} style={{ color: s.color }} /> {s.label}
      </h2>
      <span className="text-[11px] text-zinc-500">Last updated: {s.updated}</span>
    </div>
  );
}

// A titled sub-block within a section.
function Block({ title, children }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <h3 className="text-sm font-semibold text-zinc-200 mb-2">{title}</h3>
      <div className="space-y-2 text-sm text-zinc-400 leading-relaxed">{children}</div>
    </div>
  );
}

const meta = (id) => SECTIONS.find((s) => s.id === id);

export default function Guide() {
  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <Link to="/cashflow/waterfall" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-3">
          <ArrowLeft size={13} /> Back to Cashflow
        </Link>
        <h1 className="text-2xl font-bold">How the Cashflow Plan works</h1>
        <p className="text-sm text-zinc-500 mt-1">
          A reference for each tab. The Waterfall write-up is complete; the others are stubs we’ll fill in as we go.
        </p>
        <div className="mt-4 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SECTIONS.map((s) => <Chip key={s.id} s={s} />)}
        </div>
      </div>

      {/* ── Waterfall — full detail ─────────────────────────────────────────── */}
      <section id="waterfall" className="space-y-4 scroll-mt-6">
        <SectionHeader s={meta('waterfall')} />
        <p className="text-sm text-zinc-400 leading-relaxed">
          The Waterfall is the heart of the module: it takes the money you have to move this week and
          pours it, top to bottom, through an ordered plan — covering the urgent, timing-sensitive
          things first, then targets and savings, then whatever’s left. It also rolls the result up by
          destination account, so you get a literal “move this much into each account” list.
        </p>

        <Block title="1. The money — “Available” vs “To distribute”">
          <p><strong className="text-zinc-300">Available this week</strong> is the whole picture: your paycheck (if it hasn’t landed yet) + side-gig + all your current cash on hand.</p>
          <p><strong className="text-zinc-300">To distribute</strong> is the subset actually being poured through the plan — the pool. <em>Allocated</em> and <em>Left</em> below it show how much the plan placed and what remains.</p>
          <p>The two buttons set what’s in the pool:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-zinc-300">Planning ahead</strong> — the paycheck hasn’t landed yet, so it’s added to the pool as incoming money.</li>
            <li><strong className="text-zinc-300">Already in Bill Pay</strong> — the paycheck already landed in Bill Pay, so it isn’t added again; Bill Pay is auto-banked (its balance, paycheck included, becomes the pool).</li>
          </ul>
        </Block>

        <Block title="2. Banking accounts into the pool">
          <p>Each account in <strong className="text-zinc-300">Current Balances</strong> has a <strong className="text-cyan-400">Bank</strong> checkbox. The rule is simple and consistent:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-zinc-300">Banked</strong> → that balance is added to “To distribute” <em>and</em> the account is planned from $0 (its gates show their full need).</li>
            <li><strong className="text-zinc-300">Not banked</strong> → the balance stays put and simply nets against that account’s needs.</li>
          </ul>
          <p>So money you zero out of an account always lands back in the pool — nothing vanishes. This is how you “bank” your checking balances in with the paycheck and watch the whole pot flow down the table.</p>
        </Block>

        <Block title="3. The waterfall table (Step · Need · Allocate · Left)">
          <p><strong className="text-zinc-300">Need</strong> is what each step wants; <strong className="text-zinc-300">Allocate</strong> is what it actually got (the smaller of its need and what was left); <strong className="text-zinc-300">Left</strong> is the pool remaining after it.</p>
          <p>Almost every Need is <span className="text-amber-400 font-medium">live</span> — computed from your accounts, the bill/debt totals for your selected window, on-deck amounts, and Plan Inputs (hover the <span className="text-amber-400">live</span> badge for the exact math). Only three Needs are typed directly in the table: the two <strong className="text-zinc-300">surplus percentages</strong> (5a/5b) and <strong className="text-zinc-300">Step 7’s flat amount</strong>.</p>
          <p>Steps are grouped into four tiers that pour in order:</p>
          {TIERS.map((t) => (
            <div key={t.key} className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-300">{t.label}</p>
              <p className="text-[13px] text-zinc-500 mt-0.5 mb-2">{t.blurb}</p>
              <div className="space-y-1.5">
                {t.steps.map(([id, label, acct, desc]) => (
                  <div key={id} className="text-[13px]">
                    <span className="tabular-nums text-zinc-500 mr-1.5">{id}</span>
                    <span className="text-zinc-300 font-medium">{label}</span>
                    <span className="text-zinc-600"> → {acct}</span>
                    <p className="text-zinc-500 ml-6">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Block>

        <Block title="4. Move into each account">
          <p>The right-hand rollup regroups the plan by <strong className="text-zinc-300">destination account</strong> — so instead of reading step by step, you see “put $X into Bill Pay, $Y into Debt Pay…”, with each account’s current → projected balance and the steps feeding it. This is your actual transfer checklist. It lives under <strong className="text-zinc-300">Payday Distribution</strong> alongside the step table.</p>
        </Block>

        <Block title="5. Short Term Needs">
          <p>Four cards answer “can I cover what’s coming?” for a window you pick (<strong className="text-zinc-300">7 / 14 / 30 days</strong>, or <strong className="text-zinc-300">Until Paycheck</strong> — which stops the day <em>before</em> payday, since anything due that day belongs to the next period):</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-zinc-300">Available now</strong> — the cash you&rsquo;ve <strong className="text-zinc-300">banked</strong> into the pool (the same accounts feeding &ldquo;To Distribute&rdquo;; Bill Pay auto-banks in &ldquo;Already in Bill Pay&rdquo; mode), with the projected total once pending transfers into those accounts clear. Un-banked savings you&rsquo;ve earmarked aren&rsquo;t counted; a caption shows your full cash on hand when it differs. <em>Cash after</em> uses this same figure so the cards reconcile.</li>
            <li><strong className="text-zinc-300">Coming up</strong> — everything due in the window, split into Bills and Debts.</li>
            <li><strong className="text-zinc-300">On Deck</strong> — what you’ve staged to pay, by type.</li>
            <li><strong className="text-zinc-300">Cash after</strong> — cash minus what’s due in the window (green surplus / red shortfall), plus <em>Covers On Deck?</em> and <em>Covers Pending?</em> lines.</li>
          </ul>
          <p>When you owe Earnin, an <strong className="text-zinc-300">Include Earnin owed</strong> toggle appears next to the window buttons. Off by default (Earnin debits only post on payday, so most days it isn’t due inside the window). Flip it on and the live Earnin-owed balance folds into <em>Coming up</em> (as its own line) and <em>Cash after</em> — handy on payday in <strong className="text-zinc-300">Already in Bill Pay</strong> mode, before the same-day Earnin debit actually posts, so “Cash after” isn’t rosier than reality.</p>
          <p>Collapsing this section hides the cards <em>and</em> the detail tables; the header shows a Coming / On Deck / After summary when collapsed.</p>
          <p>The window you pick here also drives how far ahead the plan reserves: Step 2 (Immediate Bills) and Step 3 (Debt Radar) cover bills/debts due within this same window. Since one paycheck has to last until the next, <strong className="text-zinc-300">Until Paycheck</strong> is the natural setting for planning a single paycheck; a 30-day window reserves more than one pay period will cover.</p>
        </Block>

        <Block title="6. On Deck · Coming Up · Ad Hoc">
          <p><strong className="text-zinc-300">Coming Up</strong> lists everything due in the window, live from Bills, Debts, Subscriptions and ad-hoc items. Move an item <strong className="text-zinc-300">On Deck</strong> to stage it for payment; on the On Deck list you can tick <strong className="text-zinc-300">Pending</strong> (Pending Withdrawal — it’s triggered and about to clear), <strong className="text-zinc-300">advance</strong> a recurring item to its next due date, or mark a one-off <strong className="text-zinc-300">paid &amp; remove</strong>. <strong className="text-zinc-300">Ad Hoc / Manual Entry</strong> is for one-offs that don’t live on the other tabs.</p>
          <p>Ticking <strong className="text-zinc-300">Pending</strong> on a debt mirrors to that debt’s <em>Pending Withdrawal</em> flag on the Debts tab (which faded-yellow-highlights the row) — and clears again when you untick it or take it off deck.</p>
          <p>Advancing a <strong className="text-zinc-300">debt</strong> opens a quick confirm: it prefills the <strong className="text-zinc-300">new balance</strong> (current − normal payment, editable), previews the next due date and the <strong className="text-zinc-300">expected payoff</strong> recalculated from that balance, and lets you record a <strong className="text-zinc-300">Last Date</strong> (an actual/hard payoff cap — the payoff shown is the earlier of the calculated date and this). Confirming applies the balance, rolls the due date, clears Pending, and drops it off deck. Bills and subscriptions still advance in one click.</p>
          <p>Debt rows (in both Coming Up and On Deck) show the <strong className="text-zinc-300">lender</strong> as a small subtitle under the name, and an <strong className="text-zinc-300">(i)</strong> icon that opens a read-only lookup card — lender, type, balance, payment, APR, next due, expected payoff — so you can tell debts apart without hunting on the Debts tab.</p>
        </Block>

        <Block title="7. Current Balances & pending transfers">
          <p>Edit any balance inline; a freshness dot + “Xd ago” shows how stale it is. The <strong className="text-zinc-300">gear</strong> adds an account; <strong className="text-zinc-300">Transfers</strong> opens the pending-transfers modal (money in flight that hasn’t landed — it shows as a projected balance but doesn’t change the pour). Once a day, a <strong className="text-zinc-300">“Still accurate?”</strong> prompt asks you to confirm or update stale balances before you plan.</p>
        </Block>

        <Block title="8. Plan Inputs, freshness & the payday reminder">
          <p><strong className="text-zinc-300">Plan Inputs</strong> (in the ⋯ menu) holds the targets and “what you owe” figures behind the live Needs. Two are computed automatically (Total fixed bills, live from Bills; Earnin owed, live from the Earnin tab); the rest are manual targets you set. Each field shows its own last-updated date. On <strong className="text-zinc-300">payday</strong>, a reminder nudges you to confirm those inputs still match reality — <em>Looks good</em> stamps them all fresh, <em>Review now</em> opens the modal.</p>
        </Block>

        <Block title="9. Privacy">
          <p>The amber <strong className="text-zinc-300">eye button</strong> (top bar, left of the ⋯ menu) blurs/reveals every dollar figure across the module. Modals that sit on top of it carry their own eye toggle so figures are never stuck hidden.</p>
        </Block>
      </section>

      {/* ── Summary ─────────────────────────────────────────────────────────── */}
      <section id="summary" className="space-y-4 scroll-mt-6">
        <SectionHeader s={meta('summary')} />
        <p className="text-sm text-zinc-400 leading-relaxed">
          A single read-only rollup of every obligation across the module — nothing here is editable;
          each row derives from its own tab. It’s the view other tools (like the Debt Payoff Calculator)
          build on.
        </p>
        <Block title="How rows are built">
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-zinc-300">Bill</strong> rows — one per Bills-tab row, monthly-equivalent amount.</li>
            <li><strong className="text-zinc-300">Debt</strong> rows — rolled up <em>by lender</em> (not by individual purchase), so several BNPL purchases with the same lender collapse into one line with a count.</li>
            <li><strong className="text-zinc-300">Subscription</strong> rows — two lines only: “Digital Subscriptions” and “Consumable Subscriptions,” each the active-only monthly total from the Subscriptions tab.</li>
          </ul>
          <p>Rows group by category (Bill → Debt → Operating → Subscription) and sort by monthly cost within each group, with a subtotal per group and a grand total row.</p>
        </Block>
        <Block title="The four stat cards">
          <p><strong className="text-zinc-300">Total monthly</strong> (everything), <strong className="text-zinc-300">Debt balance</strong> (sum of all debt balances), <strong className="text-zinc-300">Debt payments/mo</strong> (sum of debt minimums), <strong className="text-zinc-300">Annualized</strong> (total monthly × 12).</p>
        </Block>
      </section>

      {/* ── Bills ───────────────────────────────────────────────────────────── */}
      <section id="bills" className="space-y-4 scroll-mt-6">
        <SectionHeader s={meta('bills')} />
        <p className="text-sm text-zinc-400 leading-relaxed">
          Recurring bills — amounts, due dates, and categories. This is the source of truth for two
          things the Waterfall reads live: the “immediate bills” total for your selected window, and (for <strong className="text-zinc-300">Bill</strong>-category
          rows only) the Floor Build target.
        </p>
        <Block title="Category matters">
          <p>Only two categories exist: <strong className="text-zinc-300">Bill</strong> and <strong className="text-zinc-300">Operating</strong>. Only <strong className="text-zinc-300">Bill</strong> rows count toward the Waterfall’s “Total fixed bills” figure (Floor Build) — Operating rows (like variable day-to-day spend) don’t. Subscriptions intentionally don’t live here at all — they have their own tab, so they aren’t double-counted in the Summary’s Subscription group.</p>
        </Block>
        <Block title="Table & editor">
          <p>Inline-editable table with a freshness-dated <strong className="text-zinc-300">Updated</strong> column and a heat-colored <strong className="text-zinc-300">Days</strong> badge (red = due soon/overdue, green = plenty of runway). <strong className="text-zinc-300">All columns</strong> reveals Cat 2/3, Priority, Day Due, Payment Source, Total Updated, YoY change, and the raw Amount/Frequency (the table always shows the derived <strong className="text-zinc-300">Mon.</strong> — monthly-equivalent — column). Open the full editor (expand icon, or tap a card on mobile) for the same fields grouped into Key fields up top and the rest under More details.</p>
        </Block>
      </section>

      {/* ── Debts ───────────────────────────────────────────────────────────── */}
      <section id="debts" className="space-y-4 scroll-mt-6">
        <SectionHeader s={meta('debts')} />
        <p className="text-sm text-zinc-400 leading-relaxed">
          Every debt/loan/BNPL balance, minimum, and payoff projection — feeds the Waterfall’s Debt
          Radar (minimums due within the selected window) and the standalone Debt Payoff Calculator.
        </p>
        <Block title="Calculated fields (read-only)">
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-zinc-300">Total Due</strong> = Limit + Finance Charge.</li>
            <li><strong className="text-zinc-300">Available Credit</strong> = Limit − Balance — <strong className="text-zinc-300">Credit Card</strong> type only; loans and BNPL show “—” (no revolving credit to speak of).</li>
            <li><strong className="text-zinc-300">Payments Remaining</strong> — BNPL: balance ÷ payment, rounded up. Loan/Credit Card: an amortization calculation (NPER) off balance, APR, and payment.</li>
            <li><strong className="text-zinc-300">Expected Payoff Date</strong> — the amortized payoff date, or the manual <strong className="text-zinc-300">Last Date</strong> if that’s earlier.</li>
          </ul>
          <p>Total Due and Available Credit recompute (and save) automatically whenever you edit the limit, finance charge, balance, or credit type — so the stored values the Payoff Calculator reads never drift out of sync.</p>
        </Block>
        <Block title="Adding a debt & the editor layout">
          <p><strong className="text-zinc-300">Add debt</strong> opens the full editor immediately on the new row. Fields are ordered by how often you touch them: Purchase, Lender, Credit Type, Balance, Normal Payment, Next Due, Day Due, Priority up top; a <strong className="text-zinc-300">Loan origination details</strong> collapsible (APR, origination date, term, finance charge, limit + calculated Total Due); and <strong className="text-zinc-300">More details</strong> for Available Credit, Last Date, New Min. The <strong className="text-zinc-300">Updated</strong> date + freshness dot + one-click refresh live in the header next to the debt name.</p>
        </Block>
        <Block title="Pending Withdrawal">
          <p>The <strong className="text-zinc-300">Pending</strong> checkbox marks a payment as triggered and about to clear; a pending row gets a <strong className="text-zinc-300">faded-yellow highlight</strong> across the whole line. This flag is shared with the Waterfall’s On Deck list — ticking Pending there (on a debt) sets it here too, and confirming an <em>advance payment</em> from On Deck clears it.</p>
        </Block>
      </section>

      {/* ── Subscriptions ───────────────────────────────────────────────────── */}
      <section id="subscriptions" className="space-y-4 scroll-mt-6">
        <SectionHeader s={meta('subscriptions')} />
        <p className="text-sm text-zinc-400 leading-relaxed">
          Two separate tables under one tab — <strong className="text-zinc-300">Digital</strong> (fixed-price recurring, like
          streaming) and <strong className="text-zinc-300">Consumable</strong> (recurring purchases priced per order, like a
          reorder-every-N-weeks item). Their combined active-only monthly total (halved) feeds the
          Waterfall’s subscription floor.
        </p>
        <Block title="Digital vs. Consumable math">
          <p><strong className="text-zinc-300">Digital</strong> is just amount × frequency, same monthly-equivalent conversion as Bills.</p>
          <p><strong className="text-zinc-300">Consumable</strong> is entered as a cost-per-order and a reorder frequency (in weeks in the UI, stored as days): <strong className="text-zinc-300">Cost/Type</strong> = cost ÷ count-per-order, <strong className="text-zinc-300">Orders/Yr</strong> = 52 ÷ weeks, <strong className="text-zinc-300">Cost/Year</strong> = cost-per-order × orders/yr, and the monthly estimate derives from that (falling back to a local calc if the database hasn’t generated it yet for a brand-new row).</p>
        </Block>
        <Block title="Spend by category & Change over time">
          <p><strong className="text-zinc-300">Spend by category</strong> bars active-only monthly spend across both tables, largest first. <strong className="text-zinc-300">Snapshot this month</strong> saves the current active set + totals; once you have a snapshot, the panel diffs today against it — Added, Dropped, and Price changed, plus the net monthly change. Only active subscriptions count toward every total; toggle <strong className="text-zinc-300">Showing active only</strong> to filter the table itself the same way.</p>
        </Block>
      </section>

      {/* ── Earnin ──────────────────────────────────────────────────────────── */}
      <section id="earnin" className="space-y-4 scroll-mt-6">
        <SectionHeader s={meta('earnin')} />
        <p className="text-sm text-zinc-400 leading-relaxed">
          A transaction log for Earnin advances and repayments — until a Monarch export can backfill
          full history. Its running balance feeds the Waterfall live, and it can post directly to
          Current Balances as a pending transfer.
        </p>
        <Block title="Advance vs. Repay">
          <p>Log an <strong className="text-zinc-300">Advance</strong> when you draw from Earnin; log a <strong className="text-zinc-300">Repay</strong> when it’s paid back (usually same-day as payday). Clicking <strong className="text-zinc-300">Repay</strong> pre-fills the amount with the current running balance — what you actually owe right now — instead of starting at $0. “Currently owed” is simply advances minus repayments, running.</p>
        </Block>
        <Block title="The Pending checkbox → Current Balances">
          <p>Check <strong className="text-zinc-300">Pending</strong> on a row before the money’s actually landed or cleared. It creates a real pending transfer on Bill Pay Checking — an advance posts as money <em>in</em>, a repay posts as money <em>out</em> — which is the same table Current Balances reads for its projected-balance lines. Editing the amount or date afterward keeps the linked transfer in sync; uncheck it (or delete the row) once the real transaction posts, and the transfer goes with it.</p>
        </Block>
        <Block title="Feeds the Waterfall live">
          <p>The running “currently owed” balance <em>is</em> the Waterfall’s Plan Inputs “Earnin — payback owed” figure — no manual copying. It drives Step 0b (Earnin Repayment) directly.</p>
        </Block>
      </section>
    </div>
  );
}
