/**
 * @dotgui/embed — render .gui files anywhere in the browser.
 *
 * A thin layer over @dotgui/kit's renderer. One element:
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
export { GuiEmbedElement, defineGuiEmbed } from './gui-embed'
export { fetchGui, decodeBytes, decodeMarkup, type Decoded } from './decode'
export { detectModes, switchableAxes, type ModeAxis } from './modes'

import { defineGuiEmbed } from './gui-embed'

let installed = false

/** Register the `<gui-embed>` custom element. Idempotent. */
export function install() {
  if (installed || typeof window === 'undefined') return
  installed = true
  defineGuiEmbed()
}
