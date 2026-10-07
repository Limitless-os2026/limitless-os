import type { RouteObject } from 'react-router'
import { AppShell } from './components/AppShell'
import { comingLater } from './lib/navigation'
import { ComingLater, NotFound } from './pages/ComingLater'
import { OfficeHome } from './pages/OfficeHome'

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <OfficeHome /> },
      ...comingLater.map((screen) => ({ path: screen.path, element: <ComingLater key={screen.path} screen={screen} /> })),
      { path: '*', element: <NotFound /> },
    ],
  },
]
