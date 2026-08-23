import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from './App'
import { theme } from './theme'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: true },
  },
})

// Enregistré au démarrage, mais il ne fait RIEN tant que l'utilisateur n'a pas
// activé les notifications : ce service worker n'a pas de gestionnaire `fetch`,
// donc il n'intercepte ni ne met en cache quoi que ce soit.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Contexte non sécurisé ou navigateur récalcitrant : l'app fonctionne
      // sans, seules les notifications seront indisponibles.
    })
  })
}

const root = document.getElementById('root')
if (!root) throw new Error('#root introuvable')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
