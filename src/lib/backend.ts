// Everything the app asks of the server, in one place. The real version talks
// to Supabase; the tests hand the app a stand-in with the same shape.

import type { Locations } from './locations'
import type { MyDetails, NewPerson, Person, PersonChange, Role, SignedInPerson } from './people'

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

  /** Admins: makes the person's sign-in with a temporary password, returned once. */
  addPerson(person: NewPerson): Promise<{ personId: string; temporaryPassword: string }>
  /** Admins: gives the person a new temporary password, returned once. */
  resetPassword(personId: string): Promise<{ temporaryPassword: string }>

  /**
   * Sets the signed-in person's own password. The current password is
   * checked first when given; it is left out only straight after signing in
   * with a temporary password.
   */
  changeMyPassword(newPassword: string, currentPassword?: string): Promise<void>
  /** The signed-in person's own name and phone. */
  updateMyDetails(details: MyDetails): Promise<void>
}

/** A problem worth telling the person about, in plain words. */
export class FriendlyError extends Error {}

export function friendlyMessage(error: unknown, fallback: string): string {
  return error instanceof FriendlyError ? error.message : fallback
}
