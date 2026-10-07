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
import { UpdateBar } from './components/UpdateBar'
import { checkForUpdates, markUpdateReady } from './lib/appUpdate'
import { createSupabaseBackend, readSupabaseSettings } from './lib/supabaseBackend'
import { SetupNeeded } from './pages/Notices'
import { routes } from './routes'

// A newer version waits until the person taps Refresh on the Update ready
// bar, so nobody loses what they are typing, and nobody stays on an old copy
// without knowing.
const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh: () => markUpdateReady(() => updateServiceWorker()),
  onRegisteredSW: (_url, registration) => {
    if (registration) checkForUpdates(registration)
  },
})

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

const settings = readSupabaseSettings(import.meta.env)

createRoot(root).render(
  <StrictMode>
    <UpdateBar />
    {settings ? (
      <App backend={createSupabaseBackend(settings)} router={createBrowserRouter(routes)} />
    ) : (
      <SetupNeeded />
    )}
  </StrictMode>,
)
