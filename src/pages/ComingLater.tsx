import { Link, useSearchParams } from 'react-router'
import { PageHeader } from '../components/PageHeader'
import type { ScreenLink } from '../lib/navigation'

// Stand-in for screens that are not built yet.
export function ComingLater({ screen }: { screen: ScreenLink }) {
  const [params] = useSearchParams()
  const query = params.get('q')

  return (
    <>
      <PageHeader title={screen.label} />
      <section className="panel placeholder">
        <h2 className="placeholder__title">This screen arrives in a later step</h2>
        {query && <p>You searched for “{query}”. Search results need customers and jobs, which are not in the app yet.</p>}
        {screen.arrives && <p>Planned for {screen.arrives}.</p>}
        <Link to="/" className="text-link">
          Back to home
        </Link>
      </section>
    </>
  )
}

export function NotFound() {
  return (
    <>
      <PageHeader title="Page not found" />
      <section className="panel placeholder">
        <p>There is nothing at this address.</p>
        <Link to="/" className="text-link">
          Back to home
        </Link>
      </section>
    </>
  )
}
