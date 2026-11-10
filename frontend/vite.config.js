import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'
import { snapshotPresence } from './scripts/snapshot-presence.mjs'
import markdown from './vite-plugin-markdown.js'

const SNAPSHOT_DIR = fileURLToPath(
  new URL('./public/snapshot', import.meta.url),
)

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
    // Whether Comics and Denver have anything to show (#125), read once from
    // the snapshot fetch-snapshot.mjs has just written. src/lib/snapshotPresence.js.
    define: {
      __SNAPSHOT_PRESENCE__: JSON.stringify(snapshotPresence(SNAPSHOT_DIR)),
    },
    server: {
      // In local dev, forward /api calls to the FastAPI server so no
      // VITE_API_URL is needed while developing.
      proxy: {
        '/api': 'http://localhost:8000',
      },
    },
  }
})
