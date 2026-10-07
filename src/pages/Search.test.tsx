import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient } from '@tanstack/react-query'
import { createMemoryRouter } from 'react-router'
import { App } from '../App'
import { routes } from '../routes'
import { fakeBackend, type FakeBackend } from '../test/fakeBackend'

function renderApp(path: string, backend: FakeBackend = fakeBackend({ signedInAs: 'user-sales' })) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<App backend={backend} router={router} queryClient={queryClient} />)
  return { router, backend }
}

describe('Search', () => {
  it('groups what it finds into customers, partners and contacts', async () => {
    const { backend } = renderApp('/search?q=Birch%20Hollow')

    const partners = await screen.findByRole('region', { name: 'Partners' })
    expect(within(partners).getByRole('link', { name: /SERVPRO of Birch Hollow/ })).toHaveAttribute('href', '/partners/org-birch')
    expect(within(partners).getByText('SERVPRO franchise')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Customers' })).not.toBeInTheDocument()
    expect(screen.getByText('1 match for “Birch Hollow”')).toBeInTheDocument()
    expect(backend.searches).toEqual(['Birch Hollow'])
    // The search box shows the words that were searched for.
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('Birch Hollow')
  })

  it('finds a customer by phone number, however it is written', async () => {
    renderApp('/search?q=(610)%20555-0101')

    const customers = await screen.findByRole('region', { name: 'Customers' })
    expect(within(customers).getByRole('link', { name: /Dana Whitfield/ })).toHaveAttribute('href', '/customers/customer-dana')
    expect(within(customers).getByText('(610) 555-0101 · 412 Birchwood Lane, Reading')).toBeInTheDocument()
  })

  it('finds a customer by property address, and a contact by name', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/search?q=Quarry')

    const customers = await screen.findByRole('region', { name: 'Customers' })
    expect(within(customers).getByRole('link', { name: /Samuel Okafor/ })).toBeInTheDocument()

    const box = screen.getByRole('searchbox', { name: 'Search' })
    await user.clear(box)
    await user.type(box, 'Lindqvist{Enter}')
    expect(router.state.location.search).toBe('?q=Lindqvist')
    const contacts = await screen.findByRole('region', { name: 'Contacts' })
    expect(within(contacts).getByRole('link', { name: /Theo Lindqvist/ })).toHaveTextContent('Blue Mountain Mutual Insurance')
  })

  it('says when nothing matches, and offers to add a customer', async () => {
    renderApp('/search?q=zzzz')

    expect(await screen.findByText('Nothing matches “zzzz”. Check the spelling, or try part of the name.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add a new customer' })).toHaveAttribute('href', '/customers/new')
  })

  it('explains itself when opened with nothing to search for', async () => {
    const { backend } = renderApp('/search')
    expect(await screen.findByText('Type a name, phone number, email or address in the search box above.')).toBeInTheDocument()
    expect(backend.searches).toEqual([])
  })
})
