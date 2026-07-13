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
