// vehicles.js — thin query helpers for the veh_* tables. Mirrors fin.js: every
// function returns { data, error } and short-circuits to empty data when
// supabase is null (keeps tests/offline mode deterministic).
import { supabase } from './supabase';

const s = supabase;

// ── Fetch ─────────────────────────────────────────────────────────────────────

export async function fetchVehicles() {
  if (!s) return { data: [], error: null };
  return s.from('veh_vehicles').select('*').order('sort_order');
}

export async function fetchFuelLogs(vehicleId) {
  if (!s) return { data: [], error: null };
  let q = s.from('veh_fuel_logs').select('*').order('fill_date', { ascending: false });
  if (vehicleId) q = q.eq('vehicle_id', vehicleId);
  return q;
}

export async function fetchServiceVisits(vehicleId) {
  if (!s) return { data: [], error: null };
  let q = s.from('veh_service_visits').select('*').order('service_date', { ascending: false });
  if (vehicleId) q = q.eq('vehicle_id', vehicleId);
  return q;
}

export async function fetchServiceItems(visitId) {
  if (!s) return { data: [], error: null };
  return s.from('veh_service_items').select('*').eq('visit_id', visitId).order('sort_order');
}

// All items for a set of visit ids in one round trip (used by Service Log to
// compute per-visit item counts without an N+1 fetch per row).
export async function fetchServiceItemsForVisits(visitIds) {
  if (!s || !visitIds?.length) return { data: [], error: null };
  return s.from('veh_service_items').select('*').in('visit_id', visitIds).order('sort_order');
}

export async function fetchServicePlan(vehicleId) {
  if (!s) return { data: [], error: null };
  let q = s.from('veh_service_plan').select('*').order('sort_order');
  if (vehicleId) q = q.eq('vehicle_id', vehicleId);
  return q;
}

// ── Upsert / update ───────────────────────────────────────────────────────────

export async function upsertVehicle(row) {
  if (!s) return { error: { message: 'Not configured' } };
  const { id, ...rest } = row;
  if (id) return s.from('veh_vehicles').update(rest).eq('id', id).select();
  return s.from('veh_vehicles').insert(rest).select();
}

export async function upsertFuelLog(row) {
  if (!s) return { error: { message: 'Not configured' } };
  const { id, ...rest } = row;
  if (id) return s.from('veh_fuel_logs').update(rest).eq('id', id).select();
  return s.from('veh_fuel_logs').insert(rest).select();
}

export async function upsertServiceVisit(row) {
  if (!s) return { error: { message: 'Not configured' } };
  const { id, ...rest } = row;
  if (id) return s.from('veh_service_visits').update(rest).eq('id', id).select();
  return s.from('veh_service_visits').insert(rest).select();
}

export async function upsertServiceItem(row) {
  if (!s) return { error: { message: 'Not configured' } };
  const { id, ...rest } = row;
  if (id) return s.from('veh_service_items').update(rest).eq('id', id).select();
  return s.from('veh_service_items').insert(rest).select();
}

export async function upsertServicePlanRow(row) {
  if (!s) return { error: { message: 'Not configured' } };
  const { id, ...rest } = row;
  if (id) return s.from('veh_service_plan').update(rest).eq('id', id).select();
  return s.from('veh_service_plan').insert(rest).select();
}

// Re-export the generic helpers so callers only need one import surface.
export { deleteRow, updateRow, getPref, setPref } from './fin';
