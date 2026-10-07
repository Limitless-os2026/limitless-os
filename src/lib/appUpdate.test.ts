import {
  applyUpdate,
  checkForUpdates,
  isUpdateReady,
  markUpdateReady,
  offerUpdate,
  resetAppUpdate,
  somethingTyped,
} from './appUpdate'

afterEach(() => {
  resetAppUpdate()
  document.body.innerHTML = ''
})

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('checking for a newer version', () => {
  it('checks when the app opens and when it comes back to the foreground, at most once a minute', () => {
    let time = 0
    const registration = { update: vi.fn(() => Promise.resolve()) }
    const stop = checkForUpdates(registration, { now: () => time })
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

  it('switches to a version that is already waiting when the app comes back in front and nothing is typed', () => {
    const apply = vi.fn()
    const registration = { update: vi.fn(() => Promise.resolve()) }
    const stop = checkForUpdates(registration, { now: () => 0, reload: vi.fn() })
    markUpdateReady(apply)
    expect(apply).not.toHaveBeenCalled()

    setVisibility('visible')
    expect(apply).toHaveBeenCalledTimes(1)
    stop()
  })

  it('leaves a waiting version to the Update ready bar while something is typed', () => {
    document.body.innerHTML = '<input value="half an em">'
    const apply = vi.fn()
    const registration = { update: vi.fn(() => Promise.resolve()) }
    const stop = checkForUpdates(registration, { now: () => 0, reload: vi.fn() })
    markUpdateReady(apply)

    setVisibility('visible')
    expect(apply).not.toHaveBeenCalled()
    expect(isUpdateReady()).toBe(true)
    stop()
  })
})

describe('whether something has been typed', () => {
  it('is no on a page of empty fields, buttons and ticks', () => {
    document.body.innerHTML = `
      <input><input type="email" value="">
      <input type="checkbox" checked><input type="radio" checked>
      <input type="submit" value="Save"><button>Sign in</button>
      <textarea>  </textarea>`
    expect(somethingTyped()).toBe(false)
  })

  it('is yes once a field has text in it', () => {
    document.body.innerHTML = '<input type="tel" value="610">'
    expect(somethingTyped()).toBe(true)
    document.body.innerHTML = '<textarea>Gate code 4411</textarea>'
    expect(somethingTyped()).toBe(true)
  })

  it('ignores fields nobody can type into', () => {
    document.body.innerHTML = '<input value="a" disabled><input value="b" readonly><input type="hidden" value="c">'
    expect(somethingTyped()).toBe(false)
  })
})

describe('offering a newer version', () => {
  it('switches at once when nothing has been typed', () => {
    const apply = vi.fn()
    offerUpdate(apply, { reload: vi.fn() })
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('shows the Update ready bar and waits when something has been typed', () => {
    document.body.innerHTML = '<input value="dana@example.com">'
    const apply = vi.fn()
    offerUpdate(apply, { reload: vi.fn() })
    expect(apply).not.toHaveBeenCalled()
    expect(isUpdateReady()).toBe(true)
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

  it('switches once, however often it is asked', async () => {
    vi.useFakeTimers()
    const apply = vi.fn()
    markUpdateReady(apply)
    await Promise.all([applyUpdate(vi.fn()), applyUpdate(vi.fn())])
    await applyUpdate(vi.fn())
    expect(apply).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
