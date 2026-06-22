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

export async function deleteRow(table, id) {
  if (!s) return { error: { message: 'Not configured' } };
  return s.from(table).delete().eq('id', id);
}
