/// <reference lib="webworker" />
// The service worker. It keeps a saved copy of the app shell so the installed
// app opens with no signal, and it brings every copy onto a newly published
// version by itself.
//
// Why it takes over at once instead of waiting its turn: on an iPhone or iPad
// the app is frozen in the background rather than closed, so a worker that
// waits for the old copy to close can wait for days. Meanwhile the old worker
// keeps serving the old shell, and an old copy has no button to tap. So this
// worker skips the wait, takes control of the open pages, and moves them on
// (lib/workerTakeover.ts). The page then switches when nothing has been
// typed, or shows the Update ready bar (lib/appUpdate.ts).

import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { createTakeover } from './lib/workerTakeover'

declare const self: ServiceWorkerGlobalScope

// Everything the app needs to open: the shell, scripts, styles, fonts and
// icons. The build fills in the list, with a revision for each file, so a
// changed file is downloaded again and an unchanged one is kept.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Every address in the app opens the same shell, which then shows the right screen.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// Take over from any older worker as soon as this one is installed.
void self.skipWaiting()

const takeover = createTakeover()

self.addEventListener('message', (event) => {
  // An older copy of the app, or the version check, asking a waiting worker to go ahead.
  if (isSkipWaitingMessage(event.data)) {
    void self.skipWaiting()
    return
  }
  const source = event.source
  takeover.receive(source instanceof Client ? source.id : undefined, event.data)
})

self.addEventListener('activate', (event) => {
  event.waitUntil(bringOpenPagesAlong())
})

/** Takes control of every open page and moves it onto this version. */
async function bringOpenPagesAlong(): Promise<void> {
  await self.clients.claim()
  const pages = await self.clients.matchAll({ type: 'window' })
  await takeover.movePages(pages, __APP_VERSION__)
}

function isSkipWaitingMessage(data: unknown): boolean {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'SKIP_WAITING'
}
