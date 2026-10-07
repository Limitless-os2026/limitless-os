// People who sign in: their roles, offices and what they may do.
// What a role may do is data (spec section 8): the app checks permissions,
// never role names.

import type { RoleScope } from './database.types'

export const MANAGE_USERS = 'manage_users'

export interface Role {
  id: string
  key: string
  name: string
  scope: RoleScope
}

export interface Person {
  id: string
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  roleId: string
  primaryOfficeId: string | null
  officeIds: string[]
  isActive: boolean
}

export interface SignedInPerson {
  id: string
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  isActive: boolean
  /** Still on a temporary password from an Admin: must choose their own before anything else. */
  mustChangePassword: boolean
  role: Role
  permissions: string[]
  /** The offices they belong to, and the main one. */
  officeIds: string[]
  primaryOfficeId: string | null
}

/** What the People screen saves for one person. */
export interface PersonChange {
  personId: string
  firstName: string
  lastName: string
  roleId: string
  officeIds: string[]
  primaryOfficeId: string | null
  isActive: boolean
}

export function displayName(person: Pick<Person, 'firstName' | 'lastName' | 'email'>): string {
  const name = [person.firstName, person.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
  return name || person.email || 'No name yet'
}

export function hasPermission(person: SignedInPerson | null | undefined, permission: string): boolean {
  return Boolean(person?.isActive && person.permissions.includes(permission))
}

export function canManagePeople(person: SignedInPerson | null | undefined): boolean {
  return hasPermission(person, MANAGE_USERS)
}

export interface PersonForm {
  firstName: string
  lastName: string
  roleId: string
  officeIds: string[]
  /** Only asked for when the person is in more than one office. */
  primaryOfficeId: string | null
  isActive: boolean
}

export function formFor(person: Person): PersonForm {
  return {
    firstName: person.firstName ?? '',
    lastName: person.lastName ?? '',
    roleId: person.roleId,
    officeIds: [...person.officeIds],
    primaryOfficeId: person.primaryOfficeId,
    isActive: person.isActive,
  }
}

/**
 * Checks the form and turns it into a change to save. Everyone who can sign
 * in belongs to at least one office. A person in one office has that office
 * as their main office. A person in several must have one of them picked.
 * A switched-off person may be left with no office.
 */
export function personChangeFrom(personId: string, form: PersonForm): { change: PersonChange } | { error: string } {
  if (!form.roleId) return { error: 'Pick a role.' }

  const officeIds = [...new Set(form.officeIds)]
  if (form.isActive && officeIds.length === 0) return { error: 'Pick at least one office.' }
  let primaryOfficeId: string | null = null
  if (officeIds.length === 1) {
    primaryOfficeId = officeIds[0] ?? null
  } else if (officeIds.length > 1) {
    if (!form.primaryOfficeId || !officeIds.includes(form.primaryOfficeId)) {
      return { error: 'Pick which of their offices is the main one.' }
    }
    primaryOfficeId = form.primaryOfficeId
  }

  return {
    change: {
      personId,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      roleId: form.roleId,
      officeIds,
      primaryOfficeId,
      isActive: form.isActive,
    },
  }
}

/** What the Add person form sends. */
export interface NewPerson {
  email: string
  firstName: string
  lastName: string
  roleId: string
  officeIds: string[]
  primaryOfficeId: string | null
}

export interface NewPersonForm {
  email: string
  firstName: string
  lastName: string
  roleId: string
  officeIds: string[]
  primaryOfficeId: string | null
}

/** Checks the Add person form. Everyone added belongs to at least one office. */
export function newPersonFrom(form: NewPersonForm): { person: NewPerson } | { error: string } {
  const email = form.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter a valid email address.' }
  if (!form.firstName.trim()) return { error: 'Enter their first name.' }
  const checked = personChangeFrom('', { ...form, isActive: true })
  if ('error' in checked) return checked
  return {
    person: {
      email,
      firstName: checked.change.firstName,
      lastName: checked.change.lastName,
      roleId: checked.change.roleId,
      officeIds: checked.change.officeIds,
      primaryOfficeId: checked.change.primaryOfficeId,
    },
  }
}

/** What a person can change about themself: name and phone. */
export interface MyDetails {
  firstName: string
  lastName: string
  phone: string
}

/** The shortest password the sign-in service accepts (supabase/config.toml). */
export const MINIMUM_PASSWORD_LENGTH = 10

/** Checks a new password and its second entry. Returns a plain message, or null when it is fine. */
export function newPasswordProblem(password: string, repeated: string): string | null {
  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    return `Use at least ${MINIMUM_PASSWORD_LENGTH} characters.`
  }
  if (password !== repeated) return 'The two passwords do not match.'
  return null
}
