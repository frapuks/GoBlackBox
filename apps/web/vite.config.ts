import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // host: true → écoute sur 0.0.0.0, sinon le port n'est pas joignable
    // depuis l'extérieur du conteneur.
    host: true,
    port: 5173,
    // Le bind-mount Docker ne propage pas les événements inotify sous Windows :
    // sans polling, le hot reload ne se déclenche jamais.
    watch: { usePolling: true, interval: 300 },
    proxy: {
      '/api': { target: 'http://api:3000', changeOrigin: true },
    },
  },
})
