/**
 * CDN entry — side-effecting. Loading this script auto-registers everything:
 *
 *   <script src="https://unpkg.com/@dotgui/embed"></script>
 *
 * After this, any `<gui-embed>` on the page renders with no further code. This
 * is the zero-friction path (e.g. an AI emitting a renderable .gui).
 *
 * The renderer runs in a worker beside this script: `render-worker.js`, with
 * its WebAssembly and fonts, ship in `dist/` next to `gui-embed.js`.
 */
import * as embed from './index'

declare const __EMBED_VERSION__: string

/**
 * The worker's URL, from where this script was loaded. A CDN's bare package
 * URL (`unpkg.com/@dotgui/embed`) names no file to resolve against, so it is
 * pinned to this build's version and its `dist/`.
 */
function workerUrl(): string | null {
  const script = document.currentScript as HTMLScriptElement | null
  if (!script?.src) return null
  const url = new URL(script.src)
  if (!/\.m?js$/.test(url.pathname)) {
    const path = url.pathname.replace(/\/$/, '')
    const versioned = (path.split('/').pop() ?? '').includes('@')
    url.pathname = `${path}${versioned ? '' : `@${__EMBED_VERSION__}`}/dist/gui-embed.js`
  }
  return new URL('./render-worker.js', url).href
}

embed.config.workerUrl = workerUrl()
embed.install()

// Expose the API on a global for non-module pages (and the demo).
;(globalThis as unknown as { GuiEmbed?: typeof embed }).GuiEmbed = embed
