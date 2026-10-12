import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const developmentServer = process.env.DEV_SERVER_URL
  ?? 'http://localhost:' + (process.env.PORT ?? '3001')

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': developmentServer,
      '/health': developmentServer,
      '/socket.io': {
        target: developmentServer,
        ws: true,
      },
    },
  },
})
