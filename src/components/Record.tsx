import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronLeftIcon } from './Icons'

// Small pieces shared by record screens (a customer, an organization, a
// contact): the way back, the row of call and text buttons, and the details
// list on the side.

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="back-link">
      <ChevronLeftIcon />
      {children}
    </Link>
  )
}

/** Call, Text and Email as plain buttons, with the one yellow next step last. */
export function ActionBar({ children }: { children: ReactNode }) {
  return <div className="action-bar">{children}</div>
}

export function CallLink({ phone }: { phone: string | null | undefined }) {
  if (!phone) return null
  return (
    <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="button-plain">
      Call
    </a>
  )
}

export function TextLink({ phone }: { phone: string | null | undefined }) {
  if (!phone) return null
  return (
    <a href={`sms:${phone.replace(/[^\d+]/g, '')}`} className="button-plain">
      Text
    </a>
  )
}

export function EmailLink({ email }: { email: string | null | undefined }) {
  if (!email) return null
  return (
    <a href={`mailto:${email}`} className="button-plain">
      Email
    </a>
  )
}

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === '') return null
  return (
    <div className="details__row">
      <span className="details__label">{label}</span>
      <span className="details__value">{children}</span>
    </div>
  )
}

export function PanelTitle({ children }: { children: ReactNode }) {
  return <h2 className="panel__title">{children}</h2>
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="panel__empty">{children}</p>
}

/** Shown when a list could not be loaded, with a way to try again. */
export function LoadProblem({ what, retry }: { what: string; retry: () => void }) {
  return (
    <section className="panel placeholder">
      <p role="alert">Could not load {what}. Check the connection and try again.</p>
      <button type="button" className="button-plain" onClick={retry}>
        Try again
      </button>
    </section>
  )
}

/** "1 customer", "4 customers". */
export function countOf(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`
}

export function LoadingText({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="muted">
      {children}
    </p>
  )
}
