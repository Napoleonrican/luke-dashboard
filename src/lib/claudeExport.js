// claudeExport.js — builds a Markdown snapshot of the debt-payoff scenario
// for pasting into a Claude Chat session. Markdown (not CSV/JSON) keeps Claude
// in narrative context: it can reason about strategy + income dependency
// immediately, without parsing columns or mapping field names.
//
// Pure and self-contained so it can be unit-tested without the React tree.

const fmt = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(n ?? 0);

const fmtDec = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n ?? 0);

const pct = (n) => `${((n ?? 0) * 100).toFixed(2)}%`;

// Month offset (0 = current month) → "Mon YYYY". null/undefined → "> 10yr".
function monthLabel(offset, base = new Date()) {
  if (offset === null || offset === undefined) return '> 10yr';
  const d = new Date(base.getFullYear(), base.getMonth() + offset);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

const isoDate = (base = new Date()) =>
  base.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

/**
 * Build the snapshot markdown.
 *
 * @param {object}   p
 * @param {number}   p.takeHome          HRB monthly take-home
 * @param {number}   p.weeklyGross       DoorDash gross $/wk (current slider)
 * @param {number}   p.monthlyGigNet     DoorDash net $/mo after efficiency
 * @param {number}   p.totalIncome       takeHome + monthlyGigNet
 * @param {number}   p.billsVariable     bills & variable expenses $/mo
 * @param {number}   p.totalDebtMins     sum of debt minimums $/mo
 * @param {number}   p.monthlyOutflow    billsVariable + totalDebtMins
 * @param {number}   p.monthlyDeficit    outflow above take-home (0 if surplus)
 * @param {number}   p.breakEvenWeekly   DoorDash $/wk needed to cover minimums
 * @param {number}   p.extraPerMonth     freed for extra paydown $/mo
 * @param {string}   p.strategyId        current strategy id
 * @param {string}   p.strategyLabel     current strategy label
 * @param {number|null} p.debtFreeMonth  current strategy debt-free offset
 * @param {Array}    p.debts             [{name, balance, apr, min, tag, payoffMonth}]
 * @param {Array}    p.strategyComparison [{label, totalInterest, debtFreeMonth}]
 * @param {Date}     [p.now]             injectable clock (tests)
 * @returns {string} markdown
 */
export function buildSnapshotMarkdown(p) {
  const now = p.now || new Date();
  const surplus = p.monthlyDeficit > 0 ? null : p.takeHome - p.monthlyOutflow;
  const totalDebt = p.debts.reduce((s, d) => s + (d.balance ?? 0), 0);

  const debtRows = p.debts
    .slice()
    .sort((a, b) => b.apr - a.apr)
    .map((d) =>
      `| ${d.name} | ${fmtDec(d.balance)} | ${pct(d.apr)} | ${fmtDec(d.min)} | ${d.tag || '—'} | ${monthLabel(d.payoffMonth, now)} |`,
    )
    .join('\n');

  const stratRows = p.strategyComparison
    .map((s) => `| ${s.label} | ${fmt(s.totalInterest)} | ${monthLabel(s.debtFreeMonth, now)} |`)
    .join('\n');

  return `# Financial Snapshot — ${isoDate(now)}

## Income
- HRB take-home: ${fmt(p.takeHome)}/mo
- DoorDash (current setting): ${fmt(p.weeklyGross)}/wk gross → ${fmt(p.monthlyGigNet)}/mo net
- **Total monthly income: ${fmt(p.totalIncome)}**

## Fixed Obligations
- Bills & variable expenses: ${fmt(p.billsVariable)}/mo
- Total debt minimums: ${fmt(p.totalDebtMins)}/mo
- **Total outflow: ${fmt(p.monthlyOutflow)}/mo**

## Cashflow Position
- ${surplus === null
      ? `Monthly shortfall before gig income: **${fmt(p.monthlyDeficit)}/mo** (DoorDash must cover this)`
      : `Monthly surplus after bills (before gig income): **${fmt(surplus)}/mo**`}
- Break-even DoorDash: **${fmt(p.breakEvenWeekly)}/wk**
- Extra available for debt paydown (at current gig level): **${fmt(p.extraPerMonth)}/mo**

## Debts (live from Debts tab, sorted by APR)
| Lender | Balance | APR | Min/mo | Type | Payoff (current strategy) |
|--------|---------|-----|--------|------|---------------------------|
${debtRows}

- Total debt remaining: **${fmt(totalDebt)}**

## Strategy Comparison
Current strategy: **${p.strategyLabel}** · debt-free **${monthLabel(p.debtFreeMonth, now)}**

| Strategy | Total interest | Debt-free |
|----------|----------------|-----------|
${stratRows}

## Key Questions for Review
1. Given these balances and APRs, is **${p.strategyLabel}** still the right payoff order, or would another strategy meaningfully cut total interest or time?
2. How soon can I reduce DoorDash hours without pushing out the debt-free date? At what debt milestones does the required ${fmt(p.breakEvenWeekly)}/wk break-even drop?
3. What's the fastest realistic path to cut reliance on gig income — accelerating a specific debt payoff, trimming the ${fmt(p.billsVariable)}/mo expenses, or something else?

---
*Snapshot generated from the Debt Payoff Calculator. All figures reflect current live data and scenario inputs at export time.*
`;
}
