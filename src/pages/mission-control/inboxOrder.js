// Inbox tiering and ordering, kept out of the component so the rule Luke
// actually specified (#230) sits in one readable place — and so it can be
// exercised on its own. Deliberately plain JS with no React or JSX: it runs
// under bare `node`, which is currently the only way to check this logic at all
// (the app's build toolchain can't be installed here — needs-luke #218).

// A resolved thread is only "done" once Luke has actually read the closing
// message. Until then it keeps its place in the Inbox — see migration 055.
export const isAcknowledged = (t) => !!t.luke_acknowledged_at;
export const isUnreadResolved = (t) => t.status === 'resolved' && !isAcknowledged(t);

// Tier signal (#154). mc_threads.status is the hand-off state the app already
// tracks and flips on every turn: postReply() sets 'waiting_on_agent' the
// moment Luke replies, and the Sidekick sets it back to 'needs_you' when it
// needs him again. That IS the "unaddressed vs. you've-replied" split Luke
// asked for, so we key the tiers off status directly rather than re-deriving it
// from message order.
export const awaitingLuke = (t) => t.status !== 'waiting_on_agent';

// Priority rides on mc_threads.severity (urgent | normal | low).
const severityRank = (s) => (s === 'urgent' ? 0 : s === 'low' ? 2 : 1);

// The age key is `updated_at`, not created_at — Luke's ask (#230) is that at a
// given priority the thread nothing has happened on the longest surfaces above
// one that just moved, which is staleness, not birthday.
const threadAge = (t) => new Date(t.updated_at || t.created_at).getTime();

// Within a tier: highest priority first (urgent → normal → low), then the
// longest-stale first.
export const byPriorityThenAge = (a, b) => {
  const d = severityRank(a.severity) - severityRank(b.severity);
  if (d !== 0) return d;
  return threadAge(a) - threadAge(b);
};

// Resolved threads sort by age alone — priority is about what to work on next
// and these are already closed. They're a reading queue, oldest close first.
export const byAge = (a, b) => threadAge(a) - threadAge(b);

// Tier order, top to bottom (#230). Resolved-new leads: it's the shortest queue
// and the one Luke reads rather than works, so it clears in a few taps and then
// gets out of the way of the list underneath. The Needs-you / With-Sidekick
// split from #190 stays intact below it as its own labeled sections — Luke's
// ask was about *ordering* the list, and collapsing the two into one flat
// priority sort would interleave threads he's already answered with ones still
// on him, which is the exact confusion #190 set out to fix.
//
// Empty tiers are dropped, so callers can label by `tiers.length` alone.
export function inboxTiers(threads) {
  const open = threads.filter((t) => t.status !== 'resolved');
  return [
    {
      key: 'resolved-new',
      label: 'Resolved — new to you',
      tone: 'text-emerald-500/70',
      // Closed out, but Luke hasn't read the closing message (#190). Stays on
      // screen like an unread email until he taps "Got it".
      items: threads.filter(isUnreadResolved).sort(byAge),
    },
    {
      key: 'needs-you',
      label: 'Needs you',
      tone: 'text-amber-500/70',
      items: open.filter(awaitingLuke).sort(byPriorityThenAge),
    },
    {
      key: 'with-sidekick',
      label: "With Sidekick — you've replied",
      tone: 'text-zinc-600',
      items: open.filter((t) => !awaitingLuke(t)).sort(byPriorityThenAge),
    },
  ].filter((t) => t.items.length > 0);
}

// Read and filed — the collapsed history section at the bottom.
export function resolvedHistory(threads) {
  return threads.filter((t) => t.status === 'resolved' && isAcknowledged(t));
}
