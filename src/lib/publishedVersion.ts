// The second safety net, which does not depend on the service worker. When
// the app opens or comes back to the foreground, it fetches version.json,
// published next to the app with caching switched off, and compares it with
// its own version. A copy that is behind catches up (serviceWorker.ts).

import { onAppOpenOrReturn } from './appUpdate'

export const VERSION_FILE = '/version.json'

/**
 * The version the server has right now, or null when it cannot be read: no
 * signal, a busy server, or a server without the file.
 */
export async function fetchPublishedVersion(fetchFn: typeof fetch = fetch): Promise<string | null> {
  try {
    // A fresh query string and no-store keep the browser, and anything in
    // between, from answering with an old copy of the file.
    const response = await fetchFn(`${VERSION_FILE}?at=${Date.now()}`, { cache: 'no-store', credentials: 'omit' })
    if (!response.ok) return null
    const data: unknown = await response.json()
    const version = typeof data === 'object' && data !== null ? (data as { version?: unknown }).version : undefined
    return typeof version === 'string' && version !== '' ? version : null
  } catch {
    return null
  }
}

export interface VersionWatch {
  /** This copy's own version. */
  current: string
  /** Called when the server has a different version from this copy. */
  onBehind: (published: string) => void
  fetchVersion?: () => Promise<string | null>
  now?: () => number
}

/**
 * Compares the published version with this copy's when the app opens, comes
 * back to the foreground, or gets its connection back, at most once a minute.
 * Returns a function that stops watching.
 */
export function watchPublishedVersion(options: VersionWatch): () => void {
  const { current, onBehind, fetchVersion = fetchPublishedVersion, now = Date.now } = options
  let lastCheck = -Infinity
  let checking = false

  return onAppOpenOrReturn(() => {
    if (checking || now() - lastCheck < 60_000) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    lastCheck = now()
    checking = true
    fetchVersion()
      .then((published) => {
        if (published !== null && published !== current) onBehind(published)
      })
      .finally(() => {
        checking = false
      })
  })
}
