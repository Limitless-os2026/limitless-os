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
  personChangeFrom,
  type Person,
  type PersonChange,
  type PersonForm,
  type Role,
} from '../lib/people'
import { useBackend, useSignedInPerson } from '../lib/SessionContext'

// The People screen, for Admins: everyone who can sign in, with their role,
// offices and whether they are switched on. Other roles cannot open it.

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
          Create their sign-in in Supabase: Authentication, then Users, then Add user, with their email and a starting
          password. They appear here as Sales with no office. Open them here to set their role and offices.
        </p>
        <p>To stop someone signing in, switch them off here. People are never deleted, so their history stays.</p>
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
  const chosenOffices = offices.filter((office) => form.officeIds.includes(office.id))

  function toggleOffice(officeId: string, checked: boolean) {
    setForm((current) => ({
      ...current,
      officeIds: checked ? [...current.officeIds, officeId] : current.officeIds.filter((id) => id !== officeId),
    }))
  }

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

        <fieldset className="field-group">
          <legend>Offices</legend>
          {offices.map((office) => (
            <label key={office.id} className="check">
              <input
                type="checkbox"
                checked={form.officeIds.includes(office.id)}
                onChange={(event) => toggleOffice(office.id, event.target.checked)}
              />
              {officeLabel(office, locations.states)}
            </label>
          ))}
        </fieldset>

        {chosenOffices.length > 1 && (
          <label className="field">
            Main office
            <select
              value={form.primaryOfficeId && form.officeIds.includes(form.primaryOfficeId) ? form.primaryOfficeId : ''}
              onChange={(event) => setForm({ ...form, primaryOfficeId: event.target.value || null })}
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
    </>
  )
}
