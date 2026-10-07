// Telling people when a newer version of the app has been published.
//
// The installed app keeps a saved copy of itself so it opens with no
// signal. When a new version is published, the new copy downloads in the
// background and waits. This file holds whether one is waiting, and checks
// for one when the app opens and each time it comes back to the foreground.
// The Update ready bar (components/UpdateBar.tsx) reads it.

import { useSyncExternalStore } from 'react'

type Apply = () => Promise<void> | void

let apply: Apply | null = null
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

/** Called when a newer version has downloaded. `applyUpdate` switches to it and reloads. */
export function markUpdateReady(applyUpdate: Apply): void {
  apply = applyUpdate
  notify()
}

/** Whether a newer version is waiting. */
export function isUpdateReady(): boolean {
  return apply !== null
}

/** Switches to the newer version and reloads the page. */
export async function applyUpdate(reload: () => void = () => window.location.reload()): Promise<void> {
  const current = apply
  if (!current) return
  await current()
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
  apply = null
  notify()
}

/** Anything that can look for a newer version, such as a service worker registration. */
export interface UpdateCheck {
  update(): Promise<unknown>
}

/**
 * Looks for a newer version now, and again whenever the app comes back to
 * the foreground or the connection returns. Checks at most once a minute.
 * Returns a function that stops checking.
 */
export function checkForUpdates(registration: UpdateCheck, now: () => number = Date.now): () => void {
  let lastCheck = -Infinity

  function check() {
    if (now() - lastCheck < 60_000) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    lastCheck = now()
    // No signal, or the server is busy: try again next time.
    registration.update().catch(() => undefined)
  }

  function onVisible() {
    if (document.visibilityState === 'visible') check()
  }

  check()
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)
  window.addEventListener('online', check)
  window.addEventListener('pageshow', onVisible)
  return () => {
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', onVisible)
    window.removeEventListener('online', check)
    window.removeEventListener('pageshow', onVisible)
  }
}
