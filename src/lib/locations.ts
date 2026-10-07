// The location filter on office screens: All locations, or one state.
// Offices roll up to states (spec section 6), so the filter works by state
// code. The states come from the database: a state shows once it has an
// office that is switched on. A state with more than one office opens to
// choose one of them, or the whole state.

/** 'all', a state code such as 'PA', or one office as 'PA/<office id>'. */
export type LocationFilter = string

export const ALL_LOCATIONS: LocationFilter = 'all'

export interface LocationOption {
  value: LocationFilter
  label: string
  /** Only for a state with more than one office: each office to choose from. */
  offices?: LocationOption[]
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

export function officeFilter(stateCode: string, officeId: string): LocationFilter {
  return `${stateCode}/${officeId}`
}

export function locationOptions({ states, offices }: Locations): LocationOption[] {
  const options: LocationOption[] = [{ value: ALL_LOCATIONS, label: 'All locations' }]
  const activeStates = states.filter((state) => state.isActive).sort((a, b) => a.name.localeCompare(b.name))
  for (const state of activeStates) {
    const stateOffices = offices
      .filter((office) => office.isActive && office.stateId === state.id)
      .sort((a, b) => a.name.localeCompare(b.name))
    if (stateOffices.length === 0) continue
    options.push({
      value: state.code,
      label: state.name,
      ...(stateOffices.length > 1 && {
        offices: stateOffices.map((office) => ({ value: officeFilter(state.code, office.id), label: office.name })),
      }),
    })
  }
  return options
}

/** Whether the filter is one of the choices: a state, one of its offices, or all locations. */
export function isLocationChoice(options: readonly LocationOption[], filter: LocationFilter): boolean {
  return options.some((option) => option.value === filter || option.offices?.some((office) => office.value === filter))
}

/** Whether a filter takes in the given state: all of it, or one of its offices. */
export function coversState(filter: LocationFilter, stateCode: string): boolean {
  return filter === ALL_LOCATIONS || filter === stateCode || filter.startsWith(`${stateCode}/`)
}

/** Whether a filter takes in the given office. */
export function coversOffice(filter: LocationFilter, stateCode: string, officeId: string): boolean {
  return filter === ALL_LOCATIONS || filter === stateCode || filter === officeFilter(stateCode, officeId)
}

/** An office's name with its state code, such as "Reading, PA". */
export function officeLabel(office: OfficeRecord, states: readonly StateRecord[]): string {
  const state = states.find((candidate) => candidate.id === office.stateId)
  return state ? `${office.name}, ${state.code}` : office.name
}
