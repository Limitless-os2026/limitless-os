// Customers and their properties (spec section 7, "People and places", and
// section 8, "Decisions from step 3"). A customer needs a name and a phone
// number, nothing else. Phone numbers are matched on their digits only, so
// the same number written two ways is still the same number.

import type { OfficeRecord, StateRecord } from './locations'
import type { SignedInPerson } from './people'

export type CustomerType = 'person' | 'company'
export type PreferredContact = 'call' | 'text' | 'email'
export type PropertyType = 'residential' | 'commercial' | 'multi_family'

export const PREFERRED_CONTACTS: { key: PreferredContact; label: string }[] = [
  { key: 'call', label: 'Call' },
  { key: 'text', label: 'Text' },
  { key: 'email', label: 'Email' },
]

export const PROPERTY_TYPES: { key: PropertyType; label: string }[] = [
  { key: 'residential', label: 'Residential' },
  { key: 'commercial', label: 'Commercial' },
  { key: 'multi_family', label: 'Multi-family' },
]

export interface Customer {
  id: string
  customerType: CustomerType
  firstName: string | null
  lastName: string | null
  companyName: string | null
  phone: string
  phoneAlt: string | null
  email: string | null
  preferredContact: PreferredContact | null
  officeId: string
  notes: string | null
  createdAt: string
}

export interface Property {
  id: string
  customerId: string
  addressLine1: string
  addressLine2: string | null
  city: string | null
  state: string | null
  zip: string | null
  propertyType: PropertyType | null
  notes: string | null
}

/** A customer who already has the phone number being typed. */
export interface PhoneMatch {
  customerId: string
  displayName: string
  officeName: string
  /** Whether the signed-in person may open that customer. */
  canOpen: boolean
}

/** The digits of a phone number, however it was written. */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '')
}

/** The digits that identify a phone number: a leading 1 (the US country code) is dropped. */
export function phoneKey(phone: string): string {
  const digits = phoneDigits(phone)
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
}

/** The fewest digits a phone number can have. */
export const MINIMUM_PHONE_DIGITS = 7

/** Whether there is enough of a phone number to look for a duplicate. */
export function isPhoneComplete(phone: string): boolean {
  return phoneKey(phone).length >= MINIMUM_PHONE_DIGITS
}

/** A US number as (610) 555-0100; anything else as it was typed. */
export function formatPhone(phone: string): string {
  const key = phoneKey(phone)
  if (key.length === 10) return `(${key.slice(0, 3)}) ${key.slice(3, 6)}-${key.slice(6)}`
  return phone.trim()
}

export function customerName(customer: Pick<Customer, 'customerType' | 'firstName' | 'lastName' | 'companyName'>): string {
  const company = customer.companyName?.trim()
  if (customer.customerType === 'company' && company) return company
  const person = [customer.firstName, customer.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
  return person || company || 'No name'
}

/** "412 Birchwood Lane, Reading, PA 19601", leaving out whatever is missing. */
export function propertyAddress(property: Pick<Property, 'addressLine1' | 'addressLine2' | 'city' | 'state' | 'zip'>): string {
  const street = [property.addressLine1, property.addressLine2]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ')
  const stateZip = [property.state, property.zip]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
  return [street, property.city?.trim(), stateZip].filter(Boolean).join(', ')
}

export function propertyTypeLabel(type: PropertyType | null): string {
  return PROPERTY_TYPES.find((candidate) => candidate.key === type)?.label ?? ''
}

export function preferredContactLabel(preferred: PreferredContact | null): string {
  return PREFERRED_CONTACTS.find((candidate) => candidate.key === preferred)?.label ?? ''
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const STATE = /^[A-Z]{2}$/

/** The property address fields on the forms. */
export interface PropertyForm {
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  zip: string
  propertyType: PropertyType | ''
}

export const emptyPropertyForm: PropertyForm = {
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  zip: '',
  propertyType: 'residential',
}

export interface NewProperty {
  addressLine1: string
  addressLine2: string | null
  city: string | null
  state: string | null
  zip: string | null
  propertyType: PropertyType | null
}

function blank(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/** Checks a property address. Returns the property, or a plain message. */
export function newPropertyFrom(form: PropertyForm): { property: NewProperty } | { error: string } {
  if (!form.addressLine1.trim()) return { error: 'Enter the street address.' }
  const state = form.state.trim().toUpperCase()
  if (state && !STATE.test(state)) return { error: 'Enter the state as two letters, such as PA.' }
  return {
    property: {
      addressLine1: form.addressLine1.trim(),
      addressLine2: blank(form.addressLine2),
      city: blank(form.city),
      state: state || null,
      zip: blank(form.zip),
      propertyType: form.propertyType || null,
    },
  }
}

/** Whether anything has been typed into the property address. */
export function hasPropertyInput(form: PropertyForm): boolean {
  return Boolean(form.addressLine1.trim() || form.addressLine2.trim() || form.city.trim() || form.state.trim() || form.zip.trim())
}

/** The New customer form: a name and a phone, plus an optional email and property address. */
export interface NewCustomerForm {
  customerType: CustomerType
  firstName: string
  lastName: string
  companyName: string
  phone: string
  email: string
  officeId: string
  property: PropertyForm
}

export interface NewCustomer {
  customerType: CustomerType
  firstName: string | null
  lastName: string | null
  companyName: string | null
  phone: string
  email: string | null
  officeId: string
  property: NewProperty | null
}

function nameProblem(form: Pick<NewCustomerForm, 'customerType' | 'firstName' | 'companyName'>): string | null {
  if (form.customerType === 'company') {
    if (!form.companyName.trim()) return 'Enter the company name.'
  } else if (!form.firstName.trim()) {
    return 'Enter their first name.'
  }
  return null
}

function phoneProblem(phone: string): string | null {
  if (phoneKey(phone).length < MINIMUM_PHONE_DIGITS) return 'Enter a phone number with at least 7 digits.'
  return null
}

function emailProblem(email: string): string | null {
  const trimmed = email.trim()
  if (trimmed && !EMAIL.test(trimmed)) return 'Enter a valid email address, or leave it empty.'
  return null
}

/** Checks the New customer form. Returns the customer to save, or a plain message. */
export function newCustomerFrom(form: NewCustomerForm): { customer: NewCustomer } | { error: string } {
  const problem = nameProblem(form) ?? phoneProblem(form.phone) ?? emailProblem(form.email)
  if (problem) return { error: problem }
  if (!form.officeId) return { error: 'Pick the office this customer belongs to.' }

  let property: NewProperty | null = null
  if (hasPropertyInput(form.property)) {
    const checked = newPropertyFrom(form.property)
    if ('error' in checked) {
      return { error: form.property.addressLine1.trim() ? checked.error : 'Enter the street address, or clear the rest of the property address.' }
    }
    property = checked.property
  }

  return {
    customer: {
      customerType: form.customerType,
      firstName: blank(form.firstName),
      lastName: blank(form.lastName),
      companyName: form.customerType === 'company' ? blank(form.companyName) : null,
      phone: form.phone.trim(),
      email: blank(form.email)?.toLowerCase() ?? null,
      officeId: form.officeId,
      property,
    },
  }
}

/** The Edit customer form. */
export interface CustomerForm {
  customerType: CustomerType
  firstName: string
  lastName: string
  companyName: string
  phone: string
  phoneAlt: string
  email: string
  preferredContact: PreferredContact | ''
  notes: string
}

export interface CustomerChange {
  customerId: string
  customerType: CustomerType
  firstName: string | null
  lastName: string | null
  companyName: string | null
  phone: string
  phoneAlt: string | null
  email: string | null
  preferredContact: PreferredContact | null
  notes: string | null
}

export function customerFormFor(customer: Customer): CustomerForm {
  return {
    customerType: customer.customerType,
    firstName: customer.firstName ?? '',
    lastName: customer.lastName ?? '',
    companyName: customer.companyName ?? '',
    phone: customer.phone,
    phoneAlt: customer.phoneAlt ?? '',
    email: customer.email ?? '',
    preferredContact: customer.preferredContact ?? '',
    notes: customer.notes ?? '',
  }
}

/** Checks the Edit customer form. Returns the change to save, or a plain message. */
export function customerChangeFrom(customerId: string, form: CustomerForm): { change: CustomerChange } | { error: string } {
  const problem = nameProblem(form) ?? phoneProblem(form.phone) ?? emailProblem(form.email)
  if (problem) return { error: problem }
  return {
    change: {
      customerId,
      customerType: form.customerType,
      firstName: blank(form.firstName),
      lastName: blank(form.lastName),
      companyName: form.customerType === 'company' ? blank(form.companyName) : null,
      phone: form.phone.trim(),
      phoneAlt: blank(form.phoneAlt),
      email: blank(form.email)?.toLowerCase() ?? null,
      preferredContact: form.preferredContact || null,
      notes: blank(form.notes),
    },
  }
}

/**
 * The offices a new customer can go in: any open office for company-scope
 * roles, otherwise the person's own offices. The first choice is their main
 * office.
 */
export function officesForNewCustomer(person: SignedInPerson, offices: readonly OfficeRecord[]): OfficeRecord[] {
  const open = offices.filter((office) => office.isActive)
  const mine = person.role.scope === 'company' ? open : open.filter((office) => person.officeIds.includes(office.id))
  return [...mine].sort((a, b) => {
    if (a.id === person.primaryOfficeId) return -1
    if (b.id === person.primaryOfficeId) return 1
    return a.name.localeCompare(b.name)
  })
}

/** A customer's office as "Reading, PA". */
export function customerOfficeLabel(customer: Pick<Customer, 'officeId'>, offices: readonly OfficeRecord[], states: readonly StateRecord[]): string {
  const office = offices.find((candidate) => candidate.id === customer.officeId)
  if (!office) return ''
  const state = states.find((candidate) => candidate.id === office.stateId)
  return state ? `${office.name}, ${state.code}` : office.name
}

/** Customers in name order, with companies by company name. */
export function sortCustomers<T extends Pick<Customer, 'customerType' | 'firstName' | 'lastName' | 'companyName'>>(customers: readonly T[]): T[] {
  return [...customers].sort((a, b) => customerName(a).localeCompare(customerName(b)))
}

/** The plain text of the duplicate warning. */
export function duplicateWarning(matches: readonly PhoneMatch[]): string | null {
  const [first, ...rest] = matches
  if (!first) return null
  const who = rest.length === 0 ? first.displayName : `${first.displayName} and ${rest.length} more`
  return `This phone number already belongs to ${who} (${first.officeName} office).`
}
