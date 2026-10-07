import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'

// Fonts ship inside the app so the installed app works with no signal.
import '@fontsource/barlow/latin-400.css'
import '@fontsource/barlow/latin-500.css'
import '@fontsource/barlow/latin-600.css'
import '@fontsource/barlow-semi-condensed/latin-600.css'
import './styles/tokens.css'
import './styles/app.css'

import { App } from './App'
import { UpdateBar } from './components/UpdateBar'
import { watchPublishedVersion } from './lib/publishedVersion'
import { startServiceWorker } from './lib/serviceWorker'
import { createSupabaseBackend, readSupabaseSettings } from './lib/supabaseBackend'
import { APP_VERSION } from './lib/version'
import { SetupNeeded } from './pages/Notices'
import { routes } from './routes'

// The installed app keeps a saved copy of itself. When a newer version is
// published, the service worker brings it in and takes over by itself; the
// page then switches when nothing has been typed, or shows the Update ready
// bar. See lib/appUpdate.ts. The worker is only built for production builds.
const worker = startServiceWorker(import.meta.env.PROD && 'serviceWorker' in navigator ? navigator.serviceWorker : undefined)

// Second safety net, independent of the worker: compare with the version
// file on the server when the app opens or comes back to the foreground.
watchPublishedVersion({
  current: APP_VERSION,
  onBehind: (published) => void worker.catchUp(published),
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
