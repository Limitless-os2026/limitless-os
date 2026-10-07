// The location filter on office screens: All locations, or one state.
// Offices roll up to states (spec section 6), so the filter works by state code.

export type StateCode = 'PA' | 'UT'

export type LocationFilter = 'all' | StateCode

export const LOCATION_OPTIONS: ReadonlyArray<{ value: LocationFilter; label: string }> = [
  { value: 'all', label: 'All locations' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'UT', label: 'Utah' },
]

export const STATE_CODES: readonly StateCode[] = ['PA', 'UT']

export function isLocationFilter(value: unknown): value is LocationFilter {
  return LOCATION_OPTIONS.some((option) => option.value === value)
}

/** The states a filter covers. */
export function statesFor(filter: LocationFilter): readonly StateCode[] {
  return filter === 'all' ? STATE_CODES : [filter]
}
