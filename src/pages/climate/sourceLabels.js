// Shared source→label mapping for ac_change_log rows.
//
// ac_change_log.source is an internal identifier ('comfort_mode' predates the
// Schedule Override rename) — map it to the user-facing label here rather than
// touching the stored value, since other code still filters/writes on the raw
// string. Keep this the single source of truth: a future rename or a new
// `source` value only needs updating here.
export const SOURCE_LABELS = {
  comfort_mode: 'override',
};
