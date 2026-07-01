# @dotgui/embed

Render `.gui` files anywhere in the browser. A thin layer over [`@dotgui/kit`](../kit)'s
renderer — one CDN script, **zero dependencies** for the consumer.

```html
<script src="https://unpkg.com/@dotgui/embed"></script>
```

One element does everything: **`<gui-embed>`**. It's the explicit "render a gui here"
declaration. The file comes from an inner `<script type="application/gui">` (inline)
or a `src` (external). No chrome by default; add booleans for the widget.

## Render a file

```html
<!-- inline content — parser-safe carrier -->
<gui-embed>
  <script type="application/gui">
    <gui> … </gui>
  </script>
</gui-embed>

<!-- external file -->
<gui-embed src="hero.gui"></gui-embed>
```

Inline content lives in a `<script type="application/gui">` because script content is
raw text the HTML parser never touches — so a full `.gui` survives verbatim, including
tags that collide with HTML void elements (`<col>`, `<img>`). The script is also the
source of truth: edit it, re-render; copy/download emits it unchanged.

`src` is fetched, unzipped, assets resolved to `blob:` URLs, and rendered — never shown
raw.

## Standalone vs widget — same tag, just attributes

```html
<!-- standalone preview: no chrome, sizes to the file's native size -->
<gui-embed> <script type="application/gui">…</script> </gui-embed>

<!-- widget: fixed canvas, controls, dot grid -->
<gui-embed src="hero.gui" style="width:360px;height:460px"
           zoom download copy mode-switch grid></gui-embed>
```

**Sizing (CSS):**
- No CSS → sizes to the file's native dimensions, like an inline SVG.
- Width only → height follows the file's aspect ratio.
- Width + height → fixed canvas; the file is placed center-center, scaled to fit.

**Controls (individual booleans — present = on):**

| attr | default | effect |
|---|---|---|
| `zoom` | on | scroll/pinch-zoom + drag-pan, and a "Fit" reset button |
| `grid` | on | dot-grid canvas background (the dotgui surface) |
| `download` | off | download the `.gui` file |
| `copy` | off | copy the `.guix` markup to the clipboard |
| `mode-switch` | off | mode dropdown — only when the file declares >1 mode |

Default render mode comes from the file (RFC-0037 `<modes>`). Theme the grid with
`--gui-embed-bg`, `--gui-embed-dot`, `--gui-embed-dot-gap`.

## Programmatic use

The CDN build self-installs. As a module:

```js
import { install } from '@dotgui/embed'
install() // registers <gui-embed>
```

## Build

```sh
bun run build       # → dist/gui-embed.js (IIFE, CDN) + dist/gui-embed.esm.js
bun run typecheck
```

Everything (`@dotgui/kit` render + parser + package, panzoom, fflate) is bundled into
one self-contained file. Demo: `embed/demo/index.html`.
