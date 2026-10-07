import { useState, type FormEvent } from 'react'
import { friendlyMessage } from '../lib/backend'
import { useBackend } from '../lib/SessionContext'

// The only screen a signed-out visitor sees. There is no sign-up: an Admin
// adds people.
export function SignIn() {
  const backend = useBackend()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await backend.signIn(email, password)
    } catch (caught) {
      setError(friendlyMessage(caught, 'Sign-in did not work. Try again.'))
      setBusy(false)
    }
  }

  return (
    <div className="gate">
      <div className="gate__brand">Limitless OS</div>
      <main className="gate__card panel">
        <h1 className="gate__title">Sign in</h1>
        <form className="form" onSubmit={onSubmit} noValidate>
          <label className="field">
            Email
            <input
              type="email"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="field">
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button type="submit" className="button-next" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="gate__note">No account yet? Ask an Admin to add you.</p>
      </main>
    </div>
  )
}
