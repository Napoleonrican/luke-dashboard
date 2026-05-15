import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Diagnostic: log what the build sees (will appear in browser console)
console.log('[Supabase] URL present:', !!url, url ? `(starts with ${url.slice(0, 20)}...)` : '(EMPTY)');
console.log('[Supabase] Key present:', !!key, key ? `(starts with ${key.slice(0, 12)}...)` : '(EMPTY)');

export const supabase = url && key ? createClient(url, key) : null;

console.log('[Supabase] Client initialized:', !!supabase);
