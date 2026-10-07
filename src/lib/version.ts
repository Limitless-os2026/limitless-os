// Which build this copy of the app is. The build stamps it in (vite.config.ts)
// and publishes the same stamp as version.json, so a copy can tell whether a
// newer version is out (publishedVersion.ts).

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'
export const BUILT_AT: string = typeof __BUILT_AT__ === 'string' ? __BUILT_AT__ : ''

/**
 * The version in plain words for the foot of the sidebar and the sign-in
 * screen: "Version 0.1.0 (a1b2c3d), built Oct 7, 2026".
 */
export function describeVersion(version: string = APP_VERSION, builtAt: string = BUILT_AT, locale?: string): string {
  const [number = version, build] = version.split('+')
  let text = `Version ${number}`
  if (build) text += ` (${build})`
  const date = builtAt ? new Date(builtAt) : null
  if (date && !Number.isNaN(date.getTime())) {
    text += `, built ${date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })}`
  }
  return text
}
