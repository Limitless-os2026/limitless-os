import { attentionHeadline, combineParts, formatMeasure, isLate, LATE_AFTER_DAYS } from './attention'

describe('lateness', () => {
  it('uses 14 days until the owner sets per-stage thresholds', () => {
    expect(LATE_AFTER_DAYS).toBe(14)
  })

  it('counts more than 14 days as late, and 14 or fewer as on time', () => {
    expect(isLate({ count: 1, measure: { kind: 'days', value: 15 } })).toBe(true)
    expect(isLate({ count: 1, measure: { kind: 'days', value: 14 } })).toBe(false)
    expect(isLate({ count: 1, measure: { kind: 'days', value: 3 } })).toBe(false)
  })

  it('ignores a late flag on day-based items, so the day rule always wins', () => {
    expect(isLate({ count: 1, measure: { kind: 'days', value: 2 }, late: true })).toBe(false)
  })

  it('uses the late flag for minutes and margin, which have no agreed rule yet', () => {
    expect(isLate({ count: 1, measure: { kind: 'minutes', value: 12 }, late: true })).toBe(true)
    expect(isLate({ count: 1, measure: { kind: 'margin', value: 32 } })).toBe(false)
  })
})

describe('combining locations', () => {
  it('adds counts and keeps the oldest wait', () => {
    const combined = combineParts([
      { count: 11, measure: { kind: 'days', value: 63 } },
      { count: 2, measure: { kind: 'days', value: 9 } },
    ])
    expect(combined).toEqual({ count: 13, measure: { kind: 'days', value: 63 }, late: false })
  })

  it('keeps the lowest margin', () => {
    const combined = combineParts([
      { count: 1, measure: { kind: 'margin', value: 32 }, late: true },
      { count: 1, measure: { kind: 'margin', value: 29 }, late: true },
    ])
    expect(combined?.measure).toEqual({ kind: 'margin', value: 29 })
    expect(combined?.count).toBe(2)
  })

  it('returns nothing when no location has anything waiting', () => {
    expect(combineParts([])).toBeNull()
    expect(combineParts([{ count: 0, measure: { kind: 'days', value: 4 } }])).toBeNull()
  })
})

describe('wording', () => {
  it('formats ages and margins in plain words', () => {
    expect(formatMeasure({ kind: 'days', value: 63 })).toBe('63 days')
    expect(formatMeasure({ kind: 'days', value: 1 })).toBe('1 day')
    expect(formatMeasure({ kind: 'minutes', value: 12 })).toBe('12 minutes')
    expect(formatMeasure({ kind: 'margin', value: 32 })).toBe('32% margin')
  })

  it('writes the home headline in sentence case with correct plurals', () => {
    expect(attentionHeadline(6)).toBe('6 things need attention')
    expect(attentionHeadline(1)).toBe('1 thing needs attention')
    expect(attentionHeadline(0)).toBe('Nothing needs attention')
  })
})
