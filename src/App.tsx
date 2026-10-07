import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, type createBrowserRouter } from 'react-router'
import type { Backend } from './lib/backend'
import { LocationProvider } from './lib/LocationContext'
import { SessionProvider, useSession } from './lib/SessionContext'
import { Loading, NoProfile, ProfileError, SwitchedOff } from './pages/Notices'
import { SignIn } from './pages/SignIn'

type AppRouter = ReturnType<typeof createBrowserRouter>

interface AppProps {
  backend: Backend
  router: AppRouter
  queryClient?: QueryClient
}

// Signed-out visitors see only the sign-in screen, whatever address they
// opened. Once signed in, they land on the address they asked for.
export function App({ backend, router, queryClient }: AppProps) {
  const [client] = useState(() => queryClient ?? new QueryClient())
  return (
    <QueryClientProvider client={client}>
      <SessionProvider backend={backend}>
        <Gate router={router} />
      </SessionProvider>
    </QueryClientProvider>
  )
}

function Gate({ router }: { router: AppRouter }) {
  const session = useSession()
  switch (session.status) {
    case 'checking':
    case 'loading-profile':
      return <Loading />
    case 'signed-out':
      return <SignIn />
    case 'no-profile':
      return <NoProfile />
    case 'profile-error':
      return <ProfileError retry={session.retry} />
    case 'switched-off':
      return <SwitchedOff />
    case 'signed-in':
      return (
        <LocationProvider>
          <RouterProvider router={router} />
        </LocationProvider>
      )
  }
}
