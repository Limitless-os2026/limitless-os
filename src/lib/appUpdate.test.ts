import { applyUpdate, checkForUpdates, isUpdateReady, markUpdateReady, resetAppUpdate } from './appUpdate'

afterEach(() => resetAppUpdate())

describe('checking for a newer version', () => {
  function setVisibility(state: DocumentVisibilityState) {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
    document.dispatchEvent(new Event('visibilitychange'))
  }

  it('checks when the app opens and when it comes back to the foreground, at most once a minute', () => {
    let time = 0
    const registration = { update: vi.fn(() => Promise.resolve()) }
    const stop = checkForUpdates(registration, () => time)
    expect(registration.update).toHaveBeenCalledTimes(1)

    // Back in front a few seconds later: too soon to check again.
    time = 5_000
    setVisibility('visible')
    expect(registration.update).toHaveBeenCalledTimes(1)

    // Sent to the background, then back in front later on.
    time = 120_000
    setVisibility('hidden')
    expect(registration.update).toHaveBeenCalledTimes(1)
    setVisibility('visible')
    expect(registration.update).toHaveBeenCalledTimes(2)

    stop()
    time = 600_000
    setVisibility('visible')
    expect(registration.update).toHaveBeenCalledTimes(2)
  })

  it('shrugs off a failed check, such as having no signal', async () => {
    const registration = { update: vi.fn(() => Promise.reject(new Error('offline'))) }
    const stop = checkForUpdates(registration)
    await Promise.resolve()
    expect(registration.update).toHaveBeenCalledTimes(1)
    stop()
  })
})

describe('applying an update', () => {
  it('does nothing until a newer version is waiting', async () => {
    const reload = vi.fn()
    await applyUpdate(reload)
    expect(isUpdateReady()).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('switches to the new version, and reloads if the page has not already', async () => {
    vi.useFakeTimers()
    const apply = vi.fn()
    const reload = vi.fn()
    markUpdateReady(apply)
    expect(isUpdateReady()).toBe(true)

    await applyUpdate(reload)
    expect(apply).toHaveBeenCalledTimes(1)
    expect(reload).not.toHaveBeenCalled()
    vi.advanceTimersByTime(3000)
    expect(reload).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
