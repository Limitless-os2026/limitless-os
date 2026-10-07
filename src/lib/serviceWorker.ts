// The page's side of the service worker: registering it, noticing when a
// newer version takes over, and catching up when the version check says this
// copy is behind.

import { checkForUpdates, offerUpdate } from './appUpdate'
import { isNewVersionMessage, PAGE_HANDLES_UPDATES } from './workerTakeover'

export const WORKER_URL = '/sw.js'

const SKIP_WAITING = { type: 'SKIP_WAITING' }
const ATTEMPT_KEY = 'limitless-os.update-attempt'

export interface WorkerLink {
  /**
   * The version check found that this copy is behind the published version.
   * Bring the new one in: through the worker when there is one, and otherwise
   * by reloading from the server.
   */
  catchUp(published: string): Promise<void>
}

export interface WorkerOptions {
  reload?: () => void
  doc?: Document
  /** Remembers which version a reload was already tried for, so a stuck server cannot cause an endless loop. */
  storage?: Storage | null
  caches?: CacheStorage | undefined
  wait?: (ms: number) => Promise<void>
}

/**
 * Registers the worker and listens for a newer version taking over. Without a
 * container (no browser support, or the dev server) nothing is registered and
 * only the catch-up remains.
 */
export function startServiceWorker(container: ServiceWorkerContainer | undefined, options: WorkerOptions = {}): WorkerLink {
  const reload = options.reload ?? (() => window.location.reload())
  const doc = options.doc ?? (typeof document !== 'undefined' ? document : undefined)
  const storage = options.storage === undefined ? safeStorage() : options.storage
  const cacheStore = options.caches ?? (typeof caches !== 'undefined' ? caches : undefined)
  const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))

  let newVersionArrived = false
  function moveOn() {
    newVersionArrived = true
    offerUpdate(() => reload(), { doc, reload })
  }

  if (container) {
    container.addEventListener('message', (event: MessageEvent) => {
      if (!isNewVersionMessage(event.data)) return
      // Answer, so the worker knows this page moves on by itself and does
      // not reload it under someone's fingers.
      const worker = container.controller ?? (event.source as { postMessage(message: unknown): void } | null)
      worker?.postMessage({ type: PAGE_HANDLES_UPDATES })
      moveOn()
    })

    // The first worker to take control changes nothing for the page on
    // screen. Any later change means a newer version is now in charge.
    let hadController = container.controller !== null
    container.addEventListener('controllerchange', () => {
      if (hadController) moveOn()
      hadController = true
    })
  }

  const registered: Promise<ServiceWorkerRegistration | undefined> = container
    ? container
        .register(WORKER_URL, { scope: '/', updateViaCache: 'none' })
        .then((registration) => {
          checkForUpdates(registration, { doc, reload })
          nudgeWaitingWorker(registration)
          return registration
        })
        .catch(() => undefined)
    : Promise.resolve(undefined)

  return {
    async catchUp(published) {
      if (newVersionArrived) return
      const registration = await registered
      if (registration) {
        await registration.update().catch(() => undefined)
        registration.waiting?.postMessage(SKIP_WAITING)
        await untilWorkerSettles(registration, wait)
        if (newVersionArrived) return
      }
      // The worker did not bring the new version in. Load it from the server
      // instead, once per published version.
      if (!firstAttempt(storage, published)) return
      offerUpdate(
        async () => {
          await forgetWorker(container, cacheStore)
          reload()
        },
        { doc, reload },
      )
    },
  }
}

/**
 * Our workers take over by themselves. Should one ever wait, an older style
 * of worker or a browser quirk, tell it to go ahead.
 */
function nudgeWaitingWorker(registration: ServiceWorkerRegistration): void {
  registration.waiting?.postMessage(SKIP_WAITING)
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'installed' && registration.waiting === installing) installing.postMessage(SKIP_WAITING)
    })
  })
}

/**
 * Waits while a worker is downloading or starting, for up to three minutes
 * on a weak signal, then a moment longer for the page to hear about it.
 */
async function untilWorkerSettles(registration: ServiceWorkerRegistration, wait: (ms: number) => Promise<void>): Promise<void> {
  for (let tries = 0; tries < 360; tries++) {
    const busy = registration.installing !== null || registration.waiting !== null || registration.active?.state === 'activating'
    if (!busy) break
    await wait(500)
  }
  await wait(1000)
}

function firstAttempt(storage: Storage | null, published: string): boolean {
  try {
    if (storage?.getItem(ATTEMPT_KEY) === published) return false
    storage?.setItem(ATTEMPT_KEY, published)
  } catch {
    // Storage switched off or full: still try once.
  }
  return true
}

/** Lets go of the worker and its saved copy, so the next load comes from the server. */
async function forgetWorker(container: ServiceWorkerContainer | undefined, cacheStore: CacheStorage | undefined): Promise<void> {
  try {
    const registrations = container ? await container.getRegistrations() : []
    await Promise.all(registrations.map((registration) => registration.unregister()))
  } catch {
    // Nothing to let go of.
  }
  try {
    if (cacheStore) {
      const names = await cacheStore.keys()
      await Promise.all(names.map((name) => cacheStore.delete(name)))
    }
  } catch {
    // Already gone.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}
