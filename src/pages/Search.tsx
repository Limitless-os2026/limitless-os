import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '../components/PageHeader'
import { EmptyRow, LoadingText, LoadProblem, PanelTitle } from '../components/Record'
import { formatPhone } from '../lib/customers'
import { contactPath, orgTypeLabel, SEARCH_LIMIT, type SearchKind, type SearchResult } from '../lib/partners'
import { useBackend } from '../lib/SessionContext'

// The one search box: customers by name, phone, email and property address,
// and organizations and contacts by name. Each person finds only what they
// may see. The database gives back up to SEARCH_LIMIT matches of each kind.

const GROUPS: { kind: SearchKind; title: string; to: (id: string) => string; detail: (detail: string | null) => string }[] = [
  { kind: 'customer', title: 'Customers', to: (id) => `/customers/${id}`, detail: customerDetail },
  { kind: 'organization', title: 'Partners', to: (id) => `/partners/${id}`, detail: (detail) => orgTypeLabel(detail) },
  { kind: 'contact', title: 'Contacts', to: contactPath, detail: (detail) => detail ?? '' },
]

/** A customer's detail comes back as "phone · first property". Show the phone the way the other screens do. */
function customerDetail(detail: string | null): string {
  if (!detail) return ''
  const [phone, ...rest] = detail.split(' · ')
  return [phone ? formatPhone(phone) : '', ...rest].filter(Boolean).join(' · ')
}

export function Search() {
  const backend = useBackend()
  const [params] = useSearchParams()
  const query = (params.get('q') ?? '').trim()
  const results = useQuery({
    queryKey: ['search', query],
    queryFn: () => backend.search(query),
    enabled: query.length > 0,
  })

  const found = results.data ?? []
  const groups = GROUPS.map((group) => ({ ...group, rows: found.filter((result) => result.kind === group.kind) })).filter(
    (group) => group.rows.length > 0,
  )
  const capped = groups.some((group) => group.rows.length >= SEARCH_LIMIT)
  const eyebrow = query
    ? results.data
      ? capped
        ? `${found.length} or more matches for “${query}”`
        : `${found.length} ${found.length === 1 ? 'match' : 'matches'} for “${query}”`
      : `Searching for “${query}”`
    : undefined

  return (
    <>
      <PageHeader eyebrow={eyebrow} title="Search" locationFilter={false} />
      {!query ? (
        <section className="panel placeholder">
          <p>Type a name, phone number, email or address in the search box above.</p>
        </section>
      ) : results.isError ? (
        <LoadProblem what="the search results" retry={() => void results.refetch()} />
      ) : results.isPending ? (
        <LoadingText>Searching…</LoadingText>
      ) : found.length === 0 ? (
        <section aria-label="Results" className="panel placeholder">
          <p>Nothing matches “{query}”. Check the spelling, or try part of the name.</p>
          <Link to="/customers/new" className="text-link">
            Add a new customer
          </Link>
        </section>
      ) : (
        groups.map((group) => (
          <section key={group.kind} aria-label={group.title} className="panel">
            <PanelTitle>{group.title}</PanelTitle>
            {group.rows.map((result) => (
              <ResultRow key={result.id} result={result} to={group.to(result.id)} detail={group.detail(result.detail)} />
            ))}
            {group.rows.length >= SEARCH_LIMIT && (
              <EmptyRow>Showing the first {SEARCH_LIMIT} {group.title.toLowerCase()} that match. Type more to narrow it down.</EmptyRow>
            )}
          </section>
        ))
      )}
    </>
  )
}

function ResultRow({ result, to, detail }: { result: SearchResult; to: string; detail: string }) {
  return (
    <Link to={to} className="list-row">
      <span className="list-row__main">
        <span className="list-row__title">{result.title}</span>
        {detail && <span className="list-row__detail">{detail}</span>}
      </span>
    </Link>
  )
}
