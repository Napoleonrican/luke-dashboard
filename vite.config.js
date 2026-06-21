import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Explicitly substitute VITE_ env vars at build time so Vite 8 / OXC
  // picks them up regardless of how the transformer handles import.meta.env.
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.VITE_SUPABASE_URL ?? ''),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY ?? ''),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    // Keep automatic JSX runtime for Vitest's esbuild transform path.
    esbuild: { jsx: 'automatic' },
  },
})
