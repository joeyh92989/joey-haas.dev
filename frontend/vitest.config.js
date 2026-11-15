import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

/**
 * Separate from vite.config.js so the markdown plugin is not loaded for tests,
 * which have no markdown to compile.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.js'],
    // A ceiling, not a delay: see docs/planning/2026-11-15-admin-test-load-design.md
    testTimeout: 30000,
    hookTimeout: 30000,
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
