import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // In local dev, forward /api calls to the FastAPI server so no
    // VITE_API_URL is needed while developing.
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
