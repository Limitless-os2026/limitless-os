import type { RouteObject } from 'react-router'
import { AppShell } from './components/AppShell'
import { comingLater } from './lib/navigation'
import { ComingLater, NotFound } from './pages/ComingLater'
import { CustomerPage, Customers, EditCustomer, NewCustomer, NewPropertyPage } from './pages/Customers'
import { OfficeHome } from './pages/OfficeHome'
import { MyDetails } from './pages/MyDetails'
import { ContactPage, EditOrganization, NewContactPage, NewOrganization, OrganizationPage, Partners } from './pages/Partners'
import { AddPerson, People, PersonEdit } from './pages/People'
import { Search } from './pages/Search'

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <OfficeHome /> },
      ...comingLater.map((screen) => ({ path: screen.path, element: <ComingLater key={screen.path} screen={screen} /> })),
      { path: 'customers', element: <Customers /> },
      { path: 'customers/new', element: <NewCustomer /> },
      { path: 'customers/:customerId', element: <CustomerPage /> },
      { path: 'customers/:customerId/edit', element: <EditCustomer /> },
      { path: 'customers/:customerId/properties/new', element: <NewPropertyPage /> },
      { path: 'partners', element: <Partners /> },
      { path: 'partners/new', element: <NewOrganization /> },
      // Contacts live under Partners, so the Partners link stays lit while
      // one is open. Fixed words beat an organization id in the router.
      { path: 'partners/contacts/new', element: <NewContactPage /> },
      { path: 'partners/contacts/:contactId', element: <ContactPage /> },
      { path: 'partners/:organizationId', element: <OrganizationPage /> },
      { path: 'partners/:organizationId/edit', element: <EditOrganization /> },
      { path: 'search', element: <Search /> },
      { path: 'people', element: <People /> },
      { path: 'people/new', element: <AddPerson /> },
      { path: 'people/:personId', element: <PersonEdit /> },
      { path: 'me', element: <MyDetails /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]
