import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Backend (Hono) dev server. Override via VITE_BACKEND_ORIGIN if needed.
const BACKEND_ORIGIN = process.env.VITE_BACKEND_ORIGIN ?? 'http://localhost:3000'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // REST API
      '/api': {
        target: BACKEND_ORIGIN,
        changeOrigin: true,
      },
      // Generated images served by the backend under /static
      '/static': {
        target: BACKEND_ORIGIN,
        changeOrigin: true,
      },
    },
  },
})
