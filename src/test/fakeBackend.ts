// An in-memory stand-in for the server, for screen tests. Made-up people only.

import { FriendlyError, type Backend, type SessionUser } from '../lib/backend'
import type { Locations } from '../lib/locations'
import type { Person, PersonChange, Role } from '../lib/people'

export const roles: Role[] = [
  { id: 'role-accountant', key: 'accountant', name: 'Accountant', scope: 'company' },
  { id: 'role-admin', key: 'admin', name: 'Admin', scope: 'company' },
  { id: 'role-pm', key: 'project_manager', name: 'Project manager', scope: 'office' },
  { id: 'role-sales', key: 'sales', name: 'Sales', scope: 'own' },
]

const permissions: Record<string, string[]> = {
  'role-admin': ['manage_users', 'manage_permissions', 'manage_settings', 'view_audit_log'],
  'role-pm': ['view_margins'],
  'role-sales': ['view_commissions'],
  'role-accountant': ['view_margins'],
}

export function sampleLocations(): Locations {
  return {
    states: [
      { id: 'state-pa', code: 'PA', name: 'Pennsylvania', isActive: true },
      { id: 'state-ut', code: 'UT', name: 'Utah', isActive: true },
    ],
    offices: [
      { id: 'office-af', stateId: 'state-ut', name: 'American Fork', timeZone: 'America/Denver', isActive: true },
      { id: 'office-reading', stateId: 'state-pa', name: 'Reading', timeZone: 'America/New_York', isActive: true },
    ],
  }
}

export function samplePeople(): Person[] {
  return [
    {
      id: 'user-admin',
      firstName: 'Avery',
      lastName: 'Admin',
      email: 'avery@example.com',
      roleId: 'role-admin',
      primaryOfficeId: 'office-reading',
      officeIds: ['office-reading'],
      isActive: true,
    },
    {
      id: 'user-sales',
      firstName: null,
      lastName: null,
      email: 'new.rep@example.com',
      roleId: 'role-sales',
      primaryOfficeId: null,
      officeIds: [],
      isActive: true,
    },
    {
      id: 'user-off',
      firstName: 'Lee',
      lastName: 'Leaver',
      email: 'lee@example.com',
      roleId: 'role-sales',
      primaryOfficeId: null,
      officeIds: [],
      isActive: false,
    },
  ]
}

export const PASSWORD = 'correct horse'

export interface FakeBackend extends Backend {
  people: Person[]
  locations: Locations
  updates: PersonChange[]
}

export function fakeBackend(options: { signedInAs?: string | null; locations?: Locations } = {}): FakeBackend {
  let user: SessionUser | null = null
  const listeners = new Set<(user: SessionUser | null) => void>()
  const people = samplePeople()

  function setUser(next: SessionUser | null) {
    user = next
    listeners.forEach((listener) => listener(next))
  }

  if (options.signedInAs) {
    const person = people.find((candidate) => candidate.id === options.signedInAs)
    user = { id: options.signedInAs, email: person?.email ?? null }
  }

  const backend: FakeBackend = {
    people,
    locations: options.locations ?? sampleLocations(),
    updates: [],

    async currentUser() {
      return user
    },
    onUserChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async signIn(email, password) {
      const person = people.find((candidate) => candidate.email === email.trim())
      if (!person || password !== PASSWORD) throw new FriendlyError('That email and password do not match.')
      setUser({ id: person.id, email: person.email })
    },
    async signOut() {
      setUser(null)
    },
    async loadSignedInPerson(userId) {
      const person = people.find((candidate) => candidate.id === userId)
      if (!person) return null
      const role = roles.find((candidate) => candidate.id === person.roleId)
      if (!role) throw new Error('missing role')
      return {
        id: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email,
        isActive: person.isActive,
        role,
        permissions: person.isActive ? (permissions[role.id] ?? []) : [],
      }
    },
    async loadLocations() {
      return backend.locations
    },
    async loadPeople() {
      return people.map((person) => ({ ...person, officeIds: [...person.officeIds] }))
    },
    async loadRoles() {
      return roles
    },
    async updatePerson(change) {
      backend.updates.push(change)
      const person = people.find((candidate) => candidate.id === change.personId)
      if (!person) throw new FriendlyError('That person was not found.')
      Object.assign(person, {
        firstName: change.firstName || null,
        lastName: change.lastName || null,
        roleId: change.roleId,
        officeIds: change.officeIds,
        primaryOfficeId: change.primaryOfficeId,
        isActive: change.isActive,
      })
    },
  }
  return backend
}
