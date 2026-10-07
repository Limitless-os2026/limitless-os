import { useState, type ReactNode } from 'react'
import { useBackend } from '../lib/SessionContext'

// Full-page messages shown instead of the app: missing settings, loading,
// and accounts that cannot use the app yet.

function Notice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="gate">
      <div className="gate__brand">Limitless OS</div>
      <main className="gate__card panel">
        <h1 className="gate__title">{title}</h1>
        {children}
      </main>
    </div>
  )
}

/** Shown when the Supabase settings are missing from this build. */
export function SetupNeeded() {
  return (
    <Notice title="Setup needed">
      <p>This copy of the app does not know which database to use yet.</p>
      <p>
        Add the two settings <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_KEY</code>, then build and deploy
        again. Both values are in the Supabase project under Project Settings, then API. The README explains where
        they go.
      </p>
    </Notice>
  )
}

export function Loading() {
  return (
    <Notice title="Loading">
      <p role="status">Getting your details…</p>
    </Notice>
  )
}

function SignOutButton() {
  const backend = useBackend()
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      className="button-plain"
      disabled={busy}
      onClick={() => {
        setBusy(true)
        backend.signOut().catch(() => setBusy(false))
      }}
    >
      Sign out
    </button>
  )
}

export function SwitchedOff() {
  return (
    <Notice title="Your account is switched off">
      <p>You can sign in, but this account cannot see anything. If that is a mistake, ask an Admin to switch it back on.</p>
      <SignOutButton />
    </Notice>
  )
}

export function NoProfile() {
  return (
    <Notice title="Your account is not set up">
      <p>This sign-in has no profile in Limitless OS. Ask an Admin to check your account.</p>
      <SignOutButton />
    </Notice>
  )
}

export function ProfileError({ retry }: { retry: () => void }) {
  return (
    <Notice title="Could not load your details">
      <p>Check the connection and try again.</p>
      <button type="button" className="button-next" onClick={retry}>
        Try again
      </button>
      <SignOutButton />
    </Notice>
  )
}
