// Turns the Office home sample data into what the screen shows for the
// chosen location.

import {
  attentionItems,
  boardCounts,
  todayEntries,
  viewCounts,
  type AttentionItemData,
  type BoardCountData,
  type TodayEntryData,
  type ViewCountData,
} from '../fixtures/officeHome'
import { combineParts, isLate, type AttentionPart } from './attention'
import { statesFor, type LocationFilter, type StateCode } from './locations'

export interface AttentionRow {
  id: string
  title: string
  detail: string
  to: string
  count: number
  part: AttentionPart
  late: boolean
}

export interface CountTile {
  key: string
  name: string
  count: number
}

export interface OfficeHomeData {
  attention: AttentionRow[]
  today: TodayEntryData[]
  boards: CountTile[]
  views: CountTile[]
}

export interface OfficeHomeSource {
  attentionItems: readonly AttentionItemData[]
  todayEntries: readonly TodayEntryData[]
  boardCounts: readonly BoardCountData[]
  viewCounts: readonly ViewCountData[]
}

const sampleSource: OfficeHomeSource = { attentionItems, todayEntries, boardCounts, viewCounts }

function sumFor(jobs: Record<StateCode, number>, states: readonly StateCode[]): number {
  return states.reduce((total, state) => total + jobs[state], 0)
}

export function officeHomeData(location: LocationFilter, source: OfficeHomeSource = sampleSource): OfficeHomeData {
  const states = statesFor(location)

  // Items with nothing waiting in the chosen location drop off the list.
  const attention = source.attentionItems.flatMap((item): AttentionRow[] => {
    const parts = states.flatMap((state) => item.parts[state] ?? [])
    const part = combineParts(parts)
    if (!part) return []
    return [
      {
        id: item.id,
        title: item.title,
        detail: item.detail(part.measure),
        to: item.to,
        count: part.count,
        part,
        late: isLate(part),
      },
    ]
  })

  return {
    attention,
    today: source.todayEntries.filter((entry) => states.includes(entry.state)),
    boards: source.boardCounts.map((board) => ({ key: board.key, name: board.name, count: sumFor(board.jobs, states) })),
    views: source.viewCounts.map((view) => ({ key: view.key, name: view.name, count: sumFor(view.jobs, states) })),
  }
}
