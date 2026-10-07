// Moving a copy of the app onto a newer published version.
//
// The installed app keeps a saved copy of itself so it opens with no signal.
// When a newer version is published, the service worker downloads it and takes
// over (sw.ts). This file decides what the page on screen does then:
//
// - If nothing has been typed, the page switches to the new version by itself.
//   A copy that opens on an old version never stays on it.
// - If something has been typed, the Update ready bar
//   (components/UpdateBar.tsx) offers the switch and nothing is thrown away.
//
// It also drives the checks: when the app opens, each time it comes back to
// the foreground, and when the connection returns.

import { useSyncExternalStore } from 'react'

type Apply = () => Promise<void> | void

let pending: Apply | null = null
let applying = false
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

/** A newer version is ready. `apply` switches to it. The bar shows until then. */
export function markUpdateReady(apply: Apply): void {
  pending = apply
  notify()
}

/** Whether a newer version is waiting. */
export function isUpdateReady(): boolean {
  return pending !== null
}

/** Switches to the newer version and reloads the page. */
export async function applyUpdate(reload: () => void = () => window.location.reload()): Promise<void> {
  const current = pending
  if (!current || applying) return
  applying = true
  try {
    await current()
  } catch {
    applying = false
    return
  }
  // The page normally reloads by itself once the new version takes over.
  // If that has not happened shortly after, reload anyway.
  window.setTimeout(reload, 3000)
}

export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    isUpdateReady,
    () => false,
  )
}

/** For tests: back to no update waiting. */
export function resetAppUpdate(): void {
  pending = null
  applying = false
  notify()
}

// Fields that hold nothing a person typed.
const UNTYPED_INPUTS = new Set(['hidden', 'submit', 'button', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image'])

/**
 * Whether someone has typed into a field on the page. While that is true the
 * page never switches versions by itself, so nothing typed is thrown away.
 */
export function somethingTyped(doc: Document = document): boolean {
  for (const field of doc.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')) {
    if (field.disabled || field.readOnly) continue
    if (field instanceof HTMLInputElement && UNTYPED_INPUTS.has(field.type)) continue
    if (field.value.trim() !== '') return true
  }
  return false
}

/**
 * A newer version has taken over underneath this page. Switch to it now when
 * nothing has been typed; otherwise show the Update ready bar and leave the
 * switch to the person.
 */
export function offerUpdate(apply: Apply, options: { doc?: Document; reload?: () => void } = {}): void {
  markUpdateReady(apply)
  if (!somethingTyped(options.doc ?? document)) void applyUpdate(options.reload)
}

export type OpenMoment = 'open' | 'return' | 'online'

/**
 * Runs `callback` now, and again whenever the app comes back to the
 * foreground or the connection returns. Returns a function that stops it.
 */
export function onAppOpenOrReturn(callback: (moment: OpenMoment) => void): () => void {
  function onVisible() {
    if (document.visibilityState === 'visible') callback('return')
  }
  function onOnline() {
    callback('online')
  }

  callback('open')
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)
  window.addEventListener('pageshow', onVisible)
  window.addEventListener('online', onOnline)
  return () => {
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', onVisible)
    window.removeEventListener('pageshow', onVisible)
    window.removeEventListener('online', onOnline)
  }
}

/** Anything that can look for a newer version, such as a service worker registration. */
export interface UpdateCheck {
  update(): Promise<unknown>
}

/**
 * Looks for a newer version now, and again whenever the app comes back to
 * the foreground or the connection returns, at most once a minute. If a
 * newer version is already waiting and nothing has been typed, switches to
 * it instead. Returns a function that stops checking.
 */
export function checkForUpdates(
  registration: UpdateCheck,
  options: { now?: () => number; doc?: Document; reload?: () => void } = {},
): () => void {
  const now = options.now ?? Date.now
  let lastCheck = -Infinity

  return onAppOpenOrReturn(() => {
    if (isUpdateReady() && !somethingTyped(options.doc ?? document)) {
      void applyUpdate(options.reload)
      return
    }
    if (now() - lastCheck < 60_000) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    lastCheck = now()
    // No signal, or the server is busy: try again next time.
    registration.update().catch(() => undefined)
  })
}
