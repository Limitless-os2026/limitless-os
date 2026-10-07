// The Backend, talking to Supabase.

import {
  createClient,
  FunctionsFetchError,
  FunctionsHttpError,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js'
import { FriendlyError, type Backend, type SessionUser } from './backend'
import type { Database, RolesRow } from './database.types'
import type { NewPerson, Role } from './people'

export interface SupabaseSettings {
  url: string
  key: string
}

/** The Supabase address and public key, or null when either is missing. */
export function readSupabaseSettings(env: Record<string, unknown>): SupabaseSettings | null {
  const url = typeof env.VITE_SUPABASE_URL === 'string' ? env.VITE_SUPABASE_URL.trim() : ''
  const key = typeof env.VITE_SUPABASE_KEY === 'string' ? env.VITE_SUPABASE_KEY.trim() : ''
  return url && key ? { url, key } : null
}

function toSessionUser(user: User | null | undefined): SessionUser | null {
  return user ? { id: user.id, email: user.email ?? null } : null
}

function toRole(row: Pick<RolesRow, 'id' | 'key' | 'name' | 'scope'>): Role {
  return { id: row.id, key: row.key, name: row.name, scope: row.scope }
}

const COULD_NOT_REACH = 'Could not reach the server. Check the connection and try again.'

function fail(error: { message: string; code?: string } | null): void {
  if (!error) return
  // Rules the database enforces come back with their own plain message.
  if (error.code === '23514' || error.code === 'P0002') throw new FriendlyError(error.message)
  if (error.code === '42501') throw new FriendlyError('You do not have permission to do that.')
  throw new Error(error.message)
}

/** The plain message the manage-people server function sent back, if any. */
async function serverMessage(error: unknown): Promise<string | null> {
  if (!(error instanceof FunctionsHttpError)) return null
  try {
    const body: unknown = await (error.context as Response).json()
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error
  } catch {
    // Not the function's own reply.
  }
  return null
}

export function createSupabaseBackend(settings: SupabaseSettings): Backend {
  const client: SupabaseClient<Database> = createClient<Database>(settings.url, settings.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })

  // The server function that adds people and resets passwords. It needs the
  // secret key, so it runs on Supabase, never here.
  async function managePeople(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    let result
    try {
      result = await client.functions.invoke<Record<string, unknown>>('manage-people', { body })
    } catch {
      throw new FriendlyError(COULD_NOT_REACH)
    }
    const { data, error } = result
    if (error) {
      const message = await serverMessage(error)
      if (message) throw new FriendlyError(message)
      if (error instanceof FunctionsFetchError) throw new FriendlyError(COULD_NOT_REACH)
      throw error
    }
    return data ?? {}
  }

  return {
    async currentUser() {
      const { data } = await client.auth.getSession()
      return toSessionUser(data.session?.user)
    },

    onUserChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        // Supabase asks that no other Supabase call runs inside this callback.
        setTimeout(() => listener(toSessionUser(session?.user)), 0)
      })
      return () => data.subscription.unsubscribe()
    },

    async signIn(email, password) {
      let result
      try {
        result = await client.auth.signInWithPassword({ email: email.trim(), password })
      } catch {
        throw new FriendlyError(COULD_NOT_REACH)
      }
      const { error } = result
      if (!error) return
      if (error.code === 'invalid_credentials') throw new FriendlyError('That email and password do not match.')
      if (error.code === 'email_not_confirmed') throw new FriendlyError('This email address has not been confirmed yet.')
      if (error.status === 0 || error.name === 'AuthRetryableFetchError') throw new FriendlyError(COULD_NOT_REACH)
      throw new FriendlyError(error.message)
    },

    async signOut() {
      const { error } = await client.auth.signOut()
      fail(error)
    },

    async loadSignedInPerson(userId) {
      const { data: profile, error } = await client
        .from('profiles')
        .select('id, first_name, last_name, email, phone, is_active, must_change_password, role_id')
        .eq('id', userId)
        .maybeSingle()
      fail(error)
      if (!profile) return null

      // A switched-off person, or one still on a temporary password, can read
      // their own profile and nothing else.
      if (!profile.is_active || profile.must_change_password) {
        return {
          id: profile.id,
          firstName: profile.first_name,
          lastName: profile.last_name,
          email: profile.email,
          phone: profile.phone,
          isActive: profile.is_active,
          mustChangePassword: profile.must_change_password,
          role: { id: profile.role_id, key: '', name: '', scope: 'own' },
          permissions: [],
        }
      }

      const [roleResult, permissionResult] = await Promise.all([
        client.from('roles').select('id, key, name, scope').eq('id', profile.role_id).single(),
        client.from('role_permissions').select('permission_key').eq('role_id', profile.role_id),
      ])
      fail(roleResult.error)
      fail(permissionResult.error)

      return {
        id: profile.id,
        firstName: profile.first_name,
        lastName: profile.last_name,
        email: profile.email,
        phone: profile.phone,
        isActive: true,
        mustChangePassword: false,
        role: toRole(roleResult.data as RolesRow),
        permissions: (permissionResult.data ?? []).map((row) => row.permission_key),
      }
    },

    async loadLocations() {
      const [states, offices] = await Promise.all([
        client.from('states').select('id, code, name, is_active').order('name'),
        client.from('offices').select('id, state_id, name, time_zone, is_active').order('name'),
      ])
      fail(states.error)
      fail(offices.error)
      return {
        states: (states.data ?? []).map((row) => ({ id: row.id, code: row.code, name: row.name, isActive: row.is_active })),
        offices: (offices.data ?? []).map((row) => ({
          id: row.id,
          stateId: row.state_id,
          name: row.name,
          timeZone: row.time_zone,
          isActive: row.is_active,
        })),
      }
    },

    async loadPeople() {
      const [profiles, memberships] = await Promise.all([
        client
          .from('profiles')
          .select('id, first_name, last_name, email, phone, role_id, primary_office_id, is_active')
          .order('first_name', { nullsFirst: false })
          .order('last_name', { nullsFirst: false })
          .order('email'),
        client.from('profile_offices').select('profile_id, office_id'),
      ])
      fail(profiles.error)
      fail(memberships.error)
      return (profiles.data ?? []).map((row) => ({
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        phone: row.phone,
        roleId: row.role_id,
        primaryOfficeId: row.primary_office_id,
        officeIds: (memberships.data ?? []).filter((m) => m.profile_id === row.id).map((m) => m.office_id),
        isActive: row.is_active,
      }))
    },

    async loadRoles() {
      const { data, error } = await client.from('roles').select('id, key, name, scope').order('name')
      fail(error)
      return (data ?? []).map((row) => toRole(row as RolesRow))
    },

    async updatePerson(change) {
      const { error } = await client.rpc('update_person', {
        person_id: change.personId,
        first_name: change.firstName,
        last_name: change.lastName,
        role_id: change.roleId,
        office_ids: change.officeIds,
        primary_office_id: change.primaryOfficeId,
        is_active: change.isActive,
      })
      fail(error)
    },

    async addPerson(person: NewPerson) {
      const data = await managePeople({ action: 'add', ...person })
      if (typeof data.personId !== 'string' || typeof data.temporaryPassword !== 'string') {
        throw new Error('The server did not send back a temporary password.')
      }
      return { personId: data.personId, temporaryPassword: data.temporaryPassword }
    },

    async resetPassword(personId) {
      const data = await managePeople({ action: 'reset_password', personId })
      if (typeof data.temporaryPassword !== 'string') throw new Error('The server did not send back a temporary password.')
      return { temporaryPassword: data.temporaryPassword }
    },

    async changeMyPassword(newPassword, currentPassword) {
      if (currentPassword !== undefined) {
        // Checking the current password also starts a fresh sign-in, which
        // the sign-in service asks for before a password change.
        const { data } = await client.auth.getSession()
        const email = data.session?.user.email
        if (!email) throw new FriendlyError('Sign out and sign in again, then try once more.')
        const { error } = await client.auth.signInWithPassword({ email, password: currentPassword })
        if (error?.code === 'invalid_credentials') throw new FriendlyError('Your current password is not right.')
        if (error) throw new FriendlyError(COULD_NOT_REACH)
      }

      let result
      try {
        result = await client.auth.updateUser({ password: newPassword })
      } catch {
        throw new FriendlyError(COULD_NOT_REACH)
      }
      const { error } = result
      if (!error) return
      if (error.code === 'same_password') throw new FriendlyError('Choose a password different from the one you have now.')
      if (error.code === 'weak_password') throw new FriendlyError(error.message)
      if (error.code === 'reauthentication_needed' || error.code === 'session_expired') {
        throw new FriendlyError('Sign out and sign in again, then change your password.')
      }
      throw new FriendlyError(error.message)
    },

    async updateMyDetails(details) {
      const { error } = await client.rpc('update_my_details', {
        first_name: details.firstName,
        last_name: details.lastName,
        phone: details.phone,
      })
      fail(error)
    },
  }
}
