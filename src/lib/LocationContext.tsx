import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ALL_LOCATIONS,
  isLocationChoice,
  locationOptions,
  type LocationFilter,
  type LocationOption,
  type Locations,
} from './locations'
import { useBackend } from './SessionContext'

// The chosen location follows the person from screen to screen and is
// remembered on this device. The choices come from the states and offices
// in the database.

const STORAGE_KEY = 'limitless-os.location'

interface LocationState {
  location: LocationFilter
  setLocation: (location: LocationFilter) => void
  options: LocationOption[]
}

const LocationContext = createContext<LocationState | null>(null)

function readStored(): LocationFilter {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || ALL_LOCATIONS
  } catch {
    return ALL_LOCATIONS
  }
}

export function useLocations() {
  const backend = useBackend()
  return useQuery<Locations>({ queryKey: ['locations'], queryFn: () => backend.loadLocations(), staleTime: 5 * 60_000 })
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<LocationFilter>(readStored)
  const { data } = useLocations()

  const options = useMemo(() => (data ? locationOptions(data) : [{ value: ALL_LOCATIONS, label: 'All locations' }]), [data])

  // Until the states arrive, trust the remembered choice. After that, a
  // state or office that is gone or switched off falls back to all locations.
  const location = !data || isLocationChoice(options, stored) ? stored : ALL_LOCATIONS

  const setLocation = useCallback((next: LocationFilter) => {
    setStored(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Private browsing or blocked storage: the choice lasts for this visit only.
    }
  }, [])

  const value = useMemo(() => ({ location, setLocation, options }), [location, setLocation, options])
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>
}

export function useLocationFilter(): LocationState {
  const value = useContext(LocationContext)
  if (!value) throw new Error('useLocationFilter must be used inside LocationProvider')
  return value
}
