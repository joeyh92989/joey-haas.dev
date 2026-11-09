import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import markdown from './vite-plugin-markdown.js'

export default defineConfig(({ command, mode }) => {
  // Shelfle's answer is picked from the salt (src/lib/dailyConfig.js). Dev
  // and tests fall back to 'dev', but a production build without it would
  // ship a guessable answer sequence, so the build stops instead.
  if (command === 'build') {
    const env = loadEnv(mode, process.cwd(), 'VITE_')
    if (!env.VITE_DAILY_SALT) {
      throw new Error(
        'VITE_DAILY_SALT is not set. Set it on the Render static site (any long random string), or in the environment for a local build.',
      )
    }
  }
  return {
    plugins: [markdown(), react()],
    server: {
      // In local dev, forward /api calls to the FastAPI server so no
      // VITE_API_URL is needed while developing.
      proxy: {
        '/api': 'http://localhost:8000',
      },
    },
  }
})
