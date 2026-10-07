import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient } from '@tanstack/react-query'
import { createMemoryRouter } from 'react-router'
import { App } from '../App'
import { markUpdateReady, resetAppUpdate } from '../lib/appUpdate'
import { routes } from '../routes'
import { SetupNeeded } from '../pages/Notices'
import { fakeBackend } from '../test/fakeBackend'
import { UpdateBar } from './UpdateBar'

afterEach(() => resetAppUpdate())

function renderWithApp() {
  const router = createMemoryRouter(routes, { initialEntries: ['/'] })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <>
      <UpdateBar />
      <App backend={fakeBackend({ signedInAs: null })} router={router} queryClient={queryClient} />
    </>,
  )
}

describe('Update ready bar', () => {
  it('stays hidden until a newer version is waiting', async () => {
    renderWithApp()
    await screen.findByRole('heading', { level: 1, name: 'Sign in' })
    expect(screen.queryByText('Update ready')).not.toBeInTheDocument()
  })

  it('shows on the sign-in screen, and Refresh switches to the new version', async () => {
    const user = userEvent.setup()
    const apply = vi.fn()
    renderWithApp()
    await screen.findByRole('heading', { level: 1, name: 'Sign in' })

    act(() => markUpdateReady(apply))
    expect(screen.getByText('Update ready')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(apply).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Refreshing…' })).toBeDisabled()
  })

  it('shows on the setup screen too', () => {
    markUpdateReady(() => undefined)
    render(
      <>
        <UpdateBar />
        <SetupNeeded />
      </>,
    )
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
  })
})
