import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key) : null;

// True only when an error genuinely means "this table does not exist yet"
// (a migration hasn't been run), NOT for transient network / RLS / aborted-
// request errors. PostgREST reports a missing table as PGRST205 ("Could not
// find the table … in the schema cache") and Postgres as 42P01
// (undefined_table); both are precise, so we key off the codes and only fall
// back to a narrow "does not exist / schema cache" message match.
//
// Do NOT loosen this to match a table name appearing anywhere in the message:
// a flaky mobile connection can surface a transient error whose text mentions
// the table, and treating that as "table missing" pops a scary, wrong
// "run the migration" banner (see personal-assistant #147 / backlog #13).
export const isMissingTableError = (error) =>
  !!error && (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    /could not find the table|schema cache|relation .* does not exist|undefined table/i
      .test(error.message || '')
  );
