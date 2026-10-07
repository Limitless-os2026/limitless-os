import { coversOffice, coversState, isLocationChoice, locationOptions, officeLabel, type Locations } from './locations'

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

describe('a state with more than one office', () => {
  const twoInPennsylvania: Locations = {
    states: locations.states,
    offices: [
      ...locations.offices,
      { id: 'lancaster', stateId: 'pa', name: 'Lancaster', timeZone: 'America/New_York', isActive: true },
      { id: 'closed', stateId: 'pa', name: 'Allentown', timeZone: 'America/New_York', isActive: false },
    ],
  }

  it('opens to choose one of its offices that are switched on, by name', () => {
    expect(locationOptions(twoInPennsylvania)).toEqual([
      { value: 'all', label: 'All locations' },
      {
        value: 'PA',
        label: 'Pennsylvania',
        offices: [
          { value: 'PA/lancaster', label: 'Lancaster' },
          { value: 'PA/reading', label: 'Reading' },
        ],
      },
      { value: 'UT', label: 'Utah' },
    ])
  })

  it('knows which choices exist', () => {
    const options = locationOptions(twoInPennsylvania)
    expect(isLocationChoice(options, 'all')).toBe(true)
    expect(isLocationChoice(options, 'PA')).toBe(true)
    expect(isLocationChoice(options, 'PA/lancaster')).toBe(true)
    expect(isLocationChoice(options, 'PA/closed')).toBe(false)
    expect(isLocationChoice(options, 'NV')).toBe(false)
    // Utah has one office, so it is not chosen office by office.
    expect(isLocationChoice(options, 'UT/af')).toBe(false)
  })

  it('takes in the state of a chosen office, and only that office', () => {
    expect(coversState('PA/lancaster', 'PA')).toBe(true)
    expect(coversState('PA/lancaster', 'UT')).toBe(false)
    expect(coversOffice('PA/lancaster', 'PA', 'lancaster')).toBe(true)
    expect(coversOffice('PA/lancaster', 'PA', 'reading')).toBe(false)
    expect(coversOffice('PA', 'PA', 'reading')).toBe(true)
    expect(coversOffice('all', 'UT', 'af')).toBe(true)
  })
})
