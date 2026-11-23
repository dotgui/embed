/**
 * Builds the two ways embed ships.
 *
 *   dist/gui-embed.js       IIFE for a <script> tag — everything bundled, and the
 *                           renderer's worker, WebAssembly and fonts copied beside it
 *   dist/gui-embed.esm.js   ES module for bundlers; @dotgui/render and @dotgui/kit
 *                           stay imports, so the bundler places the worker
 */
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'

const HERE = import.meta.dir
const DIST = path.join(HERE, 'dist')
const RENDER = path.dirname(Bun.resolveSync('@dotgui/render/canvas', HERE))
const { version } = await Bun.file(path.join(HERE, 'package.json')).json()

rmSync(DIST, { recursive: true, force: true })
mkdirSync(DIST)

const cdn = await Bun.build({
  entrypoints: [path.join(HERE, 'src/auto.ts')],
  outdir: DIST,
  naming: 'gui-embed.js',
  format: 'iife',
  minify: true,
  // A classic script cannot parse `import.meta`. The canvas only reads it when
  // no worker URL is configured, and auto.ts always configures one.
  define: { __EMBED_VERSION__: JSON.stringify(version), 'import.meta.url': 'document.baseURI' },
})
const esm = await Bun.build({
  entrypoints: [path.join(HERE, 'src/index.ts')],
  outdir: DIST,
  naming: 'gui-embed.esm.js',
  format: 'esm',
  minify: true,
  external: ['@dotgui/render', '@dotgui/render/*', '@dotgui/kit', '@dotgui/kit/*'],
})
for (const result of [cdn, esm]) {
  if (!result.success) {
    for (const log of result.logs) console.error(log)
    process.exit(1)
  }
}

for (const file of ['render-worker.js', 'pkg/dotgui_renderer_wasm.js', 'pkg/dotgui_renderer_wasm_bg.wasm', 'fonts/Inter.woff2', 'fonts/OFL.txt']) {
  cpSync(path.join(RENDER, file), path.join(DIST, file), { recursive: true })
}
console.log(`built @dotgui/embed ${version} with @dotgui/render from ${RENDER}`)
