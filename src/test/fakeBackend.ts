// An in-memory stand-in for the server, for screen tests. Made-up people only.

import { FriendlyError, type Backend, type SessionUser } from '../lib/backend'
import type { Locations } from '../lib/locations'
import type { MyDetails, NewPerson, Person, PersonChange, Role } from '../lib/people'

export const roles: Role[] = [
  { id: 'role-accountant', key: 'accountant', name: 'Accountant', scope: 'company' },
  { id: 'role-admin', key: 'admin', name: 'Admin', scope: 'company' },
  { id: 'role-pm', key: 'project_manager', name: 'Project manager', scope: 'office' },
  { id: 'role-sales', key: 'sales', name: 'Sales', scope: 'own' },
]

const permissions: Record<string, string[]> = {
  'role-admin': ['manage_users', 'manage_permissions', 'manage_settings', 'view_audit_log'],
  'role-pm': ['view_margins', 'manage_teams'],
  'role-sales': [],
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
      phone: '555-0100',
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
      phone: null,
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
      phone: null,
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
  added: NewPerson[]
  myDetails: MyDetails[]
  /** Each person's password. Everyone starts on PASSWORD. */
  passwords: Map<string, string>
  /** People still on a temporary password. */
  temporary: Set<string>
}

let nextTemporary = 1

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
    added: [],
    myDetails: [],
    passwords: new Map(people.map((person) => [person.id, PASSWORD])),
    temporary: new Set(),

    async currentUser() {
      return user
    },
    onUserChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async signIn(email, password) {
      const person = people.find((candidate) => candidate.email === email.trim())
      if (!person || password !== backend.passwords.get(person.id)) throw new FriendlyError('That email and password do not match.')
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
        phone: person.phone,
        isActive: person.isActive,
        mustChangePassword: backend.temporary.has(person.id),
        role,
        permissions: person.isActive && !backend.temporary.has(person.id) ? (permissions[role.id] ?? []) : [],
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
    async addPerson(person) {
      backend.added.push(person)
      if (people.some((candidate) => candidate.email === person.email)) {
        throw new FriendlyError('Someone with that email can already sign in.')
      }
      const id = `user-added-${backend.added.length}`
      const temporaryPassword = `Temp-${nextTemporary++}-Pass`
      people.push({ id, phone: null, isActive: true, ...person, lastName: person.lastName || null })
      backend.passwords.set(id, temporaryPassword)
      backend.temporary.add(id)
      return { personId: id, temporaryPassword }
    },
    async resetPassword(personId) {
      const temporaryPassword = `Temp-${nextTemporary++}-Pass`
      backend.passwords.set(personId, temporaryPassword)
      backend.temporary.add(personId)
      return { temporaryPassword }
    },
    async changeMyPassword(newPassword, currentPassword) {
      if (!user) throw new FriendlyError('Sign in first.')
      if (currentPassword !== undefined && currentPassword !== backend.passwords.get(user.id)) {
        throw new FriendlyError('Your current password is not right.')
      }
      if (newPassword === backend.passwords.get(user.id)) {
        throw new FriendlyError('Choose a password different from the one you have now.')
      }
      backend.passwords.set(user.id, newPassword)
      backend.temporary.delete(user.id)
    },
    async updateMyDetails(details) {
      backend.myDetails.push(details)
      const person = people.find((candidate) => candidate.id === user?.id)
      if (!person) throw new FriendlyError('Sign in first.')
      Object.assign(person, {
        firstName: details.firstName.trim() || null,
        lastName: details.lastName.trim() || null,
        phone: details.phone.trim() || null,
      })
    },
  }
  return backend
}
