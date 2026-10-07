import {
  customerChangeFrom,
  customerName,
  defaultOfficeForNewCustomer,
  duplicateWarning,
  emptyPropertyForm,
  formatPhone,
  isPhoneComplete,
  newCustomerFrom,
  newPropertyFrom,
  officesForNewCustomer,
  phoneDigits,
  phoneKey,
  propertyAddress,
  sortCustomers,
  type CustomerForm,
  type NewCustomerForm,
} from './customers'
import type { OfficeRecord } from './locations'
import type { SignedInPerson } from './people'

describe('phone numbers', () => {
  it('keeps only the digits', () => {
    expect(phoneDigits('(610) 555-0100')).toBe('6105550100')
    expect(phoneDigits('+1 610.555.0100 ext 3')).toBe('161055501003')
  })

  it('treats a leading 1 as the country code', () => {
    expect(phoneKey('1-610-555-0100')).toBe('6105550100')
    expect(phoneKey('610-555-0100')).toBe('6105550100')
    // Eleven digits that do not start with 1 are left alone.
    expect(phoneKey('26105550100')).toBe('26105550100')
  })

  it('is complete once it has seven digits', () => {
    expect(isPhoneComplete('555-01')).toBe(false)
    expect(isPhoneComplete('555-0100')).toBe(true)
  })

  it('formats US numbers and leaves others as typed', () => {
    expect(formatPhone('6105550100')).toBe('(610) 555-0100')
    expect(formatPhone('1 (610) 555-0100')).toBe('(610) 555-0100')
    expect(formatPhone(' 555-0100 ')).toBe('555-0100')
  })
})

describe('names and addresses', () => {
  it("uses the company name for companies and the person's name otherwise", () => {
    expect(customerName({ customerType: 'company', firstName: 'Grace', lastName: 'Tran', companyName: 'Oakridge LLC' })).toBe('Oakridge LLC')
    expect(customerName({ customerType: 'person', firstName: 'Dana', lastName: 'Whitfield', companyName: null })).toBe('Dana Whitfield')
    expect(customerName({ customerType: 'person', firstName: 'Dana', lastName: null, companyName: null })).toBe('Dana')
    expect(customerName({ customerType: 'company', firstName: null, lastName: null, companyName: ' ' })).toBe('No name')
  })

  it('writes an address on one line, leaving out what is missing', () => {
    expect(propertyAddress({ addressLine1: '412 Birchwood Lane', addressLine2: null, city: 'Reading', state: 'PA', zip: '19601' })).toBe(
      '412 Birchwood Lane, Reading, PA 19601',
    )
    expect(propertyAddress({ addressLine1: '88 Quarry Road', addressLine2: 'Unit 2', city: null, state: null, zip: null })).toBe('88 Quarry Road, Unit 2')
    expect(propertyAddress({ addressLine1: '27 Alpine Loop', addressLine2: null, city: 'American Fork', state: 'UT', zip: null })).toBe(
      '27 Alpine Loop, American Fork, UT',
    )
  })

  it('sorts customers by the name they are shown with', () => {
    const sorted = sortCustomers([
      { customerType: 'person', firstName: 'Samuel', lastName: 'Okafor', companyName: null },
      { customerType: 'company', firstName: null, lastName: null, companyName: 'Oakridge Property Group LLC' },
      { customerType: 'person', firstName: 'Dana', lastName: 'Whitfield', companyName: null },
    ])
    expect(sorted.map(customerName)).toEqual(['Dana Whitfield', 'Oakridge Property Group LLC', 'Samuel Okafor'])
  })
})

describe('new customer', () => {
  const form: NewCustomerForm = {
    customerType: 'person',
    firstName: ' Dana ',
    lastName: 'Whitfield',
    companyName: '',
    phone: '(610) 555-0100',
    email: ' Dana@Example.com ',
    officeId: 'office-reading',
    property: { ...emptyPropertyForm },
  }

  it('needs only a name and a phone number', () => {
    expect(newCustomerFrom({ ...form, email: '', lastName: '' })).toEqual({
      customer: {
        customerType: 'person',
        firstName: 'Dana',
        lastName: null,
        companyName: null,
        phone: '(610) 555-0100',
        email: null,
        officeId: 'office-reading',
        property: null,
      },
    })
  })

  it('tidies the email and keeps the property when an address is typed', () => {
    const result = newCustomerFrom({
      ...form,
      property: { addressLine1: ' 412 Birchwood Lane ', addressLine2: '', city: 'Reading', state: 'pa', zip: '19601', propertyType: 'residential' },
    })
    expect(result).toEqual({
      customer: expect.objectContaining({
        email: 'dana@example.com',
        property: { addressLine1: '412 Birchwood Lane', addressLine2: null, city: 'Reading', state: 'PA', zip: '19601', propertyType: 'residential' },
      }),
    })
  })

  it('says what is missing', () => {
    expect(newCustomerFrom({ ...form, firstName: ' ' })).toEqual({ error: 'Enter their first name.' })
    expect(newCustomerFrom({ ...form, customerType: 'company' })).toEqual({ error: 'Enter the company name.' })
    expect(newCustomerFrom({ ...form, phone: '555-01' })).toEqual({ error: 'Enter a phone number with at least 7 digits.' })
    expect(newCustomerFrom({ ...form, email: 'dana' })).toEqual({ error: 'Enter a valid email address, or leave it empty.' })
    expect(newCustomerFrom({ ...form, officeId: '' })).toEqual({ error: 'Pick the office this customer belongs to.' })
    expect(newCustomerFrom({ ...form, property: { ...emptyPropertyForm, city: 'Reading' } })).toEqual({
      error: 'Enter the street address, or clear the rest of the property address.',
    })
    expect(newCustomerFrom({ ...form, property: { ...emptyPropertyForm, addressLine1: '412 Birchwood Lane', state: 'Penn' } })).toEqual({
      error: 'Enter the state as two letters, such as PA.',
    })
  })

  it('keeps the company name only for companies', () => {
    const result = newCustomerFrom({ ...form, customerType: 'company', companyName: 'Oakridge LLC', firstName: '' })
    expect('customer' in result && result.customer.companyName).toBe('Oakridge LLC')
    const person = newCustomerFrom({ ...form, companyName: 'Leftover' })
    expect('customer' in person && person.customer.companyName).toBeNull()
  })
})

describe('editing a customer', () => {
  const form: CustomerForm = {
    customerType: 'person',
    firstName: 'Dana',
    lastName: 'Whitfield',
    companyName: '',
    phone: '610-555-0100',
    phoneAlt: ' ',
    email: '',
    preferredContact: 'text',
    notes: ' Prefers afternoons ',
  }

  it('turns the form into a change', () => {
    expect(customerChangeFrom('c1', form)).toEqual({
      change: {
        customerId: 'c1',
        customerType: 'person',
        firstName: 'Dana',
        lastName: 'Whitfield',
        companyName: null,
        phone: '610-555-0100',
        phoneAlt: null,
        email: null,
        preferredContact: 'text',
        notes: 'Prefers afternoons',
      },
    })
  })

  it('still needs a name and a phone', () => {
    expect(customerChangeFrom('c1', { ...form, firstName: '' })).toEqual({ error: 'Enter their first name.' })
    expect(customerChangeFrom('c1', { ...form, phone: '' })).toEqual({ error: 'Enter a phone number with at least 7 digits.' })
  })
})

describe('adding a property', () => {
  it('needs a street address and a two-letter state', () => {
    expect(newPropertyFrom({ ...emptyPropertyForm })).toEqual({ error: 'Enter the street address.' })
    expect(newPropertyFrom({ ...emptyPropertyForm, addressLine1: '88 Quarry Road', state: 'Pennsylvania' })).toEqual({
      error: 'Enter the state as two letters, such as PA.',
    })
    expect(newPropertyFrom({ ...emptyPropertyForm, addressLine1: '88 Quarry Road', propertyType: '' })).toEqual({
      property: { addressLine1: '88 Quarry Road', addressLine2: null, city: null, state: null, zip: null, propertyType: null },
    })
  })
})

describe('which office a new customer goes in', () => {
  const offices: OfficeRecord[] = [
    { id: 'office-af', stateId: 'state-ut', name: 'American Fork', timeZone: 'America/Denver', isActive: true },
    { id: 'office-reading', stateId: 'state-pa', name: 'Reading', timeZone: 'America/New_York', isActive: true },
    { id: 'office-closed', stateId: 'state-pa', name: 'Closed office', timeZone: 'America/New_York', isActive: false },
  ]
  const person: SignedInPerson = {
    id: 'p1',
    firstName: 'Sam',
    lastName: 'Seller',
    email: null,
    phone: null,
    isActive: true,
    mustChangePassword: false,
    role: { id: 'r', key: 'sales', name: 'Sales', scope: 'own' },
    permissions: [],
    officeIds: ['office-reading'],
    primaryOfficeId: 'office-reading',
  }

  it('offers only their own offices to most people', () => {
    expect(officesForNewCustomer(person, offices).map((office) => office.id)).toEqual(['office-reading'])
  })

  it('offers every open office to company-wide roles, main office first', () => {
    const admin = { ...person, role: { ...person.role, scope: 'company' as const }, primaryOfficeId: 'office-reading' }
    expect(officesForNewCustomer(admin, offices).map((office) => office.id)).toEqual(['office-reading', 'office-af'])
  })

  it('offers nothing to a person in no office', () => {
    expect(officesForNewCustomer({ ...person, officeIds: [], primaryOfficeId: null }, offices)).toEqual([])
  })

  it('starts from the location filter when it names an office or a state with one office', () => {
    const states = [
      { id: 'state-pa', code: 'PA', name: 'Pennsylvania', isActive: true },
      { id: 'state-ut', code: 'UT', name: 'Utah', isActive: true },
    ]
    const choices = offices.filter((office) => office.isActive)
    expect(defaultOfficeForNewCustomer(choices, states, 'UT/office-af')).toBe('office-af')
    expect(defaultOfficeForNewCustomer(choices, states, 'UT')).toBe('office-af')
    // A closed office is not a choice, but its state still has one open office.
    expect(defaultOfficeForNewCustomer(choices, states, 'PA/office-closed')).toBe('office-reading')
    // A state with no choices, or all locations, falls back to the first choice.
    expect(defaultOfficeForNewCustomer(choices, states, 'NV')).toBe('office-af')
    expect(defaultOfficeForNewCustomer(choices, states, 'all')).toBe('office-af')
    expect(defaultOfficeForNewCustomer([], states, 'all')).toBe('')
  })
})

describe('duplicate warning', () => {
  it('names the customer and their office', () => {
    expect(duplicateWarning([{ customerId: 'c1', displayName: 'Dana Whitfield', officeName: 'Reading', canOpen: true }])).toBe(
      'This phone number already belongs to Dana Whitfield (Reading office).',
    )
    expect(
      duplicateWarning([
        { customerId: 'c1', displayName: 'Dana Whitfield', officeName: 'Reading', canOpen: true },
        { customerId: 'c2', displayName: 'Dan Whitfield', officeName: 'Reading', canOpen: false },
      ]),
    ).toBe('This phone number already belongs to Dana Whitfield and 1 more (Reading office).')
    expect(duplicateWarning([])).toBeNull()
  })
})
