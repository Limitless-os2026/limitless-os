import { describeVersion } from './version'

describe('describing the version', () => {
  it('reads as plain words, with the build and the date', () => {
    expect(describeVersion('0.1.0+a1b2c3d', '2026-10-07T12:00:00Z', 'en-US')).toBe('Version 0.1.0 (a1b2c3d), built Oct 7, 2026')
  })

  it('leaves out what it does not know', () => {
    expect(describeVersion('dev', '', 'en-US')).toBe('Version dev')
    expect(describeVersion('0.1.0+local', 'not a date', 'en-US')).toBe('Version 0.1.0 (local)')
  })
})
