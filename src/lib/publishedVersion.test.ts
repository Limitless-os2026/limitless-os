import { fetchPublishedVersion, watchPublishedVersion } from './publishedVersion'

function answer(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('reading the published version', () => {
  it('asks the server for version.json with caching switched off', async () => {
    const fetchFn = vi.fn(async () => answer({ version: '0.1.0+a1b2c3d', builtAt: '2026-10-07T12:00:00Z' }))
    expect(await fetchPublishedVersion(fetchFn)).toBe('0.1.0+a1b2c3d')

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/^\/version\.json\?at=\d+$/)
    expect(init).toMatchObject({ cache: 'no-store' })
  })

  it('gives up quietly when the file cannot be read', async () => {
    expect(await fetchPublishedVersion(vi.fn(async () => answer('missing', false)))).toBeNull()
    expect(
      await fetchPublishedVersion(
        vi.fn(async () => {
          throw new TypeError('offline')
        }),
      ),
    ).toBeNull()
    expect(await fetchPublishedVersion(vi.fn(async () => answer({ version: 7 })))).toBeNull()
    expect(await fetchPublishedVersion(vi.fn(async () => answer(null)))).toBeNull()
  })
})

describe('watching the published version', () => {
  it('says when the server has a different version: on open and on return, at most once a minute', async () => {
    let time = 0
    let published = '0.1.0+aaaaaaa'
    const onBehind = vi.fn()
    const stop = watchPublishedVersion({ current: '0.1.0+aaaaaaa', onBehind, fetchVersion: async () => published, now: () => time })
    await flush()
    expect(onBehind).not.toHaveBeenCalled()

    // A new version is published, but the app only just checked.
    published = '0.1.0+bbbbbbb'
    time = 30_000
    setVisibility('visible')
    await flush()
    expect(onBehind).not.toHaveBeenCalled()

    time = 61_000
    setVisibility('visible')
    await flush()
    expect(onBehind).toHaveBeenCalledWith('0.1.0+bbbbbbb')

    stop()
    time = 200_000
    setVisibility('visible')
    await flush()
    expect(onBehind).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the check fails', async () => {
    const onBehind = vi.fn()
    const stop = watchPublishedVersion({ current: 'v', onBehind, fetchVersion: async () => null })
    await flush()
    expect(onBehind).not.toHaveBeenCalled()
    stop()
  })
})
