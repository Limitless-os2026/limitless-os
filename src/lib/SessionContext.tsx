import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Backend, SessionUser } from './backend'
import type { SignedInPerson } from './people'

// Who is signed in on this device, and the server they talk to.

const BackendContext = createContext<Backend | null>(null)

export function useBackend(): Backend {
  const backend = useContext(BackendContext)
  if (!backend) throw new Error('useBackend must be used inside SessionProvider')
  return backend
}

export type SessionState =
  | { status: 'checking' }
  | { status: 'signed-out' }
  | { status: 'loading-profile'; user: SessionUser }
  | { status: 'no-profile'; user: SessionUser }
  | { status: 'profile-error'; user: SessionUser; retry: () => void }
  | { status: 'switched-off'; user: SessionUser; person: SignedInPerson }
  | { status: 'needs-password'; user: SessionUser; person: SignedInPerson }
  | { status: 'signed-in'; user: SessionUser; person: SignedInPerson }

const SessionContext = createContext<SessionState | null>(null)

export function SessionProvider({ backend, children }: { backend: Backend; children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined)

  useEffect(() => {
    let current = true
    backend
      .currentUser()
      .then((found) => {
        if (current) setUser((existing) => (existing === undefined ? found : existing))
      })
      .catch(() => {
        if (current) setUser((existing) => (existing === undefined ? null : existing))
      })
    const stop = backend.onUserChange((next) => {
      if (!current) return
      setUser((existing) => {
        // Signing out, or a different person signing in, must not leave the
        // last person's data on screen.
        if (existing?.id !== next?.id) queryClient.clear()
        return next
      })
    })
    return () => {
      current = false
      stop()
    }
  }, [backend, queryClient])

  const profile = useQuery({
    queryKey: ['signed-in-person', user?.id],
    queryFn: () => backend.loadSignedInPerson(user?.id ?? ''),
    enabled: Boolean(user),
  })

  const state = useMemo((): SessionState => {
    if (user === undefined) return { status: 'checking' }
    if (user === null) return { status: 'signed-out' }
    if (profile.isPending && profile.fetchStatus !== 'idle') return { status: 'loading-profile', user }
    if (profile.isError) return { status: 'profile-error', user, retry: () => void profile.refetch() }
    const person = profile.data
    if (!person) return profile.isPending ? { status: 'loading-profile', user } : { status: 'no-profile', user }
    if (!person.isActive) return { status: 'switched-off', user, person }
    if (person.mustChangePassword) return { status: 'needs-password', user, person }
    return { status: 'signed-in', user, person }
  }, [user, profile])

  return (
    <BackendContext.Provider value={backend}>
      <SessionContext.Provider value={state}>{children}</SessionContext.Provider>
    </BackendContext.Provider>
  )
}

export function useSession(): SessionState {
  const state = useContext(SessionContext)
  if (!state) throw new Error('useSession must be used inside SessionProvider')
  return state
}

/** The signed-in person. Only for screens shown after sign-in. */
export function useSignedInPerson(): SignedInPerson {
  const state = useSession()
  if (state.status !== 'signed-in') throw new Error('useSignedInPerson needs a signed-in person')
  return state.person
}
