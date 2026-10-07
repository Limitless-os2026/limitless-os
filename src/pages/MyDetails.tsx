import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '../components/PageHeader'
import { friendlyMessage } from '../lib/backend'
import { newPasswordProblem, type MyDetails as Details } from '../lib/people'
import { useBackend, useSignedInPerson } from '../lib/SessionContext'
import { NewPasswordFields } from './Passwords'

// Everyone's own page: their name and phone, and their password. Nothing
// else about themselves; an Admin changes role and offices on People.
export function MyDetails() {
  const me = useSignedInPerson()
  return (
    <>
      <PageHeader eyebrow={me.email} title="My details" locationFilter={false} />
      <DetailsForm />
      <PasswordForm />
    </>
  )
}

function DetailsForm() {
  const backend = useBackend()
  const me = useSignedInPerson()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<Details>({
    firstName: me.firstName ?? '',
    lastName: me.lastName ?? '',
    phone: me.phone ?? '',
  })
  const [message, setMessage] = useState<{ text: string; problem: boolean } | null>(null)

  const save = useMutation({
    mutationFn: (details: Details) => backend.updateMyDetails(details),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['signed-in-person'] })
      await queryClient.invalidateQueries({ queryKey: ['people'] })
      setMessage({ text: 'Saved.', problem: false })
    },
    onError: (caught) =>
      setMessage({ text: friendlyMessage(caught, 'Could not save. Check the connection and try again.'), problem: true }),
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setMessage(null)
    save.mutate(form)
  }

  return (
    <form className="panel form form--panel" onSubmit={onSubmit} noValidate aria-label="Name and phone">
      <div className="form__row">
        <label className="field">
          First name
          <input
            type="text"
            autoComplete="given-name"
            value={form.firstName}
            onChange={(event) => setForm({ ...form, firstName: event.target.value })}
          />
        </label>
        <label className="field">
          Last name
          <input
            type="text"
            autoComplete="family-name"
            value={form.lastName}
            onChange={(event) => setForm({ ...form, lastName: event.target.value })}
          />
        </label>
      </div>
      <label className="field">
        Phone
        <input
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          value={form.phone}
          onChange={(event) => setForm({ ...form, phone: event.target.value })}
        />
      </label>
      {message && (
        <p role={message.problem ? 'alert' : 'status'} className={message.problem ? 'form-error' : 'muted'}>
          {message.text}
        </p>
      )}
      <div className="form__actions">
        <button type="submit" className="button-next" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save my details'}
        </button>
      </div>
    </form>
  )
}

function PasswordForm() {
  const backend = useBackend()
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [repeated, setRepeated] = useState('')
  const [message, setMessage] = useState<{ text: string; problem: boolean } | null>(null)

  const change = useMutation({
    mutationFn: () => backend.changeMyPassword(password, current),
    onSuccess: () => {
      setCurrent('')
      setPassword('')
      setRepeated('')
      setMessage({ text: 'Your password is changed.', problem: false })
    },
    onError: (caught) =>
      setMessage({
        text: friendlyMessage(caught, 'Could not change your password. Check the connection and try again.'),
        problem: true,
      }),
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!current) {
      setMessage({ text: 'Enter your current password.', problem: true })
      return
    }
    const problem = newPasswordProblem(password, repeated)
    if (problem) {
      setMessage({ text: problem, problem: true })
      return
    }
    setMessage(null)
    change.mutate()
  }

  return (
    <form className="panel form form--panel" onSubmit={onSubmit} noValidate aria-label="Change password">
      <h2 className="form__title">Change password</h2>
      <label className="field">
        Current password
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
        />
      </label>
      <NewPasswordFields password={password} repeated={repeated} onPassword={setPassword} onRepeated={setRepeated} />
      {message && (
        <p role={message.problem ? 'alert' : 'status'} className={message.problem ? 'form-error' : 'muted'}>
          {message.text}
        </p>
      )}
      <button type="submit" className="button-plain" disabled={change.isPending}>
        {change.isPending ? 'Changing…' : 'Change password'}
      </button>
    </form>
  )
}
