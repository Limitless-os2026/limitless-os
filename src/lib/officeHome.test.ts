import { officeHomeData } from './officeHome'

describe('Office home sample data', () => {
  it('matches the approved mockup for all locations', () => {
    const data = officeHomeData('all')

    expect(data.attention.map((row) => [row.title, row.count])).toEqual([
      ['Emergency jobs finished, not invoiced', 13],
      ['Supplements with no answer', 3],
      ['Contracts signed, no deposit recorded', 2],
      ['Inspections done, estimate missing', 4],
      ['Job sold under 35% margin', 1],
      ['Dispatch not accepted', 1],
    ])
    expect(data.attention[0]?.detail).toBe('The oldest has waited 63 days')
    expect(data.attention.map((row) => row.late)).toEqual([true, true, false, false, true, true])

    expect(data.today.map((entry) => entry.address)).toEqual([
      '123 Main Street',
      '45 Oak Avenue',
      '9 Ridge Road',
      '210 Elm Street',
    ])
    expect(data.boards.map((board) => [board.name, board.count])).toEqual([
      ['Retail', 30],
      ['Insurance', 39],
      ['Emergency tarps', 17],
      ['SERVPRO recon', 10],
      ['Warranty claims', 1],
    ])
    expect(data.views.map((view) => [view.name, view.count])).toEqual([
      ['In production', 13],
      ['Billing', 55],
    ])
  })

  it('shows only Utah when Utah is chosen, and drops items with nothing waiting', () => {
    const data = officeHomeData('UT')

    expect(data.attention.map((row) => row.id)).toEqual([
      'emergency-not-invoiced',
      'signed-no-deposit',
      'inspected-no-estimate',
      'dispatch-not-accepted',
    ])
    // Utah's oldest uninvoiced emergency job is 9 days old: not late yet.
    expect(data.attention[0]?.detail).toBe('The oldest has waited 9 days')
    expect(data.attention[0]?.late).toBe(false)
    expect(data.today.map((entry) => entry.address)).toEqual(['9 Ridge Road'])
  })

  it('adds Pennsylvania and Utah up to the all-locations totals', () => {
    const all = officeHomeData('all')
    const pa = officeHomeData('PA')
    const ut = officeHomeData('UT')

    all.boards.forEach((board, index) => {
      expect(board.count).toBe((pa.boards[index]?.count ?? 0) + (ut.boards[index]?.count ?? 0))
    })
    all.views.forEach((view, index) => {
      expect(view.count).toBe((pa.views[index]?.count ?? 0) + (ut.views[index]?.count ?? 0))
    })
    expect(all.today).toHaveLength(pa.today.length + ut.today.length)
  })
})
