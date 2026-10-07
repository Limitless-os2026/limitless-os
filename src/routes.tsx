import type { RouteObject } from 'react-router'
import { AppShell } from './components/AppShell'
import { comingLater } from './lib/navigation'
import { ComingLater, NotFound } from './pages/ComingLater'
import { OfficeHome } from './pages/OfficeHome'
import { People, PersonEdit } from './pages/People'

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <OfficeHome /> },
      ...comingLater.map((screen) => ({ path: screen.path, element: <ComingLater key={screen.path} screen={screen} /> })),
      { path: 'people', element: <People /> },
      { path: 'people/:personId', element: <PersonEdit /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]
