// An in-memory stand-in for the server, for screen tests. Made-up people,
// customers and partners only. It does not copy the database's visibility
// rules: everyone sees everything here. Those rules are checked against a
// real Postgres in supabase/tests/.

import { FriendlyError, type Backend, type SessionUser } from '../lib/backend'
import {
  customerName,
  phoneKey,
  type Customer,
  type CustomerChange,
  type NewCustomer,
  type NewProperty,
  type PhoneMatch,
  type Property,
} from '../lib/customers'
import type { Locations } from '../lib/locations'
import {
  contactName,
  SEARCH_LIMIT,
  type Contact,
  type ContactChange,
  type NewContact,
  type NewOrganization,
  type Organization,
  type OrganizationChange,
  type SearchResult,
} from '../lib/partners'
import type { MyDetails, NewPerson, Person, PersonChange, Role } from '../lib/people'

export const roles: Role[] = [
  { id: 'role-accountant', key: 'accountant', name: 'Accountant', scope: 'company' },
  { id: 'role-admin', key: 'admin', name: 'Admin', scope: 'company' },
  { id: 'role-pm', key: 'project_manager', name: 'Project manager', scope: 'office' },
  { id: 'role-sales', key: 'sales', name: 'Sales', scope: 'own' },
]

const permissions: Record<string, string[]> = {
  'role-admin': ['manage_users', 'manage_permissions', 'manage_settings', 'view_audit_log', 'manage_partner_structure'],
  'role-pm': ['view_margins', 'manage_teams', 'manage_partner_structure'],
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
      primaryOfficeId: 'office-reading',
      officeIds: ['office-reading'],
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

export function sampleCustomers(): Customer[] {
  return [
    {
      id: 'customer-dana',
      customerType: 'person',
      firstName: 'Dana',
      lastName: 'Whitfield',
      companyName: null,
      phone: '(610) 555-0101',
      phoneAlt: null,
      email: 'dana.whitfield@example.com',
      preferredContact: 'text',
      officeId: 'office-reading',
      notes: null,
      createdAt: '2026-10-01T14:00:00Z',
    },
    {
      id: 'customer-samuel',
      customerType: 'person',
      firstName: 'Samuel',
      lastName: 'Okafor',
      companyName: null,
      phone: '610-555-0102',
      phoneAlt: null,
      email: null,
      preferredContact: null,
      officeId: 'office-reading',
      notes: 'Gate code 4411',
      createdAt: '2026-10-02T14:00:00Z',
    },
    {
      id: 'customer-oakridge',
      customerType: 'company',
      firstName: 'Grace',
      lastName: 'Tran',
      companyName: 'Oakridge Property Group LLC',
      phone: '610-555-0103',
      phoneAlt: null,
      email: 'grace@example.com',
      preferredContact: 'email',
      officeId: 'office-reading',
      notes: null,
      createdAt: '2026-10-03T14:00:00Z',
    },
    {
      id: 'customer-luis',
      customerType: 'person',
      firstName: 'Luis',
      lastName: 'Herrera',
      companyName: null,
      phone: '801-555-0104',
      phoneAlt: null,
      email: 'luis.herrera@example.com',
      preferredContact: 'call',
      officeId: 'office-af',
      notes: null,
      createdAt: '2026-10-04T14:00:00Z',
    },
  ]
}

export function sampleProperties(): Property[] {
  return [
    { id: 'property-1', customerId: 'customer-dana', addressLine1: '412 Birchwood Lane', addressLine2: null, city: 'Reading', state: 'PA', zip: '19601', propertyType: 'residential', notes: null },
    { id: 'property-2', customerId: 'customer-samuel', addressLine1: '88 Quarry Road', addressLine2: null, city: 'Shillington', state: 'PA', zip: '19607', propertyType: 'residential', notes: null },
    { id: 'property-3', customerId: 'customer-oakridge', addressLine1: '1500 Commerce Drive', addressLine2: null, city: 'Wyomissing', state: 'PA', zip: '19610', propertyType: 'commercial', notes: null },
    { id: 'property-4', customerId: 'customer-oakridge', addressLine1: '1510 Commerce Drive', addressLine2: null, city: 'Wyomissing', state: 'PA', zip: '19610', propertyType: 'commercial', notes: null },
    { id: 'property-5', customerId: 'customer-luis', addressLine1: '27 Alpine Loop', addressLine2: null, city: 'American Fork', state: 'UT', zip: '84003', propertyType: 'residential', notes: null },
  ]
}

function organization(id: string, name: string, orgType: Organization['orgType'], extra: Partial<Organization> = {}): Organization {
  return {
    id,
    name,
    orgType,
    parentOrganizationId: null,
    isReferralPartner: true,
    phone: null,
    email: null,
    addressLine1: null,
    city: null,
    state: null,
    zip: null,
    notes: null,
    ...extra,
  }
}

export function sampleOrganizations(): Organization[] {
  return [
    organization('org-keystone', 'Keystone Restoration Holdings', 'servpro_group', { phone: '610-555-0150', city: 'Reading', state: 'PA' }),
    organization('org-wasatch', 'Wasatch Mitigation Partners', 'servpro_group', { phone: '801-555-0160', city: 'Lehi', state: 'UT' }),
    organization('org-birch', 'SERVPRO of Birch Hollow', 'servpro_franchise', { parentOrganizationId: 'org-keystone', phone: '610-555-0151', city: 'Reading', state: 'PA' }),
    organization('org-pine', 'SERVPRO of Pine Ridge', 'servpro_franchise', { parentOrganizationId: 'org-keystone', phone: '610-555-0152', city: 'Shillington', state: 'PA' }),
    organization('org-timpview', 'SERVPRO of Timpview', 'servpro_franchise', { parentOrganizationId: 'org-wasatch', phone: '801-555-0161', city: 'American Fork', state: 'UT' }),
    organization('org-carrier', 'Blue Mountain Mutual Insurance', 'insurance_carrier', { isReferralPartner: false, phone: '800-555-0170', city: 'Harrisburg', state: 'PA' }),
    organization('org-maple', 'Maple Court Property Management', 'property_manager', { phone: '610-555-0180', city: 'Wyomissing', state: 'PA' }),
  ]
}

function contact(id: string, firstName: string, lastName: string, organizationId: string | null, extra: Partial<Contact> = {}): Contact {
  return { id, organizationId, firstName, lastName, title: null, contactRole: null, phone: null, mobile: null, email: null, notes: null, ...extra }
}

export function sampleContacts(): Contact[] {
  return [
    contact('contact-priya', 'Priya', 'Nandakumar', 'org-birch', { title: 'Mitigation manager', contactRole: 'mitigation_manager', phone: '610-555-0151', mobile: '610-555-0191', email: 'priya@example.com' }),
    contact('contact-marcus', 'Marcus', 'Bell', 'org-birch', { title: 'Dispatcher', contactRole: 'dispatcher', phone: '610-555-0151', email: 'marcus@example.com' }),
    contact('contact-elena', 'Elena', 'Vasquez', 'org-pine', { title: 'General manager', contactRole: 'general_manager', phone: '610-555-0152', mobile: '610-555-0192' }),
    contact('contact-owen', 'Owen', 'Hatch', 'org-timpview', { title: 'Owner', contactRole: 'owner', mobile: '801-555-0193' }),
    contact('contact-theo', 'Theo', 'Lindqvist', 'org-carrier', { title: 'Field adjuster', contactRole: 'adjuster', mobile: '717-555-0194', email: 'theo@example.com' }),
    contact('contact-rosa', 'Rosa', 'Delgado', null, { title: 'Independent agent', contactRole: 'agent', mobile: '610-555-0195', email: 'rosa@example.com' }),
  ]
}

export const PASSWORD = 'correct horse'

export interface FakeBackend extends Backend {
  people: Person[]
  locations: Locations
  customers: Customer[]
  properties: Property[]
  organizations: Organization[]
  contacts: Contact[]
  updates: PersonChange[]
  added: NewPerson[]
  myDetails: MyDetails[]
  addedCustomers: NewCustomer[]
  customerChanges: CustomerChange[]
  addedProperties: { customerId: string; property: NewProperty }[]
  addedOrganizations: NewOrganization[]
  organizationChanges: OrganizationChange[]
  addedContacts: NewContact[]
  contactChanges: ContactChange[]
  searches: string[]
  /** Each person's password. Everyone starts on PASSWORD. */
  passwords: Map<string, string>
  /** People still on a temporary password. */
  temporary: Set<string>
}

let nextTemporary = 1

/** Commas and runs of spaces do not matter, as in the database's search. */
function plain(text: string): string {
  return text.replace(/[,\s]+/g, ' ').trim().toLowerCase()
}

function matches(text: string | null | undefined, query: string): boolean {
  return Boolean(text && plain(text).includes(plain(query)))
}

export function fakeBackend(options: { signedInAs?: string | null; locations?: Locations } = {}): FakeBackend {
  let user: SessionUser | null = null
  let nextId = 1
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
    customers: sampleCustomers(),
    properties: sampleProperties(),
    organizations: sampleOrganizations(),
    contacts: sampleContacts(),
    updates: [],
    added: [],
    myDetails: [],
    addedCustomers: [],
    customerChanges: [],
    addedProperties: [],
    addedOrganizations: [],
    organizationChanges: [],
    addedContacts: [],
    contactChanges: [],
    searches: [],
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
        officeIds: [...person.officeIds],
        primaryOfficeId: person.primaryOfficeId,
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

    // ----- Customers and properties -----

    async loadCustomers() {
      return backend.customers.map((customer) => ({ ...customer }))
    },
    async loadCustomer(customerId) {
      const customer = backend.customers.find((candidate) => candidate.id === customerId)
      return customer ? { ...customer } : null
    },
    async loadProperties(customerId) {
      return backend.properties.filter((property) => !customerId || property.customerId === customerId).map((property) => ({ ...property }))
    },
    async findCustomersByPhone(phone) {
      const key = phoneKey(phone)
      if (key.length < 7) return []
      return backend.customers
        .filter((customer) => phoneKey(customer.phone) === key || (customer.phoneAlt !== null && phoneKey(customer.phoneAlt) === key))
        .map(
          (customer): PhoneMatch => ({
            customerId: customer.id,
            displayName: customerName(customer),
            officeName: backend.locations.offices.find((office) => office.id === customer.officeId)?.name ?? '',
            canOpen: true,
          }),
        )
    },
    async addCustomer(customer) {
      backend.addedCustomers.push(customer)
      const id = `customer-new-${nextId++}`
      backend.customers.push({
        id,
        customerType: customer.customerType,
        firstName: customer.firstName,
        lastName: customer.lastName,
        companyName: customer.companyName,
        phone: customer.phone,
        phoneAlt: null,
        email: customer.email,
        preferredContact: null,
        officeId: customer.officeId,
        notes: null,
        createdAt: new Date().toISOString(),
      })
      if (customer.property) {
        backend.properties.push({ id: `property-new-${nextId++}`, customerId: id, notes: null, ...customer.property })
      }
      return { customerId: id }
    },
    async updateCustomer(change) {
      backend.customerChanges.push(change)
      const customer = backend.customers.find((candidate) => candidate.id === change.customerId)
      if (!customer) throw new FriendlyError('You do not have permission to change this customer.')
      const { customerId: _ignored, ...fields } = change
      Object.assign(customer, fields)
    },
    async addProperty(customerId, property) {
      backend.addedProperties.push({ customerId, property })
      const id = `property-new-${nextId++}`
      backend.properties.push({ id, customerId, notes: null, ...property })
      return { propertyId: id }
    },

    // ----- Organizations and contacts -----

    async loadOrganizations() {
      return backend.organizations.map((organization) => ({ ...organization }))
    },
    async loadContacts() {
      return backend.contacts.map((contact) => ({ ...contact }))
    },
    async addOrganization(organization) {
      backend.addedOrganizations.push(organization)
      const id = `org-new-${nextId++}`
      backend.organizations.push({ id, ...organization })
      return { organizationId: id }
    },
    async updateOrganization(change) {
      backend.organizationChanges.push(change)
      const organization = backend.organizations.find((candidate) => candidate.id === change.organizationId)
      if (!organization) throw new FriendlyError('That organization was not found.')
      const { organizationId: _ignored, ...fields } = change
      Object.assign(organization, fields)
    },
    async addContact(contact) {
      backend.addedContacts.push(contact)
      const id = `contact-new-${nextId++}`
      backend.contacts.push({ id, ...contact })
      return { contactId: id }
    },
    async updateContact(change) {
      backend.contactChanges.push(change)
      const found = backend.contacts.find((candidate) => candidate.id === change.contactId)
      if (!found) throw new FriendlyError('That contact was not found.')
      const { contactId: _ignored, ...fields } = change
      Object.assign(found, fields)
    },

    // ----- Search -----

    async search(query) {
      backend.searches.push(query)
      const q = query.trim()
      if (!q) return []
      // Only a query with no letters is also a phone number, as in the database.
      const digits = /[a-z]/i.test(q) ? '' : phoneKey(q)
      const customers: SearchResult[] = []
      for (const customer of backend.customers) {
        const properties = backend.properties.filter((property) => property.customerId === customer.id)
        const hit =
          matches(customerName(customer), q) ||
          matches(customer.email, q) ||
          (digits.length >= 3 && phoneKey(customer.phone).includes(digits)) ||
          (digits.length >= 3 && customer.phoneAlt !== null && phoneKey(customer.phoneAlt).includes(digits)) ||
          properties.some((property) => matches(`${property.addressLine1} ${property.addressLine2 ?? ''} ${property.city ?? ''} ${property.state ?? ''} ${property.zip ?? ''}`, q))
        if (hit) {
          const first = properties[0]
          customers.push({
            kind: 'customer',
            id: customer.id,
            title: customerName(customer),
            detail: [customer.phone, first && `${first.addressLine1}, ${first.city ?? ''}`].filter(Boolean).join(' · '),
          })
        }
      }
      const organizations: SearchResult[] = backend.organizations
        .filter((organization) => matches(organization.name, q))
        .map((organization) => ({ kind: 'organization', id: organization.id, title: organization.name, detail: organization.orgType }))
      const contacts: SearchResult[] = backend.contacts
        .filter((found) => matches(contactName(found), q))
        .map((found) => ({
          kind: 'contact',
          id: found.id,
          title: contactName(found),
          detail: backend.organizations.find((organization) => organization.id === found.organizationId)?.name ?? null,
        }))
      // Like the database: up to SEARCH_LIMIT of each kind.
      return [...customers.slice(0, SEARCH_LIMIT), ...organizations.slice(0, SEARCH_LIMIT), ...contacts.slice(0, SEARCH_LIMIT)]
    },
  }
  return backend
}
