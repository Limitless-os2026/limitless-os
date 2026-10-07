import { render, screen } from '@testing-library/react'
import { QueryClient } from '@tanstack/react-query'
import { createMemoryRouter } from 'react-router'
import { App } from '../App'
import { routes } from '../routes'
import { fakeBackend } from '../test/fakeBackend'
import { AppVersion } from './AppVersion'

describe('the version in small print', () => {
  it('says which build this copy is', () => {
    render(<AppVersion className="gate__version" />)
    expect(screen.getByText(/^Version /)).toBeInTheDocument()
  })

  it('shows on the sign-in screen', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/'] })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<App backend={fakeBackend({ signedInAs: null })} router={router} queryClient={queryClient} />)
    await screen.findByRole('heading', { level: 1, name: 'Sign in' })
    expect(screen.getByText(/^Version /)).toBeInTheDocument()
  })

  it('shows at the foot of the sidebar once signed in', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/'] })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<App backend={fakeBackend({ signedInAs: 'user-admin' })} router={router} queryClient={queryClient} />)
    await screen.findByRole('button', { name: 'Sign out' })
    expect(screen.getByText(/^Version /)).toHaveClass('sidebar__version')
  })
})
