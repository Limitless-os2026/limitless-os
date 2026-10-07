import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useLocationFilter } from '../lib/LocationContext'
import type { LocationFilter, LocationOption } from '../lib/locations'
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
      {options.map((option) =>
        option.offices ? (
          <StateWithOffices key={option.value} option={option} location={location} setLocation={setLocation} />
        ) : (
          <button
            key={option.value}
            type="button"
            aria-pressed={location === option.value}
            onClick={() => setLocation(option.value)}
          >
            {option.label}
          </button>
        ),
      )}
    </div>
  )
}

// A state with more than one office opens a short list: the whole state, or
// one of its offices.
function StateWithOffices({
  option,
  location,
  setLocation,
}: {
  option: LocationOption
  location: LocationFilter
  setLocation: (location: LocationFilter) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const chosenOffice = option.offices?.find((office) => office.value === location)
  const pressed = location === option.value || chosenOffice !== undefined

  useEffect(() => {
    if (!open) return
    wrapper.current?.querySelector<HTMLElement>('[role="menu"] button')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        button.current?.focus()
      }
    }
    const onPointer = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  function choose(value: LocationFilter) {
    setLocation(value)
    setOpen(false)
    button.current?.focus()
  }

  return (
    <div ref={wrapper} className="location-filter__state">
      <button
        ref={button}
        type="button"
        aria-pressed={pressed}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {chosenOffice ? `${option.label}: ${chosenOffice.label}` : option.label}
        <span className="location-filter__caret" aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" aria-label={option.label} className="location-filter__menu">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={location === option.value}
            onClick={() => choose(option.value)}
          >
            All of {option.label}
          </button>
          {option.offices?.map((office) => (
            <button
              key={office.value}
              type="button"
              role="menuitemradio"
              aria-checked={location === office.value}
              onClick={() => choose(office.value)}
            >
              {office.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function SearchBox() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [query, setQuery] = useState(() => params.get('q') ?? '')

  // Opening a search from elsewhere (a link, the back button) shows its words here.
  const inAddress = params.get('q')
  useEffect(() => {
    if (inAddress !== null) setQuery(inAddress)
  }, [inAddress])

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
        placeholder="Name, phone, email or address"
        enterKeyHint="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
    </form>
  )
}
