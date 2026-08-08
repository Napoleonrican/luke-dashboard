import { describe, it, expect } from 'vitest';
import { inboxTiers, resolvedHistory, isUnreadResolved } from '../pages/mission-control/inboxOrder';

// Luke's ordering spec (#230), in his words: "Resolved - New (oldest to newest)
// at the top if there are any then, Priority (Highest to lowest); and Updated
// (oldest to newest)".
const thread = (id, status, severity, updated_at, luke_acknowledged_at = null) => ({
  id, status, severity, updated_at, luke_acknowledged_at,
  created_at: '2026-01-01T00:00:00Z',
});

const ids = (items) => items.map((t) => t.id);
const keys = (tiers) => tiers.map((t) => t.key);

describe('inboxTiers', () => {
  const threads = [
    thread('sk-old',      'waiting_on_agent', 'normal', '2026-08-01T00:00:00Z'),
    thread('need-low',    'needs_you',        'low',    '2026-07-01T00:00:00Z'),
    thread('need-hi-new', 'needs_you',        'urgent', '2026-08-05T00:00:00Z'),
    thread('need-hi-old', 'needs_you',        'urgent', '2026-08-02T00:00:00Z'),
    thread('res-new',     'resolved',         'urgent', '2026-08-06T00:00:00Z'),
    thread('res-old',     'resolved',         'low',    '2026-08-03T00:00:00Z'),
    thread('filed',       'resolved',         'normal', '2026-07-02T00:00:00Z', '2026-07-03T00:00:00Z'),
  ];

  it('puts unread-resolved on top, then needs-you, then with-sidekick', () => {
    expect(keys(inboxTiers(threads))).toEqual(['resolved-new', 'needs-you', 'with-sidekick']);
  });

  it('sorts the resolved-new tier oldest first, ignoring priority', () => {
    // 'res-new' is urgent and 'res-old' is low, but these are already closed —
    // this tier is a reading queue, not a work queue.
    expect(ids(inboxTiers(threads)[0].items)).toEqual(['res-old', 'res-new']);
  });

  it('sorts open tiers by priority desc, then longest-stale first', () => {
    expect(ids(inboxTiers(threads)[1].items)).toEqual(['need-hi-old', 'need-hi-new', 'need-low']);
  });

  it('keys the age tiebreak off updated_at, not created_at', () => {
    // Same severity, same created_at — only updated_at separates them, and the
    // one nothing has happened on the longest has to come first.
    const stale = [
      thread('fresh', 'needs_you', 'normal', '2026-08-07T00:00:00Z'),
      thread('stale', 'needs_you', 'normal', '2026-06-01T00:00:00Z'),
    ];
    expect(ids(inboxTiers(stale)[0].items)).toEqual(['stale', 'fresh']);
  });

  it('drops empty tiers so the divider rule can key off tiers.length', () => {
    expect(keys(inboxTiers([thread('a', 'needs_you', 'normal', '2026-08-01T00:00:00Z')]))).toEqual(['needs-you']);
    expect(keys(inboxTiers([]))).toEqual([]);
  });

  it('leaves nothing in the Inbox once everything is read and resolved', () => {
    const done = [thread('filed', 'resolved', 'normal', '2026-07-02T00:00:00Z', '2026-07-03T00:00:00Z')];
    expect(keys(inboxTiers(done))).toEqual([]);
  });

  it('does not mutate the caller array', () => {
    // `threads` is React state in MissionControl — sorting it in place would be
    // a mutation of state.
    const src = [
      thread('b', 'needs_you', 'low',    '2026-08-02T00:00:00Z'),
      thread('a', 'needs_you', 'urgent', '2026-08-01T00:00:00Z'),
    ];
    inboxTiers(src);
    expect(ids(src)).toEqual(['b', 'a']);
  });
});

describe('resolvedHistory', () => {
  it('holds only threads Luke has actually acknowledged', () => {
    const threads = [
      thread('unread', 'resolved',  'normal', '2026-08-01T00:00:00Z'),
      thread('filed',  'resolved',  'normal', '2026-07-02T00:00:00Z', '2026-07-03T00:00:00Z'),
      thread('open',   'needs_you', 'normal', '2026-08-01T00:00:00Z'),
    ];
    expect(ids(resolvedHistory(threads))).toEqual(['filed']);
  });
});

describe('isUnreadResolved', () => {
  it('is true only for a resolved thread with no read receipt', () => {
    expect(isUnreadResolved(thread('a', 'resolved',  'normal', '2026-08-01T00:00:00Z'))).toBe(true);
    expect(isUnreadResolved(thread('b', 'resolved',  'normal', '2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'))).toBe(false);
    expect(isUnreadResolved(thread('c', 'needs_you', 'normal', '2026-08-01T00:00:00Z'))).toBe(false);
  });
});
