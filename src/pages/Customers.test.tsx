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

describe('Customers list', () => {
  it('lists customers by name with their first property and phone', async () => {
    renderApp('/customers')

    const list = await screen.findByRole('region', { name: 'Customers' })
    const rows = await within(list).findAllByRole('link')
    expect(rows.map((row) => row.textContent)).toEqual([
      'Dana Whitfield412 Birchwood Lane, Reading, PA 19601(610) 555-0101',
      'Luis Herrera27 Alpine Loop, American Fork, UT 84003(801) 555-0104',
      'Oakridge Property Group LLC1500 Commerce Drive, Wyomissing, PA 19610(610) 555-0103',
      'Samuel Okafor88 Quarry Road, Shillington, PA 19607(610) 555-0102',
    ])
    expect(screen.getByText('4 customers')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'New customer' })).toHaveAttribute('href', '/customers/new')
  })

  it('follows the location filter', async () => {
    const user = userEvent.setup()
    renderApp('/customers')

    await screen.findByRole('link', { name: /Dana Whitfield/ })
    await user.click(screen.getByRole('button', { name: 'Utah' }))

    const list = screen.getByRole('region', { name: 'Customers' })
    expect(within(list).getAllByRole('link')).toHaveLength(1)
    expect(within(list).getByRole('link', { name: /Luis Herrera/ })).toBeInTheDocument()
    expect(screen.getByText('1 customer')).toBeInTheDocument()
  })

  it('says so when there are no customers yet', async () => {
    const backend = fakeBackend({ signedInAs: 'user-sales' })
    backend.customers.length = 0
    renderApp('/customers', backend)

    expect(await screen.findByText('No customers yet. Add the first one.')).toBeInTheDocument()
  })
})

describe('Customer page', () => {
  it('shows the details, the properties, and call and text links', async () => {
    renderApp('/customers/customer-oakridge')

    expect(await screen.findByRole('heading', { level: 1, name: 'Oakridge Property Group LLC' })).toBeInTheDocument()
    expect(screen.getByText('Customer · Reading, PA')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:6105550103')
    expect(screen.getByRole('link', { name: 'Text' })).toHaveAttribute('href', 'sms:6105550103')
    expect(screen.getByRole('link', { name: 'Email' })).toHaveAttribute('href', 'mailto:grace@example.com')
    expect(screen.getByRole('link', { name: 'Add property' })).toHaveAttribute('href', '/customers/customer-oakridge/properties/new')

    const properties = screen.getByRole('region', { name: 'Properties' })
    expect(within(properties).getByText('1500 Commerce Drive, Wyomissing, PA 19610')).toBeInTheDocument()
    expect(within(properties).getByText('1510 Commerce Drive, Wyomissing, PA 19610')).toBeInTheDocument()
    expect(within(properties).getAllByText('Commercial')).toHaveLength(2)

    const details = screen.getByRole('region', { name: 'Details' })
    expect(within(details).getByText('(610) 555-0103')).toBeInTheDocument()
    expect(within(details).getByText('grace@example.com')).toBeInTheDocument()
    expect(within(details).getByText('Grace Tran')).toBeInTheDocument()
    expect(within(details).getByRole('link', { name: 'Edit details' })).toHaveAttribute('href', '/customers/customer-oakridge/edit')
  })

  it('adds a property', async () => {
    const user = userEvent.setup()
    const { router, backend } = renderApp('/customers/customer-samuel')

    await user.click(await screen.findByRole('link', { name: 'Add property' }))
    expect(await screen.findByText('New property')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save property' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the street address.')

    await user.type(screen.getByLabelText('Street address'), '12 Mill Street')
    await user.type(screen.getByLabelText('City'), 'Reading')
    await user.type(screen.getByLabelText('State'), 'pa')
    await user.type(screen.getByLabelText('ZIP'), '19602')
    await user.selectOptions(screen.getByLabelText('Property type'), 'Multi-family')
    await user.click(screen.getByRole('button', { name: 'Save property' }))

    const properties = await screen.findByRole('region', { name: 'Properties' })
    expect(router.state.location.pathname).toBe('/customers/customer-samuel')
    expect(await within(properties).findByText('12 Mill Street, Reading, PA 19602')).toBeInTheDocument()
    expect(backend.addedProperties).toEqual([
      {
        customerId: 'customer-samuel',
        property: { addressLine1: '12 Mill Street', addressLine2: null, city: 'Reading', state: 'PA', zip: '19602', propertyType: 'multi_family' },
      },
    ])
  })

  it('edits the details', async () => {
    const user = userEvent.setup()
    const { router, backend } = renderApp('/customers/customer-samuel/edit')

    const email = await screen.findByLabelText(/^Email/)
    await user.type(email, 'sam.okafor@example.com')
    await user.selectOptions(screen.getByLabelText('Prefers to be reached by'), 'Text')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await screen.findByRole('region', { name: 'Details' })
    expect(router.state.location.pathname).toBe('/customers/customer-samuel')
    expect(backend.customerChanges).toEqual([
      expect.objectContaining({ customerId: 'customer-samuel', email: 'sam.okafor@example.com', preferredContact: 'text', notes: 'Gate code 4411' }),
    ])
    expect(screen.getByText('sam.okafor@example.com')).toBeInTheDocument()
  })

  it('says when there is no such customer', async () => {
    renderApp('/customers/nobody')
    expect(await screen.findByRole('heading', { level: 1, name: 'Customer not found' })).toBeInTheDocument()
  })
})

describe('New customer', () => {
  it('needs only a name and a phone number, and opens the new customer', async () => {
    const user = userEvent.setup()
    const { router, backend } = renderApp('/customers/new', fakeBackend({ signedInAs: 'user-sales' }))

    await user.click(await screen.findByRole('button', { name: 'Save customer' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter their first name.')

    await user.type(screen.getByLabelText('First name'), 'Maya')
    await user.click(screen.getByRole('button', { name: 'Save customer' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a phone number with at least 7 digits.')

    await user.type(screen.getByLabelText('Phone'), '610-555-0199')
    // Sales is in one office, so no office is asked for.
    expect(screen.queryByLabelText('Office')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save customer' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Maya' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/customers/customer-new-1')
    expect(backend.addedCustomers).toEqual([
      {
        customerType: 'person',
        firstName: 'Maya',
        lastName: null,
        companyName: null,
        phone: '610-555-0199',
        email: null,
        officeId: 'office-reading',
        property: null,
      },
    ])
    expect(screen.getByText('No properties yet. Add the first one with the yellow button.')).toBeInTheDocument()
  })

  it('saves the optional email and property address with the customer', async () => {
    const user = userEvent.setup()
    const { backend } = renderApp('/customers/new', fakeBackend({ signedInAs: 'user-sales' }))

    await user.type(await screen.findByLabelText('First name'), 'Maya')
    await user.type(screen.getByLabelText('Last name'), 'Lindgren')
    await user.type(screen.getByLabelText('Phone'), '610-555-0199')
    await user.type(screen.getByLabelText(/^Email/), 'Maya@Example.com')
    await user.type(screen.getByLabelText('Street address'), '9 Ridge Road')
    await user.type(screen.getByLabelText('City'), 'Reading')
    await user.type(screen.getByLabelText('State'), 'pa')
    await user.type(screen.getByLabelText('ZIP'), '19601')
    await user.click(screen.getByRole('button', { name: 'Save customer' }))

    const properties = await screen.findByRole('region', { name: 'Properties' })
    expect(await within(properties).findByText('9 Ridge Road, Reading, PA 19601')).toBeInTheDocument()
    expect(backend.addedCustomers[0]).toEqual(
      expect.objectContaining({
        email: 'maya@example.com',
        property: { addressLine1: '9 Ridge Road', addressLine2: null, city: 'Reading', state: 'PA', zip: '19601', propertyType: 'residential' },
      }),
    )
  })

  it('takes a company name instead of a first name for companies', async () => {
    const user = userEvent.setup()
    const { backend } = renderApp('/customers/new', fakeBackend({ signedInAs: 'user-sales' }))

    await user.click(await screen.findByRole('button', { name: 'Company' }))
    expect(screen.queryByLabelText('First name')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Company name'), 'Pine Street Partners LLC')
    await user.type(screen.getByLabelText('Phone'), '610-555-0198')
    await user.click(screen.getByRole('button', { name: 'Save customer' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Pine Street Partners LLC' })).toBeInTheDocument()
    expect(backend.addedCustomers[0]).toEqual(expect.objectContaining({ customerType: 'company', companyName: 'Pine Street Partners LLC' }))
  })

  it('asks which office when the person is in several', async () => {
    const user = userEvent.setup()
    const { backend } = renderApp('/customers/new')

    const office = await screen.findByLabelText('Office')
    // The Admin's own office comes first; Admins may pick any office.
    expect(within(office).getAllByRole('option').map((option) => option.textContent)).toEqual(['Reading, PA', 'American Fork, UT'])
    await user.selectOptions(office, 'American Fork, UT')
    await user.type(screen.getByLabelText('First name'), 'Noor')
    await user.type(screen.getByLabelText('Phone'), '801-555-0199')
    await user.click(screen.getByRole('button', { name: 'Save customer' }))

    await screen.findByRole('heading', { level: 1, name: 'Noor' })
    expect(backend.addedCustomers[0]?.officeId).toBe('office-af')
  })

  it('warns when the phone number already belongs to someone and offers to open them', async () => {
    const user = userEvent.setup()
    const { router, backend } = renderApp('/customers/new', fakeBackend({ signedInAs: 'user-sales' }))

    await user.type(await screen.findByLabelText('Phone'), '1 (610) 555-0101')
    const warning = await screen.findByRole('status')
    expect(warning).toHaveTextContent('This phone number already belongs to Dana Whitfield (Reading office).')

    await user.click(within(warning).getByRole('link', { name: 'Open Dana Whitfield instead' }))
    expect(router.state.location.pathname).toBe('/customers/customer-dana')
    expect(await screen.findByRole('heading', { level: 1, name: 'Dana Whitfield' })).toBeInTheDocument()
    expect(backend.addedCustomers).toHaveLength(0)
  })

  it('still lets the customer be saved after the warning', async () => {
    const user = userEvent.setup()
    const { backend } = renderApp('/customers/new', fakeBackend({ signedInAs: 'user-sales' }))

    await user.type(await screen.findByLabelText('First name'), 'Dana')
    await user.type(screen.getByLabelText('Phone'), '610-555-0101')
    await screen.findByRole('status')
    await user.click(screen.getByRole('button', { name: 'Save customer' }))

    await screen.findByRole('region', { name: 'Properties' })
    expect(backend.addedCustomers).toHaveLength(1)
  })

  it('explains when the matching customer cannot be opened', async () => {
    const user = userEvent.setup()
    const backend = fakeBackend({ signedInAs: 'user-sales' })
    backend.findCustomersByPhone = async () => [{ customerId: 'customer-luis', displayName: 'Luis Herrera', officeName: 'American Fork', canOpen: false }]
    renderApp('/customers/new', backend)

    await user.type(await screen.findByLabelText('Phone'), '801-555-0104')
    const warning = await screen.findByRole('status')
    expect(warning).toHaveTextContent('This phone number already belongs to Luis Herrera (American Fork office).')
    expect(warning).toHaveTextContent('You cannot open Luis Herrera. Ask a Project manager in the American Fork office')
    expect(within(warning).queryByRole('link')).not.toBeInTheDocument()
  })

  it('tells a person with no office to ask an Admin', async () => {
    const backend = fakeBackend({ signedInAs: 'user-sales' })
    const sales = backend.people.find((person) => person.id === 'user-sales')
    if (sales) Object.assign(sales, { officeIds: [], primaryOfficeId: null })
    renderApp('/customers/new', backend)

    expect(await screen.findByText('You are not in an office yet')).toBeInTheDocument()
    expect(screen.queryByLabelText('Phone')).not.toBeInTheDocument()
  })
})
