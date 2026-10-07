import {
  contactFrom,
  contactName,
  emptyContactForm,
  emptyOrganizationForm,
  organizationAddress,
  organizationFrom,
  partnersTree,
  possibleParents,
  type Contact,
  type Organization,
} from './partners'

function organization(id: string, name: string, orgType: Organization['orgType'], parentOrganizationId: string | null = null): Organization {
  return {
    id,
    name,
    orgType,
    parentOrganizationId,
    isReferralPartner: true,
    phone: null,
    email: null,
    addressLine1: null,
    city: null,
    state: null,
    zip: null,
    notes: null,
  }
}

function contact(id: string, firstName: string, lastName: string, organizationId: string | null): Contact {
  return { id, organizationId, firstName, lastName, title: null, contactRole: null, phone: null, mobile: null, email: null, notes: null }
}

const organizations = [
  organization('pine', 'SERVPRO of Pine Ridge', 'servpro_franchise', 'keystone'),
  organization('carrier', 'Blue Mountain Mutual Insurance', 'insurance_carrier'),
  organization('wasatch', 'Wasatch Mitigation Partners', 'servpro_group'),
  organization('birch', 'SERVPRO of Birch Hollow', 'servpro_franchise', 'keystone'),
  organization('keystone', 'Keystone Restoration Holdings', 'servpro_group'),
  organization('lone', 'SERVPRO of Nowhere Yet', 'servpro_franchise'),
  organization('timpview', 'SERVPRO of Timpview', 'servpro_franchise', 'wasatch'),
]

const contacts = [
  contact('c1', 'Priya', 'Nandakumar', 'birch'),
  contact('c2', 'Marcus', 'Bell', 'birch'),
  contact('c3', 'Rosa', 'Delgado', null),
  contact('c4', 'Theo', 'Lindqvist', 'carrier'),
  contact('c5', 'Gone', 'Org', 'missing'),
]

describe('the partners tree', () => {
  it('shows ownership groups, then their franchises, then contacts', () => {
    const tree = partnersTree(organizations, contacts)
    expect(tree.servpro.map((branch) => branch.organization.name)).toEqual([
      'Keystone Restoration Holdings',
      'Wasatch Mitigation Partners',
      'SERVPRO of Nowhere Yet',
    ])
    const keystone = tree.servpro[0]
    expect(keystone?.children.map((branch) => branch.organization.name)).toEqual(['SERVPRO of Birch Hollow', 'SERVPRO of Pine Ridge'])
    expect(keystone?.children[0]?.contacts.map(contactName)).toEqual(['Marcus Bell', 'Priya Nandakumar'])
  })

  it('lists other partners apart, and contacts with no organization last', () => {
    const tree = partnersTree(organizations, contacts)
    expect(tree.others.map((branch) => branch.organization.name)).toEqual(['Blue Mountain Mutual Insurance'])
    expect(tree.others[0]?.contacts.map(contactName)).toEqual(['Theo Lindqvist'])
    expect(tree.unattached.map(contactName)).toEqual(['Gone Org', 'Rosa Delgado'])
  })

  it('places every organization even if the data has a loop', () => {
    const loop = [organization('a', 'A', 'other', 'b'), organization('b', 'B', 'other', 'a')]
    const tree = partnersTree(loop, [])
    const names = tree.others.flatMap((branch) => [branch.organization.name, ...branch.children.map((child) => child.organization.name)])
    expect(names.sort()).toEqual(['A', 'B'])
  })

  it('is empty when there is nothing yet', () => {
    expect(partnersTree([], [])).toEqual({ servpro: [], others: [], unattached: [] })
  })
})

describe('possible parents', () => {
  it('leaves out the organization itself and everything beneath it', () => {
    expect(possibleParents(organizations, 'keystone').map((candidate) => candidate.id)).toEqual(['carrier', 'lone', 'timpview', 'wasatch'])
    expect(possibleParents(organizations, null)).toHaveLength(7)
  })
})

describe('organization form', () => {
  const form = { ...emptyOrganizationForm, name: ' SERVPRO of Birch Hollow ', orgType: 'servpro_franchise' as const, parentOrganizationId: 'keystone' }

  it('tidies what was typed', () => {
    expect(organizationFrom({ ...form, email: ' Office@Example.com ', state: 'pa', phone: ' 610-555-0151 ' })).toEqual({
      organization: {
        name: 'SERVPRO of Birch Hollow',
        orgType: 'servpro_franchise',
        parentOrganizationId: 'keystone',
        isReferralPartner: false,
        phone: '610-555-0151',
        email: 'office@example.com',
        addressLine1: null,
        city: null,
        state: 'PA',
        zip: null,
        notes: null,
      },
    })
  })

  it('needs a name and a kind, and cannot be part of itself', () => {
    expect(organizationFrom({ ...form, name: ' ' })).toEqual({ error: "Enter the organization's name." })
    expect(organizationFrom({ ...form, orgType: '' })).toEqual({ error: 'Pick what kind of organization it is.' })
    expect(organizationFrom({ ...form, parentOrganizationId: 'birch' }, 'birch')).toEqual({ error: 'An organization cannot be part of itself.' })
    expect(organizationFrom({ ...form, email: 'nope' })).toEqual({ error: 'Enter a valid email address, or leave it empty.' })
    expect(organizationFrom({ ...form, state: 'Utah' })).toEqual({ error: 'Enter the state as two letters, such as PA.' })
  })

  it('writes the address on one line', () => {
    expect(organizationAddress({ addressLine1: '10 Mill Street', city: 'Reading', state: 'PA', zip: '19601' })).toBe('10 Mill Street, Reading, PA 19601')
    expect(organizationAddress({ addressLine1: null, city: 'Lehi', state: 'UT', zip: null })).toBe('Lehi, UT')
  })
})

describe('contact form', () => {
  it('needs a first or last name', () => {
    expect(contactFrom({ ...emptyContactForm })).toEqual({ error: "Enter the contact's name." })
    expect(contactFrom({ ...emptyContactForm, lastName: 'Bell' })).toEqual({
      contact: { firstName: null, lastName: 'Bell', organizationId: null, title: null, contactRole: null, phone: null, mobile: null, email: null, notes: null },
    })
  })

  it('tidies the rest', () => {
    expect(contactFrom({ ...emptyContactForm, firstName: ' Priya ', organizationId: 'birch', contactRole: 'mitigation_manager', email: 'Priya@Example.com ' })).toEqual({
      contact: expect.objectContaining({ firstName: 'Priya', organizationId: 'birch', contactRole: 'mitigation_manager', email: 'priya@example.com' }),
    })
    expect(contactFrom({ ...emptyContactForm, firstName: 'Priya', email: 'priya' })).toEqual({ error: 'Enter a valid email address, or leave it empty.' })
  })

  it('shows a name or says there is none', () => {
    expect(contactName({ firstName: 'Priya', lastName: null })).toBe('Priya')
    expect(contactName({ firstName: null, lastName: null })).toBe('No name')
  })
})
