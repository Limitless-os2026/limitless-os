import { describe, expect, it } from 'vitest'
import { generateTemporaryPassword, parsePeopleRequest } from './rules.ts'

const ROLE = '11111111-1111-4111-8111-111111111111'
const READING = '22222222-2222-4222-8222-222222222222'
const AMERICAN_FORK = '33333333-3333-4333-8333-333333333333'

const add = {
  action: 'add',
  email: '  Riley.Rep@Example.com ',
  firstName: ' Riley ',
  lastName: ' Rep ',
  roleId: ROLE,
  officeIds: [READING],
  primaryOfficeId: null,
}

describe('adding a person', () => {
  it('tidies the email and names, and makes a single office the main one', () => {
    expect(parsePeopleRequest(add)).toEqual({
      request: {
        action: 'add',
        email: 'riley.rep@example.com',
        firstName: 'Riley',
        lastName: 'Rep',
        roleId: ROLE,
        officeIds: [READING],
        primaryOfficeId: READING,
      },
    })
  })

  it('needs an email, a first name, a role and an office', () => {
    expect(parsePeopleRequest({ ...add, email: 'not an email' })).toEqual({ error: 'Enter a valid email address.' })
    expect(parsePeopleRequest({ ...add, firstName: ' ' })).toEqual({ error: 'Enter their first name.' })
    expect(parsePeopleRequest({ ...add, roleId: '' })).toEqual({ error: 'Pick a role.' })
    expect(parsePeopleRequest({ ...add, officeIds: [] })).toEqual({ error: 'Pick at least one office.' })
    expect(parsePeopleRequest({ ...add, officeIds: ['reading'] })).toEqual({ error: 'Pick their offices.' })
  })

  it('needs the main office picked from their offices when there are several', () => {
    const two = { ...add, officeIds: [READING, AMERICAN_FORK] }
    expect(parsePeopleRequest(two)).toEqual({ error: 'Pick which of their offices is the main one.' })
    const result = parsePeopleRequest({ ...two, primaryOfficeId: AMERICAN_FORK })
    expect('request' in result && result.request.action === 'add' && result.request.primaryOfficeId).toBe(AMERICAN_FORK)
  })

  it('turns away anything else', () => {
    expect(parsePeopleRequest(null)).toEqual({ error: 'The request was empty.' })
    expect(parsePeopleRequest({ action: 'delete' })).toEqual({ error: 'Unknown request.' })
    expect(parsePeopleRequest({ action: 'reset_password', personId: 'x' })).toEqual({ error: 'That person was not found.' })
    expect(parsePeopleRequest({ action: 'reset_password', personId: ROLE })).toEqual({
      request: { action: 'reset_password', personId: ROLE },
    })
  })
})

describe('temporary passwords', () => {
  it('are sixteen easy-to-read characters in groups of four, mixing letters and digits', () => {
    for (let i = 0; i < 200; i++) {
      const password = generateTemporaryPassword()
      expect(password).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{4}(-[a-km-zA-HJ-NP-Z2-9]{4}){3}$/)
      expect(password).toMatch(/[a-z]/)
      expect(password).toMatch(/[A-Z]/)
      expect(password).toMatch(/[2-9]/)
    }
  })

  it('are different each time', () => {
    const seen = new Set(Array.from({ length: 100 }, () => generateTemporaryPassword()))
    expect(seen.size).toBe(100)
  })
})
