import {
  createTakeover,
  isNewVersionMessage,
  isPageAnswer,
  NEW_VERSION_ACTIVE,
  PAGE_HANDLES_UPDATES,
  type OpenPage,
  type Takeover,
} from './workerTakeover'

type Behaviour = 'answers' | 'silent' | 'cannot be reloaded'

/** A stand-in for an open page: a new-style one answers the worker, an old one stays silent. */
function page(id: string, behaviour: Behaviour, takeover: Takeover): OpenPage & { navigate: ReturnType<typeof vi.fn>; postMessage: ReturnType<typeof vi.fn> } {
  return {
    id,
    url: `https://app.example/${id}`,
    postMessage: vi.fn((message: unknown) => {
      if (behaviour === 'answers' && isNewVersionMessage(message)) takeover.receive(id, { type: PAGE_HANDLES_UPDATES })
    }),
    navigate: vi.fn(() => (behaviour === 'cannot be reloaded' ? Promise.reject(new TypeError('not supported')) : Promise.resolve())),
  }
}

afterEach(() => vi.useRealTimers())

describe('moving open pages onto a new version', () => {
  it('leaves pages that answer alone and reloads the ones that stay silent', async () => {
    vi.useFakeTimers()
    const takeover = createTakeover({ answerWaitMs: 1000 })
    const aware = page('aware', 'answers', takeover)
    const old = page('old', 'silent', takeover)

    const moving = takeover.movePages([aware, old], '0.2.0+abc1234')
    await vi.advanceTimersByTimeAsync(1000)

    expect(await moving).toEqual({ answered: ['aware'], reloaded: ['old'] })
    expect(aware.postMessage).toHaveBeenCalledWith({ type: NEW_VERSION_ACTIVE, version: '0.2.0+abc1234' })
    expect(aware.navigate).not.toHaveBeenCalled()
    expect(old.navigate).toHaveBeenCalledWith('https://app.example/old')
  })

  it('finishes without waiting for the reload, even in a browser that cannot reload a page', async () => {
    vi.useFakeTimers()
    const takeover = createTakeover({ answerWaitMs: 10 })
    const stuck = page('stuck', 'cannot be reloaded', takeover)

    const moving = takeover.movePages([stuck], 'v')
    await vi.advanceTimersByTimeAsync(10)

    await expect(moving).resolves.toEqual({ answered: [], reloaded: ['stuck'] })
    expect(stuck.navigate).toHaveBeenCalledTimes(1)
  })

  it('has nothing to do when no page is open', async () => {
    await expect(createTakeover().movePages([], 'v')).resolves.toEqual({ answered: [], reloaded: [] })
  })

  it('ignores answers from pages it did not ask, and messages that are not answers', () => {
    const takeover = createTakeover()
    expect(() => takeover.receive('nobody', { type: PAGE_HANDLES_UPDATES })).not.toThrow()
    expect(() => takeover.receive(undefined, { type: PAGE_HANDLES_UPDATES })).not.toThrow()
    expect(isPageAnswer({ type: 'SKIP_WAITING' })).toBe(false)
    expect(isPageAnswer(null)).toBe(false)
    expect(isNewVersionMessage('text')).toBe(false)
    expect(isNewVersionMessage({ type: NEW_VERSION_ACTIVE, version: 'v' })).toBe(true)
  })
})
