// Renders the app icons in public/ from the SVG sources, using Chromium's
// headless shell (its viewport matches the window size exactly).
// Run with: npm run icons   (set CHROMIUM=/path/to/chrome if it is not found)
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const candidates = [
  process.env.CHROMIUM,
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)
const chrome = candidates.find((path) => existsSync(path))
if (!chrome) throw new Error('Chromium not found. Set CHROMIUM to the browser path.')

const jobs = [
  ['public/favicon.svg', 'public/icon-192.png', 192],
  ['public/favicon.svg', 'public/icon-512.png', 512],
  ['scripts/icon-maskable.svg', 'public/icon-maskable-512.png', 512],
  ['scripts/icon-maskable.svg', 'public/apple-touch-icon.png', 180],
]

const work = mkdtempSync(join(tmpdir(), 'icons-'))
for (const [src, out, size] of jobs) {
  const svg = readFileSync(src, 'utf8')
  const page = join(work, 'icon.html')
  writeFileSync(
    page,
    `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  )
  execFileSync(chrome, [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--default-background-color=00000000',
    `--window-size=${size},${size}`,
    `--screenshot=${resolve(out)}`,
    `file://${page}`,
  ], { stdio: 'ignore' })
  console.log(`wrote ${out}`)
}
