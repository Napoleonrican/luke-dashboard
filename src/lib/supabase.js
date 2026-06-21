import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key) : null;

// DEBUG — remove after confirming env vars are picked up
console.log('[supabase] url present:', !!url, '| key present:', !!key, '| client:', supabase ? 'OK' : 'NULL');
