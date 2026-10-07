import { render, screen } from '@testing-library/react'
import { SetupNeeded } from './Notices'

it('explains which settings are missing instead of showing a blank page', () => {
  render(<SetupNeeded />)
  expect(screen.getByRole('heading', { level: 1, name: 'Setup needed' })).toBeInTheDocument()
  expect(screen.getByText('VITE_SUPABASE_URL')).toBeInTheDocument()
  expect(screen.getByText('VITE_SUPABASE_KEY')).toBeInTheDocument()
})
