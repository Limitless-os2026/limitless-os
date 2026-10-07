// Rules for the Needs Attention list on the Office home screen.
//
// Until the owner sets a lateness threshold per stage, anything waiting more
// than 14 days counts as late (spec section 11, open question).

export const LATE_AFTER_DAYS = 14

/** How long something has waited, or how far below a threshold it is. */
export type Measure =
  | { kind: 'days'; value: number }
  | { kind: 'minutes'; value: number }
  | { kind: 'margin'; value: number }

/** One location's share of a Needs Attention item. */
export interface AttentionPart {
  count: number
  measure: Measure
  /**
   * Lateness for measures that have no agreed rule yet (minutes, margin).
   * Day-based measures ignore this and use LATE_AFTER_DAYS.
   */
  late?: boolean
}

export function isLate(part: AttentionPart): boolean {
  if (part.measure.kind === 'days') return part.measure.value > LATE_AFTER_DAYS
  return part.late === true
}

/**
 * Combines the same item across locations: counts add up, and the worst
 * measure wins (oldest wait, or lowest margin).
 */
export function combineParts(parts: readonly AttentionPart[]): AttentionPart | null {
  const present = parts.filter((part) => part.count > 0)
  const [first, ...rest] = present
  if (!first) return null
  return rest.reduce<AttentionPart>(
    (worst, part) => ({
      count: worst.count + part.count,
      measure: worse(worst.measure, part.measure),
      late: worst.late === true || part.late === true,
    }),
    first,
  )
}

function worse(a: Measure, b: Measure): Measure {
  if (a.kind !== b.kind) throw new Error(`Cannot combine ${a.kind} with ${b.kind}`)
  if (a.kind === 'margin') return b.value < a.value ? b : a
  return b.value > a.value ? b : a
}

export function formatMeasure(measure: Measure): string {
  switch (measure.kind) {
    case 'days':
      return measure.value === 1 ? '1 day' : `${measure.value} days`
    case 'minutes':
      return measure.value === 1 ? '1 minute' : `${measure.value} minutes`
    case 'margin':
      return `${measure.value}% margin`
  }
}

/** The page title, for example "6 things need attention". */
export function attentionHeadline(itemCount: number): string {
  if (itemCount === 0) return 'Nothing needs attention'
  if (itemCount === 1) return '1 thing needs attention'
  return `${itemCount} things need attention`
}
