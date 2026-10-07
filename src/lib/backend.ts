// Everything the app asks of the server, in one place. The real version talks
// to Supabase; the tests hand the app a stand-in with the same shape.

import type { Customer, CustomerChange, NewCustomer, NewProperty, PhoneMatch, Property } from './customers'
import type { Locations } from './locations'
import type {
  Contact,
  ContactChange,
  NewContact,
  NewOrganization,
  Organization,
  OrganizationChange,
  SearchResult,
} from './partners'
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

  /** The signed-in person's profile, role, permissions and offices. Null when they have no profile. */
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

  /** The customers the signed-in person may see, archived ones left out. */
  loadCustomers(): Promise<Customer[]>
  /** One customer, or null when there is no such customer they may see. */
  loadCustomer(customerId: string): Promise<Customer | null>
  /** The properties of one customer, or of every customer they may see. */
  loadProperties(customerId?: string): Promise<Property[]>
  /** Customers who already have this phone number, for the duplicate warning. */
  findCustomersByPhone(phone: string): Promise<PhoneMatch[]>
  /** Adds a customer, with their first property when one was typed. */
  addCustomer(customer: NewCustomer): Promise<{ customerId: string }>
  updateCustomer(change: CustomerChange): Promise<void>
  addProperty(customerId: string, property: NewProperty): Promise<{ propertyId: string }>

  loadOrganizations(): Promise<Organization[]>
  loadContacts(): Promise<Contact[]>
  addOrganization(organization: NewOrganization): Promise<{ organizationId: string }>
  updateOrganization(change: OrganizationChange): Promise<void>
  addContact(contact: NewContact): Promise<{ contactId: string }>
  updateContact(change: ContactChange): Promise<void>

  /** The one search box: customers, organizations and contacts the person may see. */
  search(query: string): Promise<SearchResult[]>
}

/** A problem worth telling the person about, in plain words. */
export class FriendlyError extends Error {}

export function friendlyMessage(error: unknown, fallback: string): string {
  return error instanceof FriendlyError ? error.message : fallback
}
