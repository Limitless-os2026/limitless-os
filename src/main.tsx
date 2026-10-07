import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { registerSW } from 'virtual:pwa-register'

// Fonts ship inside the app so the installed app works with no signal.
import '@fontsource/barlow/latin-400.css'
import '@fontsource/barlow/latin-500.css'
import '@fontsource/barlow/latin-600.css'
import '@fontsource/barlow-semi-condensed/latin-600.css'
import './styles/tokens.css'
import './styles/app.css'

import { App } from './App'
import { createSupabaseBackend, readSupabaseSettings } from './lib/supabaseBackend'
import { SetupNeeded } from './pages/Notices'
import { routes } from './routes'

registerSW({ immediate: true })

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

const settings = readSupabaseSettings(import.meta.env)

createRoot(root).render(
  <StrictMode>
    {settings ? (
      <App backend={createSupabaseBackend(settings)} router={createBrowserRouter(routes)} />
    ) : (
      <SetupNeeded />
    )}
  </StrictMode>,
)
