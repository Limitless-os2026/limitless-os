import { canManagePeople, displayName, personChangeFrom, type PersonForm, type SignedInPerson } from './people'

const form: PersonForm = {
  firstName: '  Riley ',
  lastName: ' Rep',
  roleId: 'role-sales',
  officeIds: [],
  primaryOfficeId: null,
  isActive: true,
}

describe('saving a person', () => {
  it('has no main office when the person is in no office', () => {
    expect(personChangeFrom('p1', { ...form, primaryOfficeId: 'office-a' })).toEqual({
      change: {
        personId: 'p1',
        firstName: 'Riley',
        lastName: 'Rep',
        roleId: 'role-sales',
        officeIds: [],
        primaryOfficeId: null,
        isActive: true,
      },
    })
  })

  it('makes a single office the main office', () => {
    const result = personChangeFrom('p1', { ...form, officeIds: ['office-a'] })
    expect('change' in result && result.change.primaryOfficeId).toBe('office-a')
  })

  it('asks which office is the main one when there are several', () => {
    expect(personChangeFrom('p1', { ...form, officeIds: ['office-a', 'office-b'] })).toEqual({
      error: 'Pick which of their offices is the main one.',
    })
    // A main office they are no longer in does not count.
    expect(personChangeFrom('p1', { ...form, officeIds: ['office-a', 'office-b'], primaryOfficeId: 'office-c' })).toEqual({
      error: 'Pick which of their offices is the main one.',
    })
    const result = personChangeFrom('p1', { ...form, officeIds: ['office-a', 'office-b'], primaryOfficeId: 'office-b' })
    expect('change' in result && result.change.primaryOfficeId).toBe('office-b')
  })

  it('needs a role', () => {
    expect(personChangeFrom('p1', { ...form, roleId: '' })).toEqual({ error: 'Pick a role.' })
  })

  it('lists each office once', () => {
    const result = personChangeFrom('p1', { ...form, officeIds: ['office-a', 'office-a'] })
    expect('change' in result && result.change.officeIds).toEqual(['office-a'])
  })
})

describe('names', () => {
  it('uses the full name, then the email', () => {
    expect(displayName({ firstName: 'Riley', lastName: 'Rep', email: 'r@example.com' })).toBe('Riley Rep')
    expect(displayName({ firstName: 'Riley', lastName: null, email: 'r@example.com' })).toBe('Riley')
    expect(displayName({ firstName: ' ', lastName: null, email: 'r@example.com' })).toBe('r@example.com')
    expect(displayName({ firstName: null, lastName: null, email: null })).toBe('No name yet')
  })
})

describe('who can manage people', () => {
  const person: SignedInPerson = {
    id: 'p1',
    firstName: null,
    lastName: null,
    email: null,
    isActive: true,
    role: { id: 'r', key: 'anything', name: 'Anything', scope: 'company' },
    permissions: ['manage_users'],
  }

  it('goes by the permission, not the role name', () => {
    expect(canManagePeople(person)).toBe(true)
    expect(canManagePeople({ ...person, role: { ...person.role, key: 'admin' }, permissions: [] })).toBe(false)
  })

  it('never includes someone who is switched off', () => {
    expect(canManagePeople({ ...person, isActive: false })).toBe(false)
    expect(canManagePeople(null)).toBe(false)
  })
})
