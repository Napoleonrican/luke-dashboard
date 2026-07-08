// fin.js — thin query helpers for the fin_* tables.
// All functions return { data, error } matching Supabase conventions.
import { supabase } from './supabase';

const s = supabase; // alias so callers can check if null

// ── Fetch ─────────────────────────────────────────────────────────────────────

export async function fetchAccounts() {
  if (!s) return { data: [], error: null };
  return s.from('fin_accounts').select('*').order('sort_order');
}

export async function fetchBills() {
  if (!s) return { data: [], error: null };
  return s.from('fin_bills').select('*').order('sort_order');
}

export async function fetchDebts() {
  if (!s) return { data: [], error: null };
  return s.from('fin_debts').select('*').order('sort_order');
}

export async function fetchDigitalSubs() {
  if (!s) return { data: [], error: null };
  return s.from('fin_digital_subscriptions').select('*').order('sort_order');
}

export async function fetchConsumableSubs() {
  if (!s) return { data: [], error: null };
  return s.from('fin_consumable_subscriptions').select('*').order('sort_order');
}

export async function fetchInputs() {
  if (!s) return { data: [], error: null };
  return s.from('fin_inputs').select('*').order('slug');
}

export async function fetchSubSnapshots() {
  if (!s) return { data: [], error: null };
  return s.from('fin_subscription_snapshots').select('*').order('taken_on', { ascending: false });
}

// ── Runway: ad-hoc manual items + On Deck state ───────────────────────────────

export async function fetchRunwayManual() {
  if (!s) return { data: [], error: null };
  return s.from('fin_runway_manual').select('*').order('sort_order');
}

export async function fetchRunwayDeck() {
  if (!s) return { data: [], error: null };
  return s.from('fin_runway_deck').select('*');
}

// ── Earnin transaction log ────────────────────────────────────────────────────

export async function fetchEarninTransactions() {
  if (!s) return { data: [], error: null };
  return s.from('fin_earnin_transactions').select('*').order('txn_date', { ascending: false }).order('created_at', { ascending: false });
}

export async function upsertEarninTransaction(row) {
  if (!s) return { error: { message: 'Not configured' } };
  const { id, ...rest } = row;
  if (id) return s.from('fin_earnin_transactions').update(rest).eq('id', id).select();
  return s.from('fin_earnin_transactions').insert(rest).select();
}

// ── Upsert / update ───────────────────────────────────────────────────────────

export async function upsertAccount(row) {
  if (!s) return { error: { message: 'Not configured' } };
  const { id, ...rest } = row;
  if (id) return s.from('fin_accounts').update(rest).eq('id', id).select();
  return s.from('fin_accounts').insert(rest).select();
}

export async function upsertBill(row) {
  if (!s) return { error: { message: 'Not configured' } };
  const { id, ...rest } = row;
  if (id) return s.from('fin_bills').update(rest).eq('id', id).select();
  return s.from('fin_bills').insert(rest).select();
}

export async function upsertDebt(row) {
  if (!s) return { error: { message: 'Not configured' } };
  const { id, ...rest } = row;
  if (id) return s.from('fin_debts').update(rest).eq('id', id).select();
  return s.from('fin_debts').insert(rest).select();
}

export async function upsertDigitalSub(row) {
  if (!s) return { error: { message: 'Not configured' } };
  const { id, ...rest } = row;
  if (id) return s.from('fin_digital_subscriptions').update(rest).eq('id', id).select();
  return s.from('fin_digital_subscriptions').insert(rest).select();
}

export async function upsertConsumableSub(row) {
  if (!s) return { error: { message: 'Not configured' } };
  const { id, ...rest } = row;
  if (id) return s.from('fin_consumable_subscriptions').update(rest).eq('id', id).select();
  return s.from('fin_consumable_subscriptions').insert(rest).select();
}

export async function upsertInput(row) {
  if (!s) return { error: { message: 'Not configured' } };
  const { id, ...rest } = row;
  if (id) return s.from('fin_inputs').update(rest).eq('id', id).select();
  return s.from('fin_inputs').insert(rest).select();
}

export async function insertSubSnapshot(row) {
  if (!s) return { error: { message: 'Not configured' } };
  return s.from('fin_subscription_snapshots').insert(row).select();
}

export async function upsertRunwayManual(row) {
  if (!s) return { error: { message: 'Not configured' } };
  const { id, ...rest } = row;
  if (id) return s.from('fin_runway_manual').update(rest).eq('id', id).select();
  return s.from('fin_runway_manual').insert(rest).select();
}

// Move a source item On Deck (idempotent — one row per source item).
export async function addToDeck(source_kind, source_id) {
  if (!s) return { error: { message: 'Not configured' } };
  return s.from('fin_runway_deck')
    .upsert({ source_kind, source_id }, { onConflict: 'owner,source_kind,source_id' })
    .select();
}

export async function updateDeck(id, fields) {
  if (!s) return { error: { message: 'Not configured' } };
  return s.from('fin_runway_deck').update(fields).eq('id', id).select();
}

export async function deleteRow(table, id) {
  if (!s) return { error: { message: 'Not configured' } };
  return s.from(table).delete().eq('id', id);
}

// Generic single-row update (used by the Runway "advance due date" action,
// which writes back to whichever source table an item came from).
export async function updateRow(table, id, fields) {
  if (!s) return { error: { message: 'Not configured' } };
  return s.from(table).update(fields).eq('id', id).select();
}

// ── UI preferences (cross-device, owner-scoped) ───────────────────────────────

export async function getPref(key) {
  if (!s) return { data: null, error: null };
  const { data, error } = await s.from('fin_prefs').select('value').eq('key', key).maybeSingle();
  return { data: data?.value ?? null, error };
}

export async function setPref(key, value) {
  if (!s) return { error: { message: 'Not configured' } };
  return s.from('fin_prefs').upsert({ key, value }, { onConflict: 'owner,key' });
}
