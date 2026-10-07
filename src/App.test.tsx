import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { LocationProvider } from './lib/LocationContext'
import { routes } from './routes'

function renderApp(path = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <LocationProvider>
      <RouterProvider router={router} />
    </LocationProvider>,
  )
  return router
}

describe('app shell', () => {
  it('has both create buttons and the eight navigation links', () => {
    renderApp()
    const nav = screen.getByRole('navigation', { name: 'Main' })

    expect(within(nav).getByRole('link', { name: 'New emergency' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'New job or lead' })).toBeInTheDocument()
    const labels = ['Home', 'Boards', 'Schedule', 'Dispatch', 'Customers', 'Partners', 'Tasks', 'Reports']
    for (const label of labels) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument()
    }
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
  })

  it('keeps New emergency in the phone top bar, outside the menu', () => {
    renderApp()
    const topbar = screen.getByRole('banner')
    expect(within(topbar).getByRole('link', { name: 'New emergency' })).toHaveAttribute('href', '/emergencies/new')
  })

  it('opens and closes the phone menu', async () => {
    const user = userEvent.setup()
    renderApp()
    const menuButton = screen.getByRole('button', { name: 'Menu' })

    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    await user.click(menuButton)
    expect(menuButton).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
  })

  it('sends other links to a page that says the screen arrives later', async () => {
    const user = userEvent.setup()
    const router = renderApp()

    await user.click(screen.getByRole('link', { name: 'Customers' }))
    expect(router.state.location.pathname).toBe('/customers')
    expect(screen.getByRole('heading', { level: 1, name: 'Customers' })).toBeInTheDocument()
    expect(screen.getByText('This screen arrives in a later step')).toBeInTheDocument()
  })

  it('takes a search to the search placeholder', async () => {
    const user = userEvent.setup()
    const router = renderApp()

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'PA-2600123{Enter}')
    expect(router.state.location.pathname).toBe('/search')
    expect(screen.getByText(/You searched for “PA-2600123”/)).toBeInTheDocument()
  })
})

describe('Office home', () => {
  it('shows what needs attention, today and the boards', () => {
    renderApp()

    expect(screen.getByRole('heading', { level: 1, name: '6 things need attention' })).toBeInTheDocument()
    const attention = screen.getByRole('region', { name: 'Needs attention' })
    expect(within(attention).getAllByRole('link')).toHaveLength(6)
    expect(within(attention).getByText((_, element) => element?.textContent === 'Late: 63 days')).toBeInTheDocument()

    const today = screen.getByRole('region', { name: 'Today' })
    expect(within(today).getByText('On site now')).toBeInTheDocument()

    const boards = screen.getByRole('region', { name: 'Boards' })
    expect(within(boards).getAllByRole('link')).toHaveLength(7)
  })

  it('filters by location and remembers the choice', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: 'Utah' }))
    expect(screen.getByRole('button', { name: 'Utah' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { level: 1, name: '4 things need attention' })).toBeInTheDocument()
    expect(window.localStorage.getItem('limitless-os.location')).toBe('UT')

    await user.click(screen.getByRole('button', { name: 'Pennsylvania' }))
    expect(screen.getByRole('heading', { level: 1, name: '5 things need attention' })).toBeInTheDocument()
  })
})
