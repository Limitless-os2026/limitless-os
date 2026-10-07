import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient } from '@tanstack/react-query'
import { createMemoryRouter } from 'react-router'
import { App } from './App'
import { routes } from './routes'
import { fakeBackend, PASSWORD, type FakeBackend } from './test/fakeBackend'

function renderApp(path = '/', backend: FakeBackend = fakeBackend({ signedInAs: 'user-admin' })) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<App backend={backend} router={router} queryClient={queryClient} />)
  return { router, backend }
}

/** Waits for the signed-in app to appear. */
async function shell() {
  return screen.findByRole('navigation', { name: 'Main' })
}

describe('app shell', () => {
  it('has both create buttons and the eight navigation links', async () => {
    renderApp()
    const nav = await shell()

    expect(within(nav).getByRole('link', { name: 'New emergency' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'New job or lead' })).toBeInTheDocument()
    const labels = ['Home', 'Boards', 'Schedule', 'Dispatch', 'Customers', 'Partners', 'Tasks', 'Reports']
    for (const label of labels) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument()
    }
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
  })

  it('keeps New emergency in the phone top bar, outside the menu', async () => {
    renderApp()
    await shell()
    const topbar = screen.getByRole('banner')
    expect(within(topbar).getByRole('link', { name: 'New emergency' })).toHaveAttribute('href', '/emergencies/new')
  })

  it('opens and closes the phone menu', async () => {
    const user = userEvent.setup()
    renderApp()
    await shell()
    const menuButton = screen.getByRole('button', { name: 'Menu' })

    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    await user.click(menuButton)
    expect(menuButton).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
  })

  it('sends other links to a page that says the screen arrives later', async () => {
    const user = userEvent.setup()
    const { router } = renderApp()
    await shell()

    await user.click(screen.getByRole('link', { name: 'Customers' }))
    expect(router.state.location.pathname).toBe('/customers')
    expect(screen.getByRole('heading', { level: 1, name: 'Customers' })).toBeInTheDocument()
    expect(screen.getByText('This screen arrives in a later step')).toBeInTheDocument()
  })

  it('takes a search to the search placeholder', async () => {
    const user = userEvent.setup()
    const { router } = renderApp()
    await shell()

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'PA-2600123{Enter}')
    expect(router.state.location.pathname).toBe('/search')
    expect(screen.getByText(/You searched for “PA-2600123”/)).toBeInTheDocument()
  })
})

describe('Office home', () => {
  it('shows what needs attention, today and the boards', async () => {
    renderApp()

    expect(await screen.findByRole('heading', { level: 1, name: '6 things need attention' })).toBeInTheDocument()
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

    await user.click(await screen.findByRole('button', { name: 'Utah' }))
    expect(screen.getByRole('button', { name: 'Utah' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { level: 1, name: '4 things need attention' })).toBeInTheDocument()
    expect(window.localStorage.getItem('limitless-os.location')).toBe('UT')

    await user.click(screen.getByRole('button', { name: 'Pennsylvania' }))
    expect(screen.getByRole('heading', { level: 1, name: '5 things need attention' })).toBeInTheDocument()
  })
})

describe('sign-in', () => {
  it('shows signed-out visitors only the sign-in screen, whatever address they open', async () => {
    renderApp('/customers', fakeBackend({ signedInAs: null }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    expect(screen.queryByText(/sign up/i)).not.toBeInTheDocument()
  })

  it('says plainly when the email and password do not match', async () => {
    const user = userEvent.setup()
    renderApp('/', fakeBackend({ signedInAs: null }))

    await user.type(await screen.findByLabelText('Email'), 'avery@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('That email and password do not match.')
  })

  it('signs in, lands on the address asked for, and signs out', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/customers', fakeBackend({ signedInAs: null }))

    await user.type(await screen.findByLabelText('Email'), 'avery@example.com')
    await user.type(screen.getByLabelText('Password'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    const nav = await shell()
    expect(router.state.location.pathname).toBe('/customers')
    expect(within(nav).getByText('Avery Admin')).toBeInTheDocument()
    expect(within(nav).getByText('Admin')).toBeInTheDocument()

    await user.click(within(nav).getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
  })

  it('tells a switched-off person why they see nothing', async () => {
    renderApp('/', fakeBackend({ signedInAs: 'user-off' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Your account is switched off' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })
})

describe('sidebar', () => {
  it('shows the email when a person has no name yet, and their role', async () => {
    renderApp('/', fakeBackend({ signedInAs: 'user-sales' }))
    const nav = await shell()

    expect(within(nav).getByText('new.rep@example.com')).toBeInTheDocument()
    expect(within(nav).getByText('Sales')).toBeInTheDocument()
  })
})

describe('location filter', () => {
  it('lists the states that have an office, from the database', async () => {
    const backend = fakeBackend({ signedInAs: 'user-admin' })
    backend.locations.states.push(
      { id: 'state-oh', code: 'OH', name: 'Ohio', isActive: true },
      { id: 'state-co', code: 'CO', name: 'Colorado', isActive: true },
    )
    backend.locations.offices.push({ id: 'office-oh', stateId: 'state-oh', name: 'Columbus', timeZone: 'America/New_York', isActive: true })
    renderApp('/', backend)

    const filter = await screen.findByRole('group', { name: 'Location' })
    await within(filter).findByRole('button', { name: 'Ohio' })
    expect(within(filter).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'All locations',
      'Ohio',
      'Pennsylvania',
      'Utah',
    ])
  })

  it('falls back to all locations when the remembered state is gone', async () => {
    window.localStorage.setItem('limitless-os.location', 'NV')
    renderApp()

    const filter = await screen.findByRole('group', { name: 'Location' })
    await within(filter).findByRole('button', { name: 'Utah' })
    expect(within(filter).getByRole('button', { name: 'All locations' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('People', () => {
  it('is only offered to Admins', async () => {
    renderApp('/', fakeBackend({ signedInAs: 'user-sales' }))
    const nav = await shell()
    expect(within(nav).queryByRole('link', { name: 'People' })).not.toBeInTheDocument()
  })

  it('cannot be opened by other roles, even by its address', async () => {
    renderApp('/people', fakeBackend({ signedInAs: 'user-sales' }))
    expect(await screen.findByText('Only an Admin can open this screen')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Everyone who can sign in' })).not.toBeInTheDocument()
  })

  it('lists everyone with their role, offices and status', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(within(await shell()).getByRole('link', { name: 'People' }))

    const list = await screen.findByRole('region', { name: 'Everyone who can sign in' })
    const rows = within(list).getAllByRole('link')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('Avery Admin')
    expect(rows[0]).toHaveTextContent('Reading, PA')
    expect(rows[1]).toHaveTextContent('new.rep@example.com')
    expect(rows[1]).toHaveTextContent('Sales')
    expect(rows[1]).toHaveTextContent('No office')
    expect(rows[2]).toHaveTextContent('Switched off')
  })

  it('changes a role, name and offices', async () => {
    const user = userEvent.setup()
    const { router, backend } = renderApp('/people/user-sales')

    await user.type(await screen.findByLabelText('First name'), 'Riley')
    await user.type(screen.getByLabelText('Last name'), 'Rep')
    await user.selectOptions(screen.getByLabelText('Role'), 'Project manager')
    await user.click(screen.getByLabelText('Reading, PA'))
    await user.click(screen.getByLabelText('American Fork, UT'))

    // Two offices: the main one has to be picked.
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Pick which of their offices is the main one.')
    expect(backend.updates).toHaveLength(0)

    await user.selectOptions(screen.getByLabelText('Main office'), 'American Fork, UT')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await screen.findByRole('region', { name: 'Everyone who can sign in' })
    expect(router.state.location.pathname).toBe('/people')
    expect(backend.updates).toEqual([
      {
        personId: 'user-sales',
        firstName: 'Riley',
        lastName: 'Rep',
        roleId: 'role-pm',
        officeIds: ['office-reading', 'office-af'],
        primaryOfficeId: 'office-af',
        isActive: true,
      },
    ])
    expect(screen.getByRole('link', { name: /Riley Rep/ })).toHaveTextContent('Project manager')
  })

  it('switches a person off', async () => {
    const user = userEvent.setup()
    const { backend } = renderApp('/people/user-sales')

    await user.click(await screen.findByLabelText('Can sign in and use the app'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await screen.findByRole('region', { name: 'Everyone who can sign in' })
    expect(backend.updates[0]?.isActive).toBe(false)
  })
})
