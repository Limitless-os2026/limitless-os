// Sidebar links and create buttons (spec section 10, Navigation), with the
// build step each unbuilt screen arrives in (spec section 5).

export interface ScreenLink {
  label: string
  path: string
  /** Shown on the placeholder page until the screen is built. */
  arrives?: string
}

export const newEmergency: ScreenLink = {
  label: 'New emergency',
  path: '/emergencies/new',
  arrives: 'Phase 2, with emergency dispatch',
}

export const newJob: ScreenLink = {
  label: 'New job or lead',
  path: '/jobs/new',
  arrives: 'Phase 1, step 4, with jobs',
}

export const mainNav: readonly ScreenLink[] = [
  { label: 'Home', path: '/' },
  { label: 'Boards', path: '/boards', arrives: 'Phase 1, step 4, with jobs and boards' },
  { label: 'Schedule', path: '/schedule', arrives: 'Phase 1, step 5, with appointments' },
  { label: 'Dispatch', path: '/dispatch', arrives: 'Phase 2, with emergency dispatch' },
  { label: 'Customers', path: '/customers' },
  { label: 'Partners', path: '/partners' },
  { label: 'Tasks', path: '/tasks', arrives: 'Phase 1, step 5, with tasks' },
  { label: 'Reports', path: '/reports', arrives: 'a later phase, once jobs and money are in' },
]

/** For Admins only, shown under their name in the sidebar. */
export const peopleScreen: ScreenLink = { label: 'People', path: '/people' }

/** For everyone, under their name in the sidebar: their own name, phone and password. */
export const myDetailsScreen: ScreenLink = { label: 'My details', path: '/me' }

export const searchScreen: ScreenLink = { label: 'Search', path: '/search' }

export const customersScreen: ScreenLink = { label: 'Customers', path: '/customers' }
export const partnersScreen: ScreenLink = { label: 'Partners', path: '/partners' }

/** Every screen that is not built yet, for the placeholder routes. */
export const comingLater: readonly ScreenLink[] = [newEmergency, newJob, ...mainNav.filter((link) => link.arrives)]
