// Everything the app asks of the server, in one place. The real version talks
// to Supabase; the tests hand the app a stand-in with the same shape.

import type { Locations } from './locations'
import type { Person, PersonChange, Role, SignedInPerson } from './people'

export interface SessionUser {
  id: string
  email: string | null
}

export interface Backend {
  /** The account signed in on this device, if any. */
  currentUser(): Promise<SessionUser | null>
  /** Calls back whenever someone signs in or out. Returns a function that stops listening. */
  onUserChange(listener: (user: SessionUser | null) => void): () => void
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>

  /** The signed-in person's profile, role and permissions. Null when they have no profile. */
  loadSignedInPerson(userId: string): Promise<SignedInPerson | null>
  loadLocations(): Promise<Locations>
  loadPeople(): Promise<Person[]>
  loadRoles(): Promise<Role[]>
  updatePerson(change: PersonChange): Promise<void>
}

/** A problem worth telling the person about, in plain words. */
export class FriendlyError extends Error {}

export function friendlyMessage(error: unknown, fallback: string): string {
  return error instanceof FriendlyError ? error.message : fallback
}
