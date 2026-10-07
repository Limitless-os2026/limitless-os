import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient } from '@tanstack/react-query'
import { createMemoryRouter } from 'react-router'
import { App } from '../App'
import { routes } from '../routes'
import { fakeBackend, type FakeBackend } from '../test/fakeBackend'

function renderApp(path: string, backend: FakeBackend = fakeBackend({ signedInAs: 'user-admin' })) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<App backend={backend} router={router} queryClient={queryClient} />)
  return { router, backend }
}

describe('Partners list', () => {
  it('shows each SERVPRO ownership group, then its franchises, then their contacts', async () => {
    renderApp('/partners')

    const servpro = await screen.findByRole('region', { name: 'SERVPRO' })
    const rows = within(servpro).getAllByRole('link')
    expect(rows.map((row) => within(row).getByText(/./, { selector: '.list-row__title' }).textContent)).toEqual([
      'Keystone Restoration Holdings',
      'SERVPRO of Birch Hollow',
      'Marcus Bell',
      'Priya Nandakumar',
      'SERVPRO of Pine Ridge',
      'Elena Vasquez',
      'Wasatch Mitigation Partners',
      'SERVPRO of Timpview',
      'Owen Hatch',
    ])
    // Each level steps in further than the one above.
    expect(rows[0]).toHaveStyle({ '--depth': '0' })
    expect(rows[1]).toHaveStyle({ '--depth': '1' })
    expect(rows[2]).toHaveStyle({ '--depth': '2' })
    expect(rows[2]).toHaveAttribute('href', '/partners/contacts/contact-marcus')
    expect(rows[1]).toHaveAttribute('href', '/partners/org-birch')

    const others = screen.getByRole('region', { name: 'Other partners' })
    expect(within(others).getAllByRole('link').map((row) => row.textContent)).toEqual([
      'Blue Mountain Mutual InsuranceInsurance carrier(800) 555-0170',
      'Theo LindqvistField adjuster(717) 555-0194',
      'Maple Court Property ManagementProperty manager(610) 555-0180',
    ])

    const unattached = screen.getByRole('region', { name: 'Contacts without an organization' })
    expect(within(unattached).getByRole('link', { name: /Rosa Delgado/ })).toBeInTheDocument()
    expect(screen.getByText('7 organizations, 6 contacts')).toBeInTheDocument()
  })

  it('counts in the singular when there is one of something', async () => {
    const backend = fakeBackend({ signedInAs: 'user-admin' })
    backend.organizations.splice(1)
    backend.contacts.splice(1)
    renderApp('/partners', backend)
    expect(await screen.findByText('1 organization, 1 contact')).toBeInTheDocument()
  })

  it('offers a new organization as the next step and a new contact beside it', async () => {
    renderApp('/partners')
    expect(await screen.findByRole('link', { name: 'New organization' })).toHaveClass('button-next')
    expect(screen.getByRole('link', { name: 'New contact' })).not.toHaveClass('button-next')
  })
})

describe('Organization page', () => {
  it('shows the chain, the contacts and the details', async () => {
    renderApp('/partners/org-birch')

    expect(await screen.findByRole('heading', { level: 1, name: 'SERVPRO of Birch Hollow' })).toBeInTheDocument()
    const details = screen.getByRole('region', { name: 'Details' })
    expect(within(details).getByText('SERVPRO franchise')).toBeInTheDocument()
    expect(within(details).getByRole('link', { name: 'Keystone Restoration Holdings' })).toHaveAttribute('href', '/partners/org-keystone')
    expect(within(details).getByText('Yes')).toBeInTheDocument()
    expect(within(details).getByText('Reading, PA')).toBeInTheDocument()

    const contacts = screen.getByRole('region', { name: 'Contacts' })
    expect(within(contacts).getAllByRole('link').map((row) => row.textContent)).toEqual([
      'Marcus BellDispatcher(610) 555-0151',
      'Priya NandakumarMitigation manager(610) 555-0191',
    ])
    expect(screen.getByRole('link', { name: 'Add contact' })).toHaveAttribute('href', '/partners/contacts/new?organization=org-birch')
    expect(screen.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:6105550151')
  })

  it('lists the franchises of an ownership group', async () => {
    renderApp('/partners/org-keystone')

    const franchises = await screen.findByRole('region', { name: 'Franchises' })
    expect(within(franchises).getAllByRole('link').map((row) => row.textContent)).toEqual([
      'SERVPRO of Birch HollowSERVPRO franchise(610) 555-0151',
      'SERVPRO of Pine RidgeSERVPRO franchise(610) 555-0152',
    ])
  })
})

describe('organizations', () => {
  it('adds a franchise under its ownership group', async () => {
    const user = userEvent.setup()
    const { router, backend } = renderApp('/partners/new', fakeBackend({ signedInAs: 'user-sales' }))

    await user.click(await screen.findByRole('button', { name: 'Save organization' }))
    expect(screen.getByRole('alert')).toHaveTextContent("Enter the organization's name.")

    await user.type(screen.getByLabelText('Name'), 'SERVPRO of Maple Hollow')
    await user.click(screen.getByRole('button', { name: 'Save organization' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Pick what kind of organization it is.')

    await user.selectOptions(screen.getByLabelText('Kind'), 'SERVPRO franchise')
    await user.selectOptions(screen.getByLabelText(/^Part of/), 'Keystone Restoration Holdings')
    await user.click(screen.getByLabelText('Refers jobs to us'))
    await user.type(screen.getByLabelText(/^Phone/), '610-555-0153')
    await user.click(screen.getByRole('button', { name: 'Save organization' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'SERVPRO of Maple Hollow' })).toBeInTheDocument()
    expect(router.state.location.pathname).toMatch(/^\/partners\/org-new-/)
    expect(backend.addedOrganizations).toEqual([
      expect.objectContaining({
        name: 'SERVPRO of Maple Hollow',
        orgType: 'servpro_franchise',
        parentOrganizationId: 'org-keystone',
        isReferralPartner: true,
        phone: '610-555-0153',
      }),
    ])
  })

  it('lets Sales edit the phone but not the kind or parent', async () => {
    const user = userEvent.setup()
    const { backend } = renderApp('/partners/org-pine/edit', fakeBackend({ signedInAs: 'user-sales' }))

    expect(await screen.findByLabelText('Kind')).toBeDisabled()
    expect(screen.getByLabelText(/^Part of/)).toBeDisabled()
    expect(screen.getByText('Only a Project manager or Admin can change the kind or the parent.')).toBeInTheDocument()

    const phone = screen.getByLabelText(/^Phone/)
    await user.clear(phone)
    await user.type(phone, '610-555-0159')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await screen.findByRole('region', { name: 'Details' })
    expect(backend.organizationChanges).toEqual([
      expect.objectContaining({ organizationId: 'org-pine', phone: '610-555-0159', orgType: 'servpro_franchise', parentOrganizationId: 'org-keystone' }),
    ])
  })

  it('lets an Admin move a franchise to another group, but never under itself', async () => {
    const user = userEvent.setup()
    const { backend } = renderApp('/partners/org-keystone/edit')

    const parent = await screen.findByLabelText(/^Part of/)
    expect(parent).toBeEnabled()
    // Not itself, and not its own franchises.
    expect(within(parent).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'None',
      'Blue Mountain Mutual Insurance',
      'Maple Court Property Management',
      'SERVPRO of Timpview',
      'Wasatch Mitigation Partners',
    ])
    await user.selectOptions(parent, 'Wasatch Mitigation Partners')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await screen.findByRole('region', { name: 'Details' })
    expect(backend.organizationChanges[0]?.parentOrganizationId).toBe('org-wasatch')
  })
})

describe('contacts', () => {
  it('adds a contact to the organization it was opened from', async () => {
    const user = userEvent.setup()
    const { router, backend } = renderApp('/partners/org-birch', fakeBackend({ signedInAs: 'user-sales' }))

    await user.click(await screen.findByRole('link', { name: 'Add contact' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'New contact' })).toBeInTheDocument()
    expect(screen.getByLabelText('Organization')).toHaveValue('org-birch')

    await user.click(screen.getByRole('button', { name: 'Save contact' }))
    expect(screen.getByRole('alert')).toHaveTextContent("Enter the contact's name.")

    await user.type(screen.getByLabelText('First name'), 'Jordan')
    await user.type(screen.getByLabelText('Last name'), 'Ruiz')
    await user.selectOptions(screen.getByLabelText('Role'), 'Estimator')
    await user.type(screen.getByLabelText(/^Mobile/), '610-555-0196')
    await user.click(screen.getByRole('button', { name: 'Save contact' }))

    const contacts = await screen.findByRole('region', { name: 'Contacts' })
    expect(router.state.location.pathname).toBe('/partners/org-birch')
    expect(await within(contacts).findByRole('link', { name: /Jordan Ruiz/ })).toHaveTextContent('Estimator')
    expect(backend.addedContacts).toEqual([
      expect.objectContaining({ firstName: 'Jordan', lastName: 'Ruiz', organizationId: 'org-birch', contactRole: 'estimator', mobile: '610-555-0196' }),
    ])
  })

  it('opens a contact with call, text and email links, and saves changes', async () => {
    const user = userEvent.setup()
    const { router, backend } = renderApp('/partners/contacts/contact-priya', fakeBackend({ signedInAs: 'user-sales' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Priya Nandakumar' })).toBeInTheDocument()
    expect(screen.getByText('Mitigation manager · SERVPRO of Birch Hollow')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:6105550191')
    expect(screen.getByRole('link', { name: 'Text' })).toHaveAttribute('href', 'sms:6105550191')
    expect(screen.getByRole('link', { name: 'Email' })).toHaveAttribute('href', 'mailto:priya@example.com')

    await user.type(screen.getByLabelText(/^Title/), ' (acting)')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await screen.findByRole('region', { name: 'Contacts' })
    expect(router.state.location.pathname).toBe('/partners/org-birch')
    expect(backend.contactChanges).toEqual([expect.objectContaining({ contactId: 'contact-priya', title: 'Mitigation manager (acting)' })])
  })

  it('can add a contact with no organization', async () => {
    const user = userEvent.setup()
    const { router, backend } = renderApp('/partners/contacts/new', fakeBackend({ signedInAs: 'user-sales' }))

    await user.type(await screen.findByLabelText('Last name'), 'Okonkwo')
    await user.click(screen.getByRole('button', { name: 'Save contact' }))

    await screen.findByRole('region', { name: 'Contacts without an organization' })
    expect(router.state.location.pathname).toBe('/partners')
    expect(backend.addedContacts[0]).toEqual(expect.objectContaining({ firstName: null, lastName: 'Okonkwo', organizationId: null }))
  })
})
