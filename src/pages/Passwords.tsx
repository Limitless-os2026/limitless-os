import { useId, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { friendlyMessage } from '../lib/backend'
import { MINIMUM_PASSWORD_LENGTH, newPasswordProblem } from '../lib/people'
import { useBackend } from '../lib/SessionContext'
import { Notice, SignOutButton } from './Notices'

// Shown instead of the app to someone who signed in with a temporary
// password from an Admin. They choose their own before anything else.
export function ChoosePassword() {
  const backend = useBackend()
  const queryClient = useQueryClient()
  const [password, setPassword] = useState('')
  const [repeated, setRepeated] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const problem = newPasswordProblem(password, repeated)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await backend.changeMyPassword(password)
      await queryClient.invalidateQueries({ queryKey: ['signed-in-person'] })
    } catch (caught) {
      setError(friendlyMessage(caught, 'Could not save your password. Check the connection and try again.'))
      setBusy(false)
    }
  }

  return (
    <Notice title="Choose your password">
      <p>You signed in with a temporary password. Choose your own to start using Limitless OS.</p>
      <form className="form" onSubmit={onSubmit} noValidate>
        <NewPasswordFields password={password} repeated={repeated} onPassword={setPassword} onRepeated={setRepeated} />
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button type="submit" className="button-next" disabled={busy}>
          {busy ? 'Saving…' : 'Save my password'}
        </button>
      </form>
      <SignOutButton />
    </Notice>
  )
}

export function NewPasswordFields({
  password,
  repeated,
  onPassword,
  onRepeated,
}: {
  password: string
  repeated: string
  onPassword: (value: string) => void
  onRepeated: (value: string) => void
}) {
  const hint = useId()
  return (
    <>
      <label className="field">
        New password
        <input
          type="password"
          autoComplete="new-password"
          aria-describedby={hint}
          value={password}
          onChange={(event) => onPassword(event.target.value)}
        />
      </label>
      <p id={hint} className="field__hint">
        At least {MINIMUM_PASSWORD_LENGTH} characters.
      </p>
      <label className="field">
        New password again
        <input
          type="password"
          autoComplete="new-password"
          value={repeated}
          onChange={(event) => onRepeated(event.target.value)}
        />
      </label>
    </>
  )
}

// A temporary password, shown once to the Admin who made it.
export function TemporaryPassword({ name, password }: { name: string; password: string }) {
  const [copied, setCopied] = useState(false)
  const canCopy = typeof navigator !== 'undefined' && Boolean(navigator.clipboard)

  return (
    <section className="temporary-password" aria-label="Temporary password">
      <p>Temporary password for {name}:</p>
      <p className="temporary-password__value">{password}</p>
      <p className="muted">
        This is the only time it shows. Give it to them in person or by phone. No email is sent. They choose their own
        password the first time they sign in.
      </p>
      {canCopy && (
        <button
          type="button"
          className="button-plain"
          onClick={() => {
            navigator.clipboard
              .writeText(password)
              .then(() => setCopied(true))
              .catch(() => setCopied(false))
          }}
        >
          {copied ? 'Copied' : 'Copy password'}
        </button>
      )}
    </section>
  )
}
