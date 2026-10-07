// The Backend, talking to Supabase.

import {
  createClient,
  FunctionsFetchError,
  FunctionsHttpError,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js'
import { FriendlyError, type Backend, type SessionUser } from './backend'
import type { Customer, Property } from './customers'
import type { ContactsRow, CustomersRow, Database, OrganizationsRow, PropertiesRow, RolesRow } from './database.types'
import type { Contact, Organization, SearchKind, SearchResult } from './partners'
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

const CUSTOMER_COLUMNS =
  'id, customer_type, first_name, last_name, company_name, phone, phone_alt, email, preferred_contact, office_id, notes, created_at'

type CustomerColumns = Pick<
  CustomersRow,
  | 'id'
  | 'customer_type'
  | 'first_name'
  | 'last_name'
  | 'company_name'
  | 'phone'
  | 'phone_alt'
  | 'email'
  | 'preferred_contact'
  | 'office_id'
  | 'notes'
  | 'created_at'
>

function toCustomer(row: CustomerColumns): Customer {
  return {
    id: row.id,
    customerType: row.customer_type,
    firstName: row.first_name,
    lastName: row.last_name,
    companyName: row.company_name,
    phone: row.phone,
    phoneAlt: row.phone_alt,
    email: row.email,
    preferredContact: row.preferred_contact,
    officeId: row.office_id,
    notes: row.notes,
    createdAt: row.created_at,
  }
}

const PROPERTY_COLUMNS = 'id, customer_id, address_line1, address_line2, city, state, zip, property_type, notes'

type PropertyColumns = Pick<
  PropertiesRow,
  'id' | 'customer_id' | 'address_line1' | 'address_line2' | 'city' | 'state' | 'zip' | 'property_type' | 'notes'
>

function toProperty(row: PropertyColumns): Property {
  return {
    id: row.id,
    customerId: row.customer_id,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    state: row.state,
    zip: row.zip,
    propertyType: row.property_type,
    notes: row.notes,
  }
}

const ORGANIZATION_COLUMNS =
  'id, name, org_type, parent_organization_id, is_referral_partner, phone, email, address_line1, city, state, zip, notes'

type OrganizationColumns = Pick<
  OrganizationsRow,
  | 'id'
  | 'name'
  | 'org_type'
  | 'parent_organization_id'
  | 'is_referral_partner'
  | 'phone'
  | 'email'
  | 'address_line1'
  | 'city'
  | 'state'
  | 'zip'
  | 'notes'
>

function toOrganization(row: OrganizationColumns): Organization {
  return {
    id: row.id,
    name: row.name,
    orgType: row.org_type,
    parentOrganizationId: row.parent_organization_id,
    isReferralPartner: row.is_referral_partner,
    phone: row.phone,
    email: row.email,
    addressLine1: row.address_line1,
    city: row.city,
    state: row.state,
    zip: row.zip,
    notes: row.notes,
  }
}

const CONTACT_COLUMNS = 'id, organization_id, first_name, last_name, title, contact_role, phone, mobile, email, notes'

type ContactColumns = Pick<
  ContactsRow,
  'id' | 'organization_id' | 'first_name' | 'last_name' | 'title' | 'contact_role' | 'phone' | 'mobile' | 'email' | 'notes'
>

function toContact(row: ContactColumns): Contact {
  return {
    id: row.id,
    organizationId: row.organization_id,
    firstName: row.first_name,
    lastName: row.last_name,
    title: row.title,
    contactRole: row.contact_role,
    phone: row.phone,
    mobile: row.mobile,
    email: row.email,
    notes: row.notes,
  }
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
        .select('id, first_name, last_name, email, phone, is_active, must_change_password, role_id, primary_office_id')
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
          officeIds: [],
          primaryOfficeId: profile.primary_office_id,
        }
      }

      const [roleResult, permissionResult, officeResult] = await Promise.all([
        client.from('roles').select('id, key, name, scope').eq('id', profile.role_id).single(),
        client.from('role_permissions').select('permission_key').eq('role_id', profile.role_id),
        client.from('profile_offices').select('office_id').eq('profile_id', profile.id),
      ])
      fail(roleResult.error)
      fail(permissionResult.error)
      fail(officeResult.error)

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
        officeIds: (officeResult.data ?? []).map((row) => row.office_id),
        primaryOfficeId: profile.primary_office_id,
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

    // ----- Customers and properties -----

    async loadCustomers() {
      const { data, error } = await client
        .from('customers')
        .select(CUSTOMER_COLUMNS)
        .is('archived_at', null)
        .order('company_name', { nullsFirst: false })
        .order('first_name', { nullsFirst: false })
        .order('last_name', { nullsFirst: false })
      fail(error)
      return ((data ?? []) as CustomerColumns[]).map(toCustomer)
    },

    async loadCustomer(customerId) {
      const { data, error } = await client
        .from('customers')
        .select(CUSTOMER_COLUMNS)
        .eq('id', customerId)
        .is('archived_at', null)
        .maybeSingle()
      fail(error)
      return data ? toCustomer(data as CustomerColumns) : null
    },

    async loadProperties(customerId) {
      let query = client.from('properties').select(PROPERTY_COLUMNS).is('archived_at', null).order('created_at')
      if (customerId) query = query.eq('customer_id', customerId)
      const { data, error } = await query
      fail(error)
      return ((data ?? []) as PropertyColumns[]).map(toProperty)
    },

    async findCustomersByPhone(phone) {
      const { data, error } = await client.rpc('customers_with_phone', { phone })
      fail(error)
      return (data ?? []).map((row) => ({
        customerId: row.customer_id,
        displayName: row.display_name,
        officeName: row.office_name,
        canOpen: row.can_open,
      }))
    },

    async addCustomer(customer) {
      const { data, error } = await client.rpc('add_customer', {
        customer_type: customer.customerType,
        first_name: customer.firstName,
        last_name: customer.lastName,
        company_name: customer.companyName,
        phone: customer.phone,
        email: customer.email,
        office_id: customer.officeId,
        property_address_line1: customer.property?.addressLine1 ?? null,
        property_address_line2: customer.property?.addressLine2 ?? null,
        property_city: customer.property?.city ?? null,
        property_state: customer.property?.state ?? null,
        property_zip: customer.property?.zip ?? null,
        property_type: customer.property?.propertyType ?? null,
      })
      fail(error)
      if (typeof data !== 'string') throw new Error('The server did not send back the new customer.')
      return { customerId: data }
    },

    async updateCustomer(change) {
      const { data, error } = await client
        .from('customers')
        .update({
          customer_type: change.customerType,
          first_name: change.firstName,
          last_name: change.lastName,
          company_name: change.companyName,
          phone: change.phone,
          phone_alt: change.phoneAlt,
          email: change.email,
          preferred_contact: change.preferredContact,
          notes: change.notes,
        })
        .eq('id', change.customerId)
        .select('id')
      fail(error)
      // The access rules hide rows silently, so an update that reached no row is a refusal.
      if (!data || data.length === 0) throw new FriendlyError('You do not have permission to change this customer.')
    },

    async addProperty(customerId, property) {
      const { data, error } = await client
        .from('properties')
        .insert({
          customer_id: customerId,
          address_line1: property.addressLine1,
          address_line2: property.addressLine2,
          city: property.city,
          state: property.state,
          zip: property.zip,
          property_type: property.propertyType,
        })
        .select('id')
        .single()
      fail(error)
      return { propertyId: (data as { id: string }).id }
    },

    // ----- Organizations and contacts -----

    async loadOrganizations() {
      const { data, error } = await client.from('organizations').select(ORGANIZATION_COLUMNS).is('archived_at', null).order('name')
      fail(error)
      return ((data ?? []) as OrganizationColumns[]).map(toOrganization)
    },

    async loadContacts() {
      const { data, error } = await client
        .from('contacts')
        .select(CONTACT_COLUMNS)
        .is('archived_at', null)
        .order('first_name', { nullsFirst: false })
        .order('last_name', { nullsFirst: false })
      fail(error)
      return ((data ?? []) as ContactColumns[]).map(toContact)
    },

    async addOrganization(organization) {
      const { data, error } = await client
        .from('organizations')
        .insert({
          name: organization.name,
          org_type: organization.orgType,
          parent_organization_id: organization.parentOrganizationId,
          is_referral_partner: organization.isReferralPartner,
          phone: organization.phone,
          email: organization.email,
          address_line1: organization.addressLine1,
          city: organization.city,
          state: organization.state,
          zip: organization.zip,
          notes: organization.notes,
        })
        .select('id')
        .single()
      fail(error)
      return { organizationId: (data as { id: string }).id }
    },

    async updateOrganization(change) {
      const { data, error } = await client
        .from('organizations')
        .update({
          name: change.name,
          org_type: change.orgType,
          parent_organization_id: change.parentOrganizationId,
          is_referral_partner: change.isReferralPartner,
          phone: change.phone,
          email: change.email,
          address_line1: change.addressLine1,
          city: change.city,
          state: change.state,
          zip: change.zip,
          notes: change.notes,
        })
        .eq('id', change.organizationId)
        .select('id')
      fail(error)
      if (!data || data.length === 0) throw new FriendlyError('That organization was not found.')
    },

    async addContact(contact) {
      const { data, error } = await client
        .from('contacts')
        .insert({
          organization_id: contact.organizationId,
          first_name: contact.firstName,
          last_name: contact.lastName,
          title: contact.title,
          contact_role: contact.contactRole,
          phone: contact.phone,
          mobile: contact.mobile,
          email: contact.email,
          notes: contact.notes,
        })
        .select('id')
        .single()
      fail(error)
      return { contactId: (data as { id: string }).id }
    },

    async updateContact(change) {
      const { data, error } = await client
        .from('contacts')
        .update({
          organization_id: change.organizationId,
          first_name: change.firstName,
          last_name: change.lastName,
          title: change.title,
          contact_role: change.contactRole,
          phone: change.phone,
          mobile: change.mobile,
          email: change.email,
          notes: change.notes,
        })
        .eq('id', change.contactId)
        .select('id')
      fail(error)
      if (!data || data.length === 0) throw new FriendlyError('That contact was not found.')
    },

    // ----- Search -----

    async search(query) {
      const { data, error } = await client.rpc('search_records', { query })
      fail(error)
      const kinds: SearchKind[] = ['customer', 'organization', 'contact']
      return (data ?? []).flatMap((row): SearchResult[] => {
        const kind = kinds.find((candidate) => candidate === row.kind)
        return kind ? [{ kind, id: row.id, title: row.title, detail: row.detail }] : []
      })
    },
  }
}
