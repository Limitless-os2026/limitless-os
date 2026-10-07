import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '../components/PageHeader'
import { friendlyMessage } from '../lib/backend'
import { useLocations } from '../lib/LocationContext'
import { officeLabel, type Locations } from '../lib/locations'
import {
  canManagePeople,
  displayName,
  formFor,
  newPersonFrom,
  personChangeFrom,
  type NewPerson,
  type NewPersonForm,
  type Person,
  type PersonChange,
  type PersonForm,
  type Role,
} from '../lib/people'
import { useBackend, useSignedInPerson } from '../lib/SessionContext'
import { TemporaryPassword } from './Passwords'

// The People screen, for Admins: everyone who can sign in, with their role,
// offices and whether they are switched on. Admins add people here and give
// them temporary passwords. Other roles cannot open it.

function usePeopleData() {
  const backend = useBackend()
  const people = useQuery({ queryKey: ['people'], queryFn: () => backend.loadPeople() })
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => backend.loadRoles() })
  const locations = useLocations()
  return { people, roles, locations }
}

function NotAllowed() {
  return (
    <>
      <PageHeader title="People" locationFilter={false} />
      <section className="panel placeholder">
        <h2 className="placeholder__title">Only an Admin can open this screen</h2>
        <p>Ask an Admin if your role or offices need to change.</p>
        <Link to="/" className="text-link">
          Back to home
        </Link>
      </section>
    </>
  )
}

function LoadProblem({ retry }: { retry: () => void }) {
  return (
    <section className="panel placeholder">
      <p role="alert">Could not load the people list. Check the connection and try again.</p>
      <button type="button" className="button-plain" onClick={retry}>
        Try again
      </button>
    </section>
  )
}

function officesText(person: Person, locations: Locations | undefined): string {
  if (person.officeIds.length === 0) return 'No office'
  if (!locations) return ''
  // Main office first.
  const ids = [...person.officeIds].sort((a, b) => Number(b === person.primaryOfficeId) - Number(a === person.primaryOfficeId))
  return ids
    .map((id) => locations.offices.find((office) => office.id === id))
    .filter((office) => office !== undefined)
    .map((office) => officeLabel(office, locations.states))
    .join(', ')
}

export function People() {
  const me = useSignedInPerson()
  if (!canManagePeople(me)) return <NotAllowed />
  return <PeopleList />
}

function PeopleList() {
  const { people, roles, locations } = usePeopleData()
  const roleName = (id: string) => roles.data?.find((role) => role.id === id)?.name ?? ''

  return (
    <>
      <PageHeader title="People" locationFilter={false} />
      <div className="page-actions">
        <Link to="/people/new" className="button-next">
          Add person
        </Link>
      </div>
      {people.isError || roles.isError ? (
        <LoadProblem
          retry={() => {
            void people.refetch()
            void roles.refetch()
          }}
        />
      ) : people.isPending || roles.isPending ? (
        <p role="status" className="muted">
          Loading people…
        </p>
      ) : (
        <section aria-label="Everyone who can sign in" className="panel">
          {people.data.map((person) => (
            <Link key={person.id} to={`/people/${person.id}`} className="person-row">
              <div className="person-row__who">
                <div className="person-row__name">{displayName(person)}</div>
                {displayName(person) !== person.email && <div className="person-row__email">{person.email}</div>}
              </div>
              <div className="person-row__role">{roleName(person.roleId)}</div>
              <div className="person-row__offices">{officesText(person, locations.data)}</div>
              <div className="person-row__status">{person.isActive ? 'Active' : 'Switched off'}</div>
            </Link>
          ))}
        </section>
      )}
      <section className="panel help">
        <h2 className="help__title">Adding someone</h2>
        <p>
          Tap Add person and enter their name, email, role and offices. The app makes a temporary password and shows it
          to you once. No email is sent, so give it to them yourself. They choose their own password when they first
          sign in.
        </p>
        <p>
          If someone forgets their password, open them here and tap Reset password. To stop someone signing in, switch
          them off here. People are never deleted, so their history stays.
        </p>
      </section>
    </>
  )
}

export function PersonEdit() {
  const me = useSignedInPerson()
  if (!canManagePeople(me)) return <NotAllowed />
  return <PersonEditLoader />
}

function PersonEditLoader() {
  const { personId } = useParams()
  const { people, roles, locations } = usePeopleData()

  if (people.isError || roles.isError || locations.isError) {
    return (
      <>
        <PageHeader title="Person" locationFilter={false} />
        <LoadProblem
          retry={() => {
            void people.refetch()
            void roles.refetch()
            void locations.refetch()
          }}
        />
      </>
    )
  }
  if (people.isPending || roles.isPending || locations.isPending) {
    return (
      <>
        <PageHeader title="Person" locationFilter={false} />
        <p role="status" className="muted">
          Loading…
        </p>
      </>
    )
  }

  const person = people.data.find((candidate) => candidate.id === personId)
  if (!person) {
    return (
      <>
        <PageHeader title="Person not found" locationFilter={false} />
        <section className="panel placeholder">
          <Link to="/people" className="text-link">
            Back to people
          </Link>
        </section>
      </>
    )
  }
  return <PersonEditForm key={person.id} person={person} roles={roles.data} locations={locations.data} />
}

function PersonEditForm({ person, roles, locations }: { person: Person; roles: Role[]; locations: Locations }) {
  const backend = useBackend()
  const me = useSignedInPerson()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [form, setForm] = useState<PersonForm>(() => formFor(person))
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: (change: PersonChange) => backend.updatePerson(change),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['people'] })
      if (person.id === me.id) await queryClient.invalidateQueries({ queryKey: ['signed-in-person'] })
      navigate('/people')
    },
    onError: (caught) => setError(friendlyMessage(caught, 'Could not save. Check the connection and try again.')),
  })

  // Switched-off offices stay listed only for people already in them.
  const offices = locations.offices.filter((office) => office.isActive || person.officeIds.includes(office.id))

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const result = personChangeFrom(person.id, form)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setError(null)
    save.mutate(result.change)
  }

  return (
    <>
      <PageHeader eyebrow={person.email} title={displayName(person)} locationFilter={false} />
      <form className="panel form form--panel" onSubmit={onSubmit} noValidate>
        <div className="form__row">
          <label className="field">
            First name
            <input
              type="text"
              autoComplete="off"
              value={form.firstName}
              onChange={(event) => setForm({ ...form, firstName: event.target.value })}
            />
          </label>
          <label className="field">
            Last name
            <input
              type="text"
              autoComplete="off"
              value={form.lastName}
              onChange={(event) => setForm({ ...form, lastName: event.target.value })}
            />
          </label>
        </div>

        <label className="field">
          Role
          <select value={form.roleId} onChange={(event) => setForm({ ...form, roleId: event.target.value })}>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </label>

        <OfficePicker
          offices={offices}
          locations={locations}
          officeIds={form.officeIds}
          primaryOfficeId={form.primaryOfficeId}
          onChange={(officeIds, primaryOfficeId) => setForm({ ...form, officeIds, primaryOfficeId })}
        />

        <label className="check">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
          />
          Can sign in and use the app
        </label>

        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}

        <div className="form__actions">
          <button type="submit" className="button-next" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
          <Link to="/people" className="text-link">
            Cancel
          </Link>
        </div>
      </form>
      <ResetPassword person={person} />
    </>
  )
}

function OfficePicker({
  offices,
  locations,
  officeIds,
  primaryOfficeId,
  onChange,
}: {
  offices: Locations['offices']
  locations: Locations
  officeIds: string[]
  primaryOfficeId: string | null
  onChange: (officeIds: string[], primaryOfficeId: string | null) => void
}) {
  const chosenOffices = offices.filter((office) => officeIds.includes(office.id))

  return (
    <>
      <fieldset className="field-group">
        <legend>Offices</legend>
        {offices.map((office) => (
          <label key={office.id} className="check">
            <input
              type="checkbox"
              checked={officeIds.includes(office.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked ? [...officeIds, office.id] : officeIds.filter((id) => id !== office.id),
                  primaryOfficeId,
                )
              }
            />
            {officeLabel(office, locations.states)}
          </label>
        ))}
      </fieldset>

      {chosenOffices.length > 1 && (
        <label className="field">
          Main office
          <select
            value={primaryOfficeId && officeIds.includes(primaryOfficeId) ? primaryOfficeId : ''}
            onChange={(event) => onChange(officeIds, event.target.value || null)}
          >
            <option value="">Pick one</option>
            {chosenOffices.map((office) => (
              <option key={office.id} value={office.id}>
                {officeLabel(office, locations.states)}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  )
}

// A new temporary password for someone who forgot theirs. Asks once more
// before doing it, because their current password stops working.
function ResetPassword({ person }: { person: Person }) {
  const backend = useBackend()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = useMutation({
    mutationFn: () => backend.resetPassword(person.id),
    onMutate: () => setError(null),
    onError: (caught) => setError(friendlyMessage(caught, 'Could not reset the password. Check the connection and try again.')),
  })

  return (
    <section className="panel form form--panel" aria-label="Password">
      <h2 className="form__title">Password</h2>
      {reset.data ? (
        <TemporaryPassword name={displayName(person)} password={reset.data.temporaryPassword} />
      ) : confirming ? (
        <>
          <p className="muted">
            Give {displayName(person)} a new temporary password? Their current password stops working straight away.
          </p>
          <div className="form__actions">
            <button type="button" className="button-plain" disabled={reset.isPending} onClick={() => reset.mutate()}>
              {reset.isPending ? 'Resetting…' : 'Yes, reset password'}
            </button>
            <button type="button" className="text-link button-link" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">If they forgot their password, give them a new temporary one.</p>
          <button type="button" className="button-plain" onClick={() => setConfirming(true)}>
            Reset password
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  )
}

export function AddPerson() {
  const me = useSignedInPerson()
  if (!canManagePeople(me)) return <NotAllowed />
  return <AddPersonLoader />
}

function AddPersonLoader() {
  const { roles, locations } = usePeopleData()

  if (roles.isError || locations.isError) {
    return (
      <>
        <PageHeader title="Add person" locationFilter={false} />
        <LoadProblem
          retry={() => {
            void roles.refetch()
            void locations.refetch()
          }}
        />
      </>
    )
  }
  if (roles.isPending || locations.isPending) {
    return (
      <>
        <PageHeader title="Add person" locationFilter={false} />
        <p role="status" className="muted">
          Loading…
        </p>
      </>
    )
  }
  return <AddPersonForm roles={roles.data} locations={locations.data} />
}

function AddPersonForm({ roles, locations }: { roles: Role[]; locations: Locations }) {
  const backend = useBackend()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<NewPersonForm>({
    email: '',
    firstName: '',
    lastName: '',
    roleId: '',
    officeIds: [],
    primaryOfficeId: null,
  })
  const [error, setError] = useState<string | null>(null)

  const add = useMutation({
    mutationFn: (person: NewPerson) => backend.addPerson(person),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['people'] }),
    onError: (caught) => setError(friendlyMessage(caught, 'Could not add them. Check the connection and try again.')),
  })

  if (add.data && add.variables) {
    return (
      <>
        <PageHeader title="Person added" locationFilter={false} />
        <section className="panel form form--panel">
          <p>
            {displayName(add.variables)} can now sign in with {add.variables.email}.
          </p>
          <TemporaryPassword name={displayName(add.variables)} password={add.data.temporaryPassword} />
          <Link to="/people" className="button-next">
            Done
          </Link>
        </section>
      </>
    )
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const result = newPersonFrom(form)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setError(null)
    add.mutate(result.person)
  }

  const offices = locations.offices.filter((office) => office.isActive)

  return (
    <>
      <PageHeader title="Add person" locationFilter={false} />
      <form className="panel form form--panel" onSubmit={onSubmit} noValidate>
        <div className="form__row">
          <label className="field">
            First name
            <input
              type="text"
              autoComplete="off"
              value={form.firstName}
              onChange={(event) => setForm({ ...form, firstName: event.target.value })}
            />
          </label>
          <label className="field">
            Last name
            <input
              type="text"
              autoComplete="off"
              value={form.lastName}
              onChange={(event) => setForm({ ...form, lastName: event.target.value })}
            />
          </label>
        </div>

        <label className="field">
          Email
          <input
            type="email"
            autoComplete="off"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        </label>

        <label className="field">
          Role
          <select value={form.roleId} onChange={(event) => setForm({ ...form, roleId: event.target.value })}>
            <option value="">Pick one</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </label>

        <OfficePicker
          offices={offices}
          locations={locations}
          officeIds={form.officeIds}
          primaryOfficeId={form.primaryOfficeId}
          onChange={(officeIds, primaryOfficeId) => setForm({ ...form, officeIds, primaryOfficeId })}
        />

        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}

        <div className="form__actions">
          <button type="submit" className="button-next" disabled={add.isPending}>
            {add.isPending ? 'Adding…' : 'Add person'}
          </button>
          <Link to="/people" className="text-link">
            Cancel
          </Link>
        </div>
      </form>
    </>
  )
}
