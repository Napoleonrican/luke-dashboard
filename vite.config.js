import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // process.env alone only has real OS/CI env vars (e.g. what Vercel injects
  // at build time) — it does NOT include values from a local .env file.
  // loadEnv() reads .env* from disk too, so this covers both local dev and
  // Vercel without one silently overriding the other with ''.
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') }

  return {
    plugins: [react()],
    // Explicitly substitute VITE_ env vars at build time so Vite 8 / OXC
    // picks them up regardless of how the transformer handles import.meta.env.
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL ?? ''),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY ?? ''),
      // Captured at build time so the Gig Ops header can show "last updated" —
      // there's no user-facing changelog, so the deploy date is the closest
      // honest signal of "when did this last change." VERCEL_GIT_COMMIT_SHA is
      // only present if "Automatically expose System Environment Variables" is
      // on for the project (Vercel → Settings → Environment Variables); falls
      // back to '' harmlessly if not, and the date still shows either way.
      'import.meta.env.VITE_BUILD_TIME': JSON.stringify(new Date().toISOString()),
      'import.meta.env.VITE_BUILD_SHA': JSON.stringify((env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7)),
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.js'],
      // Keep automatic JSX runtime for Vitest's esbuild transform path.
      esbuild: { jsx: 'automatic' },
    },
  }
})
