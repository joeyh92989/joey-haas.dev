import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import markdown from './vite-plugin-markdown.js'

export default defineConfig({
  plugins: [markdown(), react()],
  server: {
    // In local dev, forward /api calls to the FastAPI server so no
    // VITE_API_URL is needed while developing.
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
