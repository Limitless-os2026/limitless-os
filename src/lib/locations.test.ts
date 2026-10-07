import { coversState, locationOptions, officeLabel, type Locations } from './locations'

const locations: Locations = {
  states: [
    { id: 'ut', code: 'UT', name: 'Utah', isActive: true },
    { id: 'pa', code: 'PA', name: 'Pennsylvania', isActive: true },
    { id: 'oh', code: 'OH', name: 'Ohio', isActive: true },
    { id: 'co', code: 'CO', name: 'Colorado', isActive: false },
  ],
  offices: [
    { id: 'reading', stateId: 'pa', name: 'Reading', timeZone: 'America/New_York', isActive: true },
    { id: 'af', stateId: 'ut', name: 'American Fork', timeZone: 'America/Denver', isActive: true },
    { id: 'columbus', stateId: 'oh', name: 'Columbus', timeZone: 'America/New_York', isActive: false },
    { id: 'denver', stateId: 'co', name: 'Denver', timeZone: 'America/Denver', isActive: true },
  ],
}

describe('location filter choices', () => {
  it('lists all locations, then each state with an office that is switched on, by name', () => {
    expect(locationOptions(locations)).toEqual([
      { value: 'all', label: 'All locations' },
      { value: 'PA', label: 'Pennsylvania' },
      { value: 'UT', label: 'Utah' },
    ])
  })

  it('has only all locations before any state is set up', () => {
    expect(locationOptions({ states: [], offices: [] })).toEqual([{ value: 'all', label: 'All locations' }])
  })

  it('takes in every state for all locations, and one state otherwise', () => {
    expect(coversState('all', 'PA')).toBe(true)
    expect(coversState('PA', 'PA')).toBe(true)
    expect(coversState('PA', 'UT')).toBe(false)
  })

  it('names an office with its state', () => {
    expect(officeLabel(locations.offices[0]!, locations.states)).toBe('Reading, PA')
  })
})
