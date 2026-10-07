import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { isLocationFilter, type LocationFilter } from './locations'

// The chosen location follows the person from screen to screen and is
// remembered on this device.

const STORAGE_KEY = 'limitless-os.location'

interface LocationState {
  location: LocationFilter
  setLocation: (location: LocationFilter) => void
}

const LocationContext = createContext<LocationState | null>(null)

function readStored(): LocationFilter {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isLocationFilter(stored) ? stored : 'all'
  } catch {
    return 'all'
  }
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const [location, setState] = useState<LocationFilter>(readStored)

  const setLocation = useCallback((next: LocationFilter) => {
    setState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Private browsing or blocked storage: the choice lasts for this visit only.
    }
  }, [])

  const value = useMemo(() => ({ location, setLocation }), [location, setLocation])
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>
}

export function useLocationFilter(): LocationState {
  const value = useContext(LocationContext)
  if (!value) throw new Error('useLocationFilter must be used inside LocationProvider')
  return value
}
