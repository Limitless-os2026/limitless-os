// The location filter on office screens: All locations, or one state.
// Offices roll up to states (spec section 6), so the filter works by state
// code. The states come from the database: a state shows once it has an
// office that is switched on.

/** 'all', or a state code such as 'PA'. */
export type LocationFilter = string

export const ALL_LOCATIONS: LocationFilter = 'all'

export interface LocationOption {
  value: LocationFilter
  label: string
}

export interface StateRecord {
  id: string
  code: string
  name: string
  isActive: boolean
}

export interface OfficeRecord {
  id: string
  stateId: string
  name: string
  timeZone: string
  isActive: boolean
}

export interface Locations {
  states: StateRecord[]
  offices: OfficeRecord[]
}

export function locationOptions({ states, offices }: Locations): LocationOption[] {
  const withOffices = states
    .filter((state) => state.isActive && offices.some((office) => office.isActive && office.stateId === state.id))
    .sort((a, b) => a.name.localeCompare(b.name))
  return [{ value: ALL_LOCATIONS, label: 'All locations' }, ...withOffices.map((state) => ({ value: state.code, label: state.name }))]
}

/** Whether a filter takes in the given state. */
export function coversState(filter: LocationFilter, stateCode: string): boolean {
  return filter === ALL_LOCATIONS || filter === stateCode
}

/** An office's name with its state code, such as "Reading, PA". */
export function officeLabel(office: OfficeRecord, states: readonly StateRecord[]): string {
  const state = states.find((candidate) => candidate.id === office.stateId)
  return state ? `${office.name}, ${state.code}` : office.name
}
