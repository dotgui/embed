/**
 * @dotgui/embed — render .gui files anywhere in the browser.
 *
 * A thin player over `@dotgui/render`'s `<gui-canvas>`: the Rust renderer,
 * compiled to WebAssembly. One element:
 *
 *   <gui-embed src="x.gui"></gui-embed>            external file
 *   <gui-embed>                                    inline file (parser-safe)
 *     <script type="application/gui"> … </script>
 *   </gui-embed>
 *
 * No chrome by default (a clean standalone render). Add booleans for the widget:
 * `zoom` `download` `copy` `mode-switch` `grid`. Size with CSS.
 *
 * The CDN build (`gui-embed.js`) calls `install()` automatically. When importing
 * as a module, call `install()` (or `defineGuiEmbed()`) yourself.
 */
import '@dotgui/render/canvas'
import { defineGuiEmbed } from './gui-embed'

export { GuiEmbedElement, defineGuiEmbed } from './gui-embed'
export { GuiCanvas, config } from '@dotgui/render/canvas'
export type { ModeAxis, GuiPage, RenderDetail } from '@dotgui/render/canvas'

let installed = false

/** Register the `<gui-embed>` custom element (and `<gui-canvas>`). Idempotent. */
export function install() {
  if (installed || typeof window === 'undefined') return
  installed = true
  defineGuiEmbed()
}
