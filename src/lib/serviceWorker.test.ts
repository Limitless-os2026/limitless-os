import { isUpdateReady, resetAppUpdate } from './appUpdate'
import { startServiceWorker } from './serviceWorker'
import { NEW_VERSION_ACTIVE, PAGE_HANDLES_UPDATES } from './workerTakeover'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

interface FakeRegistration {
  installing: null
  waiting: null
  active: { state: string; postMessage: ReturnType<typeof vi.fn> } | null
  update: ReturnType<typeof vi.fn>
  unregister: ReturnType<typeof vi.fn>
  addEventListener: ReturnType<typeof vi.fn>
}

/** A stand-in for navigator.serviceWorker. `controlled` means an older worker already serves this page. */
function fakeContainer(options: { controlled: boolean; onUpdate?: () => void } = { controlled: false }) {
  const events = new EventTarget()
  const activeWorker = { state: 'activated', postMessage: vi.fn() }
  const registration: FakeRegistration = {
    installing: null,
    waiting: null,
    active: options.controlled ? activeWorker : null,
    update: vi.fn(async () => options.onUpdate?.()),
    unregister: vi.fn(async () => true),
    addEventListener: vi.fn(),
  }
  const container = {
    controller: options.controlled ? activeWorker : null,
    register: vi.fn(async () => registration),
    getRegistrations: vi.fn(async () => [registration]),
    addEventListener: (type: string, listener: EventListener) => events.addEventListener(type, listener),
    takeOver() {
      container.controller = activeWorker
      events.dispatchEvent(new Event('controllerchange'))
    },
    send(data: unknown) {
      events.dispatchEvent(new MessageEvent('message', { data }))
    },
  }
  return { container, registration, asContainer: container as unknown as ServiceWorkerContainer }
}

function fakeStorage(): Storage {
  const items = new Map<string, string>()
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) } as unknown as Storage
}

function fakeCaches() {
  const store = { keys: vi.fn(async () => ['precache-v1', 'precache-v2']), delete: vi.fn(async () => true) }
  return store as unknown as CacheStorage & typeof store
}

afterEach(() => {
  resetAppUpdate()
  document.body.innerHTML = ''
})

describe('registering the worker', () => {
  it('registers it with the browser cache kept out of the way, and looks for a newer version as the app opens', async () => {
    const { asContainer, container, registration } = fakeContainer()
    startServiceWorker(asContainer, { reload: vi.fn() })
    await flush()
    expect(container.register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' })
    expect(registration.update).toHaveBeenCalledTimes(1)
  })

  it('does nothing without a browser that supports it', async () => {
    const link = startServiceWorker(undefined, { reload: vi.fn(), storage: fakeStorage() })
    expect(link).toBeDefined()
  })
})

describe('when a newer worker takes over', () => {
  it('switches to the new version when nothing has been typed', async () => {
    const reload = vi.fn()
    const { asContainer, container } = fakeContainer({ controlled: true })
    startServiceWorker(asContainer, { reload })
    container.takeOver()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('shows the Update ready bar instead while something is typed', async () => {
    document.body.innerHTML = '<input value="dana@example.com">'
    const reload = vi.fn()
    const { asContainer, container } = fakeContainer({ controlled: true })
    startServiceWorker(asContainer, { reload })
    container.takeOver()
    expect(reload).not.toHaveBeenCalled()
    expect(isUpdateReady()).toBe(true)
  })

  it('does not count the very first worker as a new version', async () => {
    const reload = vi.fn()
    const { asContainer, container } = fakeContainer({ controlled: false })
    startServiceWorker(asContainer, { reload })
    container.takeOver()
    expect(reload).not.toHaveBeenCalled()
    expect(isUpdateReady()).toBe(false)

    // A later takeover is a new version.
    container.takeOver()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('answers the worker, so the worker does not reload the page, and then moves on', async () => {
    const reload = vi.fn()
    const { asContainer, container } = fakeContainer({ controlled: true })
    startServiceWorker(asContainer, { reload })
    container.send({ type: NEW_VERSION_ACTIVE, version: '0.2.0+abc1234' })
    expect(container.controller?.postMessage).toHaveBeenCalledWith({ type: PAGE_HANDLES_UPDATES })
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('ignores other messages', async () => {
    const reload = vi.fn()
    const { asContainer, container } = fakeContainer({ controlled: true })
    startServiceWorker(asContainer, { reload })
    container.send({ type: 'something else' })
    container.send('text')
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('catching up when the version file says this copy is behind', () => {
  const instant = async () => undefined

  it('asks the worker to look, and leaves the switch to the takeover when a new worker arrives', async () => {
    const reload = vi.fn()
    // The check as the app opens finds nothing. The one the catch-up asks for does.
    let looks = 0
    const fake = fakeContainer({ controlled: true, onUpdate: () => void (++looks === 2 && fake.container.takeOver()) })
    const link = startServiceWorker(fake.asContainer, { reload, storage: fakeStorage(), caches: fakeCaches(), wait: instant })
    await flush()
    expect(reload).not.toHaveBeenCalled()
    fake.registration.update.mockClear()

    await link.catchUp('0.2.0+new')
    expect(fake.registration.update).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(fake.registration.unregister).not.toHaveBeenCalled()
  })

  it('lets go of the worker and reloads from the server when the worker finds nothing new', async () => {
    const reload = vi.fn()
    const cacheStore = fakeCaches()
    const fake = fakeContainer({ controlled: true })
    const link = startServiceWorker(fake.asContainer, { reload, storage: fakeStorage(), caches: cacheStore, wait: instant })
    await flush()

    await link.catchUp('0.2.0+new')
    await flush()
    expect(fake.registration.unregister).toHaveBeenCalledTimes(1)
    expect(cacheStore.delete).toHaveBeenCalledTimes(2)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('tries that only once per published version, so a stuck server cannot cause an endless loop', async () => {
    const reload = vi.fn()
    const storage = fakeStorage()
    const fake = fakeContainer({ controlled: true })
    const link = startServiceWorker(fake.asContainer, { reload, storage, caches: fakeCaches(), wait: instant })
    await flush()

    await link.catchUp('0.2.0+new')
    await flush()
    resetAppUpdate()
    await link.catchUp('0.2.0+new')
    await flush()
    expect(reload).toHaveBeenCalledTimes(1)

    // Another version later is a fresh start.
    await link.catchUp('0.3.0+newer')
    await flush()
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('keeps what is being typed: the bar offers the reload instead', async () => {
    document.body.innerHTML = '<input value="half typed">'
    const reload = vi.fn()
    const fake = fakeContainer({ controlled: true })
    const link = startServiceWorker(fake.asContainer, { reload, storage: fakeStorage(), caches: fakeCaches(), wait: instant })
    await flush()

    await link.catchUp('0.2.0+new')
    await flush()
    expect(reload).not.toHaveBeenCalled()
    expect(fake.registration.unregister).not.toHaveBeenCalled()
    expect(isUpdateReady()).toBe(true)
  })

  it('does nothing more once the new version has already taken over', async () => {
    const reload = vi.fn()
    const fake = fakeContainer({ controlled: true })
    const link = startServiceWorker(fake.asContainer, { reload, storage: fakeStorage(), caches: fakeCaches(), wait: instant })
    await flush()
    fake.container.takeOver()
    fake.registration.update.mockClear()

    await link.catchUp('0.2.0+new')
    expect(fake.registration.update).not.toHaveBeenCalled()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reloads from the server once when there is no worker at all', async () => {
    const reload = vi.fn()
    const link = startServiceWorker(undefined, { reload, storage: fakeStorage(), wait: instant })
    await link.catchUp('0.2.0+new')
    await flush()
    expect(reload).toHaveBeenCalledTimes(1)
    resetAppUpdate()
    await link.catchUp('0.2.0+new')
    await flush()
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
