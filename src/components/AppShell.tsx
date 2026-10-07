import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { mainNav, myDetailsScreen, newEmergency, newJob, peopleScreen } from '../lib/navigation'
import { canManagePeople, displayName } from '../lib/people'
import { useBackend, useSignedInPerson } from '../lib/SessionContext'
import { AppVersion } from './AppVersion'
import { CloseIcon, MenuIcon, PlusIcon } from './Icons'

// The green sidebar on wide screens. On a phone it folds into a top bar with
// a menu button, and New emergency stays in the top bar so it is one tap away.

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const sidebar = useRef<HTMLElement>(null)
  const { pathname } = useLocation()

  // Moving to another screen closes the phone menu.
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!menuOpen) return
    sidebar.current?.querySelector<HTMLElement>('a, button')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen])

  function closeMenu() {
    setMenuOpen(false)
    menuButton.current?.focus()
  }

  return (
    <div className="shell" data-menu-open={menuOpen}>
      <header className="topbar">
        <button
          ref={menuButton}
          type="button"
          className="topbar__menu"
          aria-label="Menu"
          aria-expanded={menuOpen}
          aria-controls="main-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MenuIcon />
        </button>
        <Link to="/" className="topbar__brand">
          Limitless OS
        </Link>
        <Link to={newEmergency.path} className="button-emergency">
          <PlusIcon />
          {newEmergency.label}
        </Link>
      </header>

      <button type="button" className="drawer-backdrop" aria-label="Close menu" tabIndex={-1} onClick={closeMenu} />

      <nav ref={sidebar} id="main-menu" className="sidebar" aria-label="Main">
        <div className="sidebar__top">
          <Link to="/" className="sidebar__brand">
            Limitless OS
          </Link>
          <button type="button" className="sidebar__close" aria-label="Close menu" onClick={closeMenu}>
            <CloseIcon />
          </button>
        </div>
        <div className="sidebar__create">
          <Link to={newEmergency.path} className="button-emergency">
            <PlusIcon />
            {newEmergency.label}
          </Link>
          <Link to={newJob.path} className="button-outline-light">
            {newJob.label}
          </Link>
        </div>
        <div className="sidebar__nav">
          {mainNav.map((link) => (
            <NavLink key={link.path} to={link.path} end={link.path === '/'} className="nav-link">
              {link.label}
            </NavLink>
          ))}
        </div>
        <SignedInFooter />
      </nav>

      <main className="main" id="content">
        <Outlet />
      </main>
    </div>
  )
}

// Who is signed in, at the foot of the sidebar, with their own details and
// sign-out. Admins also get the People screen here, so the eight main links
// stay as designed.
function SignedInFooter() {
  const backend = useBackend()
  const me = useSignedInPerson()
  const [signingOut, setSigningOut] = useState(false)

  return (
    <div className="sidebar__account">
      <div className="sidebar__who">
        <div className="sidebar__name">{displayName(me)}</div>
        <div className="sidebar__role">{me.role.name}</div>
      </div>
      <NavLink to={myDetailsScreen.path} className="nav-link">
        {myDetailsScreen.label}
      </NavLink>
      {canManagePeople(me) && (
        <NavLink to={peopleScreen.path} className="nav-link">
          {peopleScreen.label}
        </NavLink>
      )}
      <button
        type="button"
        className="sidebar__sign-out"
        disabled={signingOut}
        onClick={() => {
          setSigningOut(true)
          backend.signOut().catch(() => setSigningOut(false))
        }}
      >
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
      <AppVersion className="sidebar__version" />
    </div>
  )
}
