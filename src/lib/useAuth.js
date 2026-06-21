import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

// Real (server-validated) auth state backed by Supabase Auth. Unlike the
// hardcoded-password ProtectedRoute, the session here is verified by Supabase,
// the JWT is refreshed automatically, and nothing sensitive lives in the bundle.
// Used to gate the financial modules; other routes are unaffected.
export function useAuth() {
  const [session, setSession] = useState(null);
  // Start "not loading" when Supabase is absent — there's nothing to resolve.
  const [loading, setLoading] = useState(!!supabase);

  useEffect(() => {
    if (!supabase) return;

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    // Fires on sign-in / sign-out / token refresh across tabs and devices.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null);
    });

    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  const signIn = useCallback(async (email, password) => {
    if (!supabase) return { error: { message: 'Supabase not configured.' } };
    return supabase.auth.signInWithPassword({ email, password });
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  return { session, loading, signIn, signOut, configured: !!supabase };
}
