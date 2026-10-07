/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Which build this is, so a copy of the app can tell whether a newer one has
// been published. The same stamp goes into the app (__APP_VERSION__), into the
// service worker, and into version.json next to the built files.
interface BuildStamp {
  /** The package version plus the short commit id, such as 0.1.0+a1b2c3d. */
  version: string
  /** When the build was made. */
  builtAt: string
}

function buildStamp(): BuildStamp {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
  return { version: `${pkg.version}+${commitId()}`, builtAt: new Date().toISOString() }
}

/**
 * The commit being built: from Cloudflare's or GitHub's build variables,
 * otherwise from git. LIMITLESS_BUILD_ID overrides it, for trying two
 * builds of the same code against each other.
 */
function commitId(): string {
  const fromHost =
    process.env.LIMITLESS_BUILD_ID || process.env.CF_PAGES_COMMIT_SHA || process.env.WORKERS_CI_COMMIT_SHA || process.env.GITHUB_SHA
  if (fromHost) return fromHost.slice(0, 7)
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'local'
  } catch {
    return 'local'
  }
}

/** Publishes the stamp as version.json, and answers for it while developing. */
function versionFile(stamp: BuildStamp): Plugin {
  const body = JSON.stringify(stamp)
  return {
    name: 'limitless-version-file',
    configureServer(server) {
      server.middlewares.use('/version.json', (_request, response) => {
        response.setHeader('Content-Type', 'application/json')
        response.setHeader('Cache-Control', 'no-store')
        response.end(body)
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: body })
    },
  }
}

const stamp = buildStamp()

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(stamp.version),
    __BUILT_AT__: JSON.stringify(stamp.builtAt),
  },
  plugins: [
    react(),
    versionFile(stamp),
    VitePWA({
      // The service worker is our own file, src/sw.ts. It takes over from any
      // older worker as soon as it is installed; see the notes in that file.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Limitless OS',
        short_name: 'Limitless OS',
        description: 'Jobs, customers and field work for Limitless Roofing & Restoration.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#F2F4EF',
        theme_color: '#183313',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        // Save the app shell, scripts, styles and bundled fonts so the
        // installed app opens with no signal. version.json and _headers are
        // left out on purpose: they must always come from the server.
        globPatterns: ['**/*.{html,js,css,woff2,svg,png,webmanifest}'],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    css: false,
  },
})
