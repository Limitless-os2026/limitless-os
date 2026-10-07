// The rules of the manage-people server function, kept apart from the server
// itself so the app's tests can check them. Plain TypeScript: no Deno or
// browser-only features.

export type PeopleRequest =
  | {
      action: 'add'
      email: string
      firstName: string
      lastName: string
      roleId: string
      officeIds: string[]
      primaryOfficeId: string | null
    }
  | { action: 'reset_password'; personId: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Checks what the app sent. Returns the request, or a plain message. */
export function parsePeopleRequest(body: unknown): { request: PeopleRequest } | { error: string } {
  if (typeof body !== 'object' || body === null) return { error: 'The request was empty.' }
  const input = body as Record<string, unknown>

  if (input.action === 'reset_password') {
    if (!isUuid(input.personId)) return { error: 'That person was not found.' }
    return { request: { action: 'reset_password', personId: input.personId } }
  }

  if (input.action !== 'add') return { error: 'Unknown request.' }

  const email = text(input.email).toLowerCase()
  if (!EMAIL.test(email)) return { error: 'Enter a valid email address.' }
  const firstName = text(input.firstName)
  if (!firstName) return { error: 'Enter their first name.' }
  if (!isUuid(input.roleId)) return { error: 'Pick a role.' }
  if (!Array.isArray(input.officeIds) || !input.officeIds.every(isUuid)) return { error: 'Pick their offices.' }

  const officeIds = [...new Set(input.officeIds as string[])]
  if (officeIds.length === 0) return { error: 'Pick at least one office.' }

  let primaryOfficeId: string | null
  if (officeIds.length === 1) {
    primaryOfficeId = officeIds[0] ?? null
  } else {
    const chosen = input.primaryOfficeId
    if (!isUuid(chosen) || !officeIds.includes(chosen)) return { error: 'Pick which of their offices is the main one.' }
    primaryOfficeId = chosen
  }

  return {
    request: {
      action: 'add',
      email,
      firstName,
      lastName: text(input.lastName),
      roleId: input.roleId,
      officeIds,
      primaryOfficeId,
    },
  }
}

// No letters or digits that are easy to mix up when read aloud or copied
// from a screen: 0 O o, 1 l I.
const LOWER = 'abcdefghijkmnpqrstuvwxyz'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITS = '23456789'
const ALPHABET = LOWER + UPPER + DIGITS

/** A random whole number from 0 to below max, without bias. */
function randomBelow(max: number, random: (bytes: Uint8Array<ArrayBuffer>) => void): number {
  const limit = 256 - (256 % max)
  const byte = new Uint8Array(1)
  for (;;) {
    random(byte)
    const value = byte[0] ?? 0
    if (value < limit) return value % max
  }
}

/**
 * A temporary password such as "Kp7d-wR3n-x9Ft-Hc2m": sixteen characters in
 * groups of four, with at least one lower-case letter, capital and digit.
 * Uses the system's secure random numbers.
 */
export function generateTemporaryPassword(
  random: (bytes: Uint8Array<ArrayBuffer>) => void = (bytes) => void globalThis.crypto.getRandomValues(bytes),
): string {
  for (;;) {
    let characters = ''
    for (let i = 0; i < 16; i++) characters += ALPHABET[randomBelow(ALPHABET.length, random)]
    const mixed = [LOWER, UPPER, DIGITS].every((set) => [...characters].some((c) => set.includes(c)))
    if (mixed) return characters.match(/.{4}/g)?.join('-') ?? characters
  }
}
