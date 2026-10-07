import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useLocationFilter } from '../lib/LocationContext'
import { searchScreen } from '../lib/navigation'
import { SearchIcon } from './Icons'

interface PageHeaderProps {
  eyebrow?: ReactNode
  title: ReactNode
  /** Office screens filter by location. Screens that do not, leave it out. */
  locationFilter?: boolean
}

// Title on the left; the location filter and the one search box on the right.
export function PageHeader({ eyebrow, title, locationFilter = true }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div className="page-header__titles">
        {eyebrow && <div className="page-header__eyebrow">{eyebrow}</div>}
        <h1 className="page-header__title">{title}</h1>
      </div>
      <div className="page-header__tools">
        {locationFilter && <LocationFilterControl />}
        <SearchBox />
      </div>
    </div>
  )
}

export function LocationFilterControl() {
  const { location, setLocation, options } = useLocationFilter()
  return (
    <div role="group" aria-label="Location" className="location-filter">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={location === option.value}
          onClick={() => setLocation(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function SearchBox() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [query, setQuery] = useState(() => params.get('q') ?? '')

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    navigate(`${searchScreen.path}?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <form role="search" className="search-box" onSubmit={onSubmit}>
      <SearchIcon />
      <input
        type="search"
        aria-label="Search"
        placeholder="Name, address, job or claim number"
        enterKeyHint="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
    </form>
  )
}
