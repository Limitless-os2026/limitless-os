import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { registerSW } from 'virtual:pwa-register'

// Fonts ship inside the app so the installed app works with no signal.
import '@fontsource/barlow/latin-400.css'
import '@fontsource/barlow/latin-500.css'
import '@fontsource/barlow/latin-600.css'
import '@fontsource/barlow-semi-condensed/latin-600.css'
import './styles/tokens.css'
import './styles/app.css'

import { LocationProvider } from './lib/LocationContext'
import { routes } from './routes'

const queryClient = new QueryClient()
const router = createBrowserRouter(routes)

registerSW({ immediate: true })

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LocationProvider>
        <RouterProvider router={router} />
      </LocationProvider>
    </QueryClientProvider>
  </StrictMode>,
)
