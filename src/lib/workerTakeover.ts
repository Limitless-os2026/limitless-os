// Runs inside the service worker. Once a new version has taken over, every
// open page is moved onto it:
//
// - A page from this version or later answers the worker's message and then
//   switches by itself, or shows the Update ready bar if something has been
//   typed (see appUpdate.ts).
// - A page from an older version stays silent. It has no other way to move
//   on, so the worker reloads it where it stands.
//
// No browser types here, so the rules can be tested on their own.

export const NEW_VERSION_ACTIVE = 'limitless-os/new-version-active'
export const PAGE_HANDLES_UPDATES = 'limitless-os/page-handles-updates'

export interface NewVersionMessage {
  type: typeof NEW_VERSION_ACTIVE
  version: string
}

/** The part of a window client the takeover needs. */
export interface OpenPage {
  id: string
  url: string
  postMessage(message: unknown): void
  navigate(url: string): Promise<unknown>
}

export interface Takeover {
  /** Every message the worker receives goes through here, with the sender's client id. */
  receive(clientId: string | undefined, data: unknown): void
  /**
   * Tells each page that this version is now in charge, and reloads the ones
   * that do not answer in time. Resolves with what happened to each page.
   */
  movePages(pages: readonly OpenPage[], version: string): Promise<{ answered: string[]; reloaded: string[] }>
}

function messageType(data: unknown): unknown {
  return typeof data === 'object' && data !== null ? (data as { type?: unknown }).type : undefined
}

export function isNewVersionMessage(data: unknown): data is NewVersionMessage {
  return messageType(data) === NEW_VERSION_ACTIVE
}

export function isPageAnswer(data: unknown): boolean {
  return messageType(data) === PAGE_HANDLES_UPDATES
}

/** How long a page gets to answer. A page that knows about updates answers at once. */
export const ANSWER_WAIT_MS = 1500

export function createTakeover(options: { answerWaitMs?: number } = {}): Takeover {
  const answerWaitMs = options.answerWaitMs ?? ANSWER_WAIT_MS
  const waitingForAnswer = new Map<string, () => void>()

  function askPage(page: OpenPage, version: string): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        waitingForAnswer.delete(page.id)
        resolve(false)
      }, answerWaitMs)
      waitingForAnswer.set(page.id, () => {
        clearTimeout(timer)
        waitingForAnswer.delete(page.id)
        resolve(true)
      })
      try {
        page.postMessage({ type: NEW_VERSION_ACTIVE, version } satisfies NewVersionMessage)
      } catch {
        clearTimeout(timer)
        waitingForAnswer.delete(page.id)
        resolve(false)
      }
    })
  }

  return {
    receive(clientId, data) {
      if (clientId && isPageAnswer(data)) waitingForAnswer.get(clientId)?.()
    },

    async movePages(pages, version) {
      const answered: string[] = []
      const reloaded: string[] = []
      await Promise.all(
        pages.map(async (page) => {
          if (await askPage(page, version)) {
            answered.push(page.id)
            return
          }
          reloaded.push(page.id)
          // Not awaited on purpose. The browser only answers the reloaded
          // page's request once this worker has finished activating, and
          // activating waits for this function to finish.
          Promise.resolve()
            .then(() => page.navigate(page.url))
            .catch(() => undefined)
        }),
      )
      return { answered, reloaded }
    },
  }
}
