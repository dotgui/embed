/**
 * CDN entry — side-effecting. Loading this script auto-registers everything:
 *
 *   <script src="https://cdn.dotgui.com/gui-embed.js"></script>
 *
 * After this, any `<gui>` or `<gui-embed>` on the page renders with no further
 * code. This is the zero-friction path (e.g. an AI emitting a renderable .gui).
 */
import * as embed from './index'

embed.install()

// Expose the API on a global for non-module pages (and the prototype demo).
;(globalThis as unknown as { GuiEmbed?: typeof embed }).GuiEmbed = embed
