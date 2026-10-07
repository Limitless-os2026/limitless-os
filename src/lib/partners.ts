// Partners: organizations and the professional contacts in them (spec
// section 7, "People and places"). SERVPRO ownership groups own franchises,
// franchises have contacts, and contacts refer jobs, so the Partners screen
// shows the chain in that order.

export type OrgType =
  | 'servpro_group'
  | 'servpro_franchise'
  | 'restoration_company'
  | 'insurance_carrier'
  | 'mortgage_company'
  | 'property_manager'
  | 'supplier'
  | 'subcontractor'
  | 'vendor'
  | 'other'

export const ORG_TYPES: { key: OrgType; label: string }[] = [
  { key: 'servpro_group', label: 'SERVPRO ownership group' },
  { key: 'servpro_franchise', label: 'SERVPRO franchise' },
  { key: 'restoration_company', label: 'Restoration company' },
  { key: 'insurance_carrier', label: 'Insurance carrier' },
  { key: 'mortgage_company', label: 'Mortgage company' },
  { key: 'property_manager', label: 'Property manager' },
  { key: 'supplier', label: 'Supplier' },
  { key: 'subcontractor', label: 'Subcontractor' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'other', label: 'Other' },
]

export type ContactRole =
  | 'owner'
  | 'general_manager'
  | 'mitigation_manager'
  | 'project_manager'
  | 'dispatcher'
  | 'estimator'
  | 'office_manager'
  | 'adjuster'
  | 'agent'
  | 'other'

export const CONTACT_ROLES: { key: ContactRole; label: string }[] = [
  { key: 'owner', label: 'Owner' },
  { key: 'general_manager', label: 'General manager' },
  { key: 'mitigation_manager', label: 'Mitigation manager' },
  { key: 'project_manager', label: 'Project manager' },
  { key: 'dispatcher', label: 'Dispatcher' },
  { key: 'estimator', label: 'Estimator' },
  { key: 'office_manager', label: 'Office manager' },
  { key: 'adjuster', label: 'Adjuster' },
  { key: 'agent', label: 'Agent' },
  { key: 'other', label: 'Other' },
]

export interface Organization {
  id: string
  name: string
  orgType: OrgType
  parentOrganizationId: string | null
  isReferralPartner: boolean
  phone: string | null
  email: string | null
  addressLine1: string | null
  city: string | null
  state: string | null
  zip: string | null
  notes: string | null
}

export interface Contact {
  id: string
  organizationId: string | null
  firstName: string | null
  lastName: string | null
  title: string | null
  contactRole: ContactRole | null
  phone: string | null
  mobile: string | null
  email: string | null
  notes: string | null
}

/** Changing an organization's type or parent needs this permission. */
export const MANAGE_PARTNER_STRUCTURE = 'manage_partner_structure'

export function orgTypeLabel(type: string | null | undefined): string {
  return ORG_TYPES.find((candidate) => candidate.key === type)?.label ?? ''
}

export function contactRoleLabel(role: ContactRole | null): string {
  return CONTACT_ROLES.find((candidate) => candidate.key === role)?.label ?? ''
}

export function contactName(contact: Pick<Contact, 'firstName' | 'lastName'>): string {
  const name = [contact.firstName, contact.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
  return name || 'No name'
}

/** An organization's address on one line. */
export function organizationAddress(organization: Pick<Organization, 'addressLine1' | 'city' | 'state' | 'zip'>): string {
  const stateZip = [organization.state, organization.zip]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
  return [organization.addressLine1?.trim(), organization.city?.trim(), stateZip].filter(Boolean).join(', ')
}

function byName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name)
}

function byContactName(a: Contact, b: Contact): number {
  return contactName(a).localeCompare(contactName(b))
}

/** One organization with its own contacts and the organizations under it. */
export interface PartnerBranch {
  organization: Organization
  contacts: Contact[]
  children: PartnerBranch[]
}

export interface PartnersTree {
  /** SERVPRO ownership groups, each with its franchises; franchises without a group follow. */
  servpro: PartnerBranch[]
  /** Everyone else: carriers, property managers, suppliers and so on. */
  others: PartnerBranch[]
  /** Contacts that belong to no organization. */
  unattached: Contact[]
}

function isServpro(organization: Organization): boolean {
  return organization.orgType === 'servpro_group' || organization.orgType === 'servpro_franchise'
}

/**
 * Builds the Partners screen: ownership groups first, then their franchises,
 * then each one's contacts. An organization whose parent is missing is
 * shown at the top level. Loops cannot be made in the database, but the
 * build stops at any organization it has already placed, just in case.
 */
export function partnersTree(organizations: readonly Organization[], contacts: readonly Contact[]): PartnersTree {
  const ids = new Set(organizations.map((organization) => organization.id))
  const placed = new Set<string>()

  function branch(organization: Organization): PartnerBranch {
    placed.add(organization.id)
    const children = organizations
      .filter((candidate) => candidate.parentOrganizationId === organization.id && !placed.has(candidate.id))
      .sort(byName)
      .map(branch)
    return {
      organization,
      contacts: contacts.filter((contact) => contact.organizationId === organization.id).sort(byContactName),
      children,
    }
  }

  const roots = organizations
    .filter((organization) => !organization.parentOrganizationId || !ids.has(organization.parentOrganizationId))
    .sort((a, b) => {
      // Ownership groups before lone franchises, then by name.
      const rank = (organization: Organization) => (organization.orgType === 'servpro_group' ? 0 : 1)
      return rank(a) - rank(b) || byName(a, b)
    })

  const servpro = roots.filter(isServpro).map(branch)
  const others = roots.filter((organization) => !isServpro(organization)).map(branch)
  // Anything left (only possible with a loop in the data) is shown at the top level too.
  const leftovers = organizations.filter((organization) => !placed.has(organization.id)).sort(byName)
  for (const organization of leftovers) {
    if (placed.has(organization.id)) continue
    ;(isServpro(organization) ? servpro : others).push(branch(organization))
  }

  return {
    servpro,
    others,
    unattached: contacts.filter((contact) => !contact.organizationId || !ids.has(contact.organizationId)).sort(byContactName),
  }
}

/** The organizations that may be the parent of the given one: not itself, and nothing beneath it. */
export function possibleParents(organizations: readonly Organization[], organizationId: string | null): Organization[] {
  const beneath = new Set<string>()
  if (organizationId) {
    beneath.add(organizationId)
    let grew = true
    while (grew) {
      grew = false
      for (const organization of organizations) {
        if (organization.parentOrganizationId && beneath.has(organization.parentOrganizationId) && !beneath.has(organization.id)) {
          beneath.add(organization.id)
          grew = true
        }
      }
    }
  }
  return organizations.filter((organization) => !beneath.has(organization.id)).sort(byName)
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const STATE = /^[A-Z]{2}$/

function blank(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export interface OrganizationForm {
  name: string
  orgType: OrgType | ''
  parentOrganizationId: string
  isReferralPartner: boolean
  phone: string
  email: string
  addressLine1: string
  city: string
  state: string
  zip: string
  notes: string
}

export const emptyOrganizationForm: OrganizationForm = {
  name: '',
  orgType: '',
  parentOrganizationId: '',
  isReferralPartner: false,
  phone: '',
  email: '',
  addressLine1: '',
  city: '',
  state: '',
  zip: '',
  notes: '',
}

export interface NewOrganization {
  name: string
  orgType: OrgType
  parentOrganizationId: string | null
  isReferralPartner: boolean
  phone: string | null
  email: string | null
  addressLine1: string | null
  city: string | null
  state: string | null
  zip: string | null
  notes: string | null
}

export interface OrganizationChange extends NewOrganization {
  organizationId: string
}

export function organizationFormFor(organization: Organization): OrganizationForm {
  return {
    name: organization.name,
    orgType: organization.orgType,
    parentOrganizationId: organization.parentOrganizationId ?? '',
    isReferralPartner: organization.isReferralPartner,
    phone: organization.phone ?? '',
    email: organization.email ?? '',
    addressLine1: organization.addressLine1 ?? '',
    city: organization.city ?? '',
    state: organization.state ?? '',
    zip: organization.zip ?? '',
    notes: organization.notes ?? '',
  }
}

/** Checks the organization form. Returns what to save, or a plain message. */
export function organizationFrom(form: OrganizationForm, organizationId: string | null = null): { organization: NewOrganization } | { error: string } {
  if (!form.name.trim()) return { error: "Enter the organization's name." }
  if (!form.orgType) return { error: 'Pick what kind of organization it is.' }
  if (organizationId && form.parentOrganizationId === organizationId) return { error: 'An organization cannot be part of itself.' }
  const email = form.email.trim()
  if (email && !EMAIL.test(email)) return { error: 'Enter a valid email address, or leave it empty.' }
  const state = form.state.trim().toUpperCase()
  if (state && !STATE.test(state)) return { error: 'Enter the state as two letters, such as PA.' }
  return {
    organization: {
      name: form.name.trim(),
      orgType: form.orgType,
      parentOrganizationId: form.parentOrganizationId || null,
      isReferralPartner: form.isReferralPartner,
      phone: blank(form.phone),
      email: email ? email.toLowerCase() : null,
      addressLine1: blank(form.addressLine1),
      city: blank(form.city),
      state: state || null,
      zip: blank(form.zip),
      notes: blank(form.notes),
    },
  }
}

export interface ContactForm {
  firstName: string
  lastName: string
  organizationId: string
  title: string
  contactRole: ContactRole | ''
  phone: string
  mobile: string
  email: string
  notes: string
}

export const emptyContactForm: ContactForm = {
  firstName: '',
  lastName: '',
  organizationId: '',
  title: '',
  contactRole: '',
  phone: '',
  mobile: '',
  email: '',
  notes: '',
}

export interface NewContact {
  firstName: string | null
  lastName: string | null
  organizationId: string | null
  title: string | null
  contactRole: ContactRole | null
  phone: string | null
  mobile: string | null
  email: string | null
  notes: string | null
}

export interface ContactChange extends NewContact {
  contactId: string
}

export function contactFormFor(contact: Contact): ContactForm {
  return {
    firstName: contact.firstName ?? '',
    lastName: contact.lastName ?? '',
    organizationId: contact.organizationId ?? '',
    title: contact.title ?? '',
    contactRole: contact.contactRole ?? '',
    phone: contact.phone ?? '',
    mobile: contact.mobile ?? '',
    email: contact.email ?? '',
    notes: contact.notes ?? '',
  }
}

/** Checks the contact form. Returns what to save, or a plain message. */
export function contactFrom(form: ContactForm): { contact: NewContact } | { error: string } {
  if (!form.firstName.trim() && !form.lastName.trim()) return { error: "Enter the contact's name." }
  const email = form.email.trim()
  if (email && !EMAIL.test(email)) return { error: 'Enter a valid email address, or leave it empty.' }
  return {
    contact: {
      firstName: blank(form.firstName),
      lastName: blank(form.lastName),
      organizationId: form.organizationId || null,
      title: blank(form.title),
      contactRole: form.contactRole || null,
      phone: blank(form.phone),
      mobile: blank(form.mobile),
      email: email ? email.toLowerCase() : null,
      notes: blank(form.notes),
    },
  }
}

/** The one search box: what it found, grouped by kind. */
export type SearchKind = 'customer' | 'organization' | 'contact'

export interface SearchResult {
  kind: SearchKind
  id: string
  title: string
  detail: string | null
}

/** The most matches of each kind a search gives back (the database's search_records stops there too). */
export const SEARCH_LIMIT = 20

/** The web address of a contact's page. Contacts live under Partners. */
export function contactPath(contactId: string): string {
  return `/partners/contacts/${contactId}`
}

export function newContactPath(organizationId?: string | null): string {
  return organizationId ? `/partners/contacts/new?organization=${organizationId}` : '/partners/contacts/new'
}
