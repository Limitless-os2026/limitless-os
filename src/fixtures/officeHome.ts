// Sample data for the Office home screen. Made-up addresses only.
//
// This is the only place the home screen's numbers come from until the
// database arrives (Phase 1, steps 2 to 6). Totals across both states match
// the approved mockup in docs/design/office-home.html.

import type { AttentionPart, Measure } from '../lib/attention'
import type { StateCode } from '../lib/locations'

export interface AttentionItemData {
  id: string
  title: string
  /** Second line. Receives the combined measure so it can mention the oldest wait. */
  detail: (measure: Measure) => string
  to: string
  parts: Partial<Record<StateCode, AttentionPart>>
}

export interface TodayEntryData {
  id: string
  /** Display time in the office's own time zone, or null when it is happening now. */
  time: string | null
  title: string
  address: string
  state: StateCode
  to: string
}

export type BoardKey = 'retail' | 'insurance' | 'emergency_tarps' | 'servpro_recon' | 'warranty_claims'

export interface BoardCountData {
  key: BoardKey
  name: string
  jobs: Record<StateCode, number>
}

export interface ViewCountData {
  key: 'in_production' | 'billing'
  name: string
  jobs: Record<StateCode, number>
}

export const attentionItems: AttentionItemData[] = [
  {
    id: 'emergency-not-invoiced',
    title: 'Emergency jobs finished, not invoiced',
    detail: (measure) => `The oldest has waited ${measure.value} ${measure.value === 1 ? 'day' : 'days'}`,
    to: '/boards',
    parts: {
      PA: { count: 11, measure: { kind: 'days', value: 63 } },
      UT: { count: 2, measure: { kind: 'days', value: 9 } },
    },
  },
  {
    id: 'supplements-no-answer',
    title: 'Supplements with no answer',
    detail: () => 'Submitted more than 14 days ago',
    to: '/boards',
    parts: {
      PA: { count: 3, measure: { kind: 'days', value: 21 } },
    },
  },
  {
    id: 'signed-no-deposit',
    title: 'Contracts signed, no deposit recorded',
    detail: () => 'First commission stays on hold until a deposit is entered',
    to: '/boards',
    parts: {
      PA: { count: 1, measure: { kind: 'days', value: 5 } },
      UT: { count: 1, measure: { kind: 'days', value: 2 } },
    },
  },
  {
    id: 'inspected-no-estimate',
    title: 'Inspections done, estimate missing',
    detail: () => 'Each one is assigned to the rep who inspected',
    to: '/boards',
    parts: {
      PA: { count: 3, measure: { kind: 'days', value: 3 } },
      UT: { count: 1, measure: { kind: 'days', value: 1 } },
    },
  },
  {
    id: 'sold-under-margin',
    title: 'Job sold under 35% margin',
    detail: () => 'Pays no commission unless the margin recovers',
    to: '/boards',
    parts: {
      PA: { count: 1, measure: { kind: 'margin', value: 32 }, late: true },
    },
  },
  {
    id: 'dispatch-not-accepted',
    title: 'Dispatch not accepted',
    detail: () => 'A text went to the crew lead as a backup',
    to: '/dispatch',
    parts: {
      UT: { count: 1, measure: { kind: 'minutes', value: 12 }, late: true },
    },
  },
]

export const todayEntries: TodayEntryData[] = [
  { id: 't1', time: null, title: 'Emergency tarp', address: '123 Main Street', state: 'PA', to: '/dispatch' },
  { id: 't2', time: '8:30 AM', title: 'Roof inspection', address: '45 Oak Avenue', state: 'PA', to: '/schedule' },
  { id: 't3', time: '10:00 AM', title: 'Adjuster meeting', address: '9 Ridge Road', state: 'UT', to: '/schedule' },
  { id: 't4', time: '1:30 PM', title: 'Estimate review', address: '210 Elm Street', state: 'PA', to: '/schedule' },
]

export const boardCounts: BoardCountData[] = [
  { key: 'retail', name: 'Retail', jobs: { PA: 26, UT: 4 } },
  { key: 'insurance', name: 'Insurance', jobs: { PA: 35, UT: 4 } },
  { key: 'emergency_tarps', name: 'Emergency tarps', jobs: { PA: 13, UT: 4 } },
  { key: 'servpro_recon', name: 'SERVPRO recon', jobs: { PA: 9, UT: 1 } },
  { key: 'warranty_claims', name: 'Warranty claims', jobs: { PA: 1, UT: 0 } },
]

export const viewCounts: ViewCountData[] = [
  { key: 'in_production', name: 'In production', jobs: { PA: 11, UT: 2 } },
  { key: 'billing', name: 'Billing', jobs: { PA: 50, UT: 5 } },
]
