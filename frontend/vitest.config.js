import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * Separate from vite.config.js so the markdown plugin is not loaded for tests,
 * which have no markdown to compile.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
