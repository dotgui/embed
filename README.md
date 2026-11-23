# @dotgui/embed

Render `.gui` files anywhere in the browser. A thin player over
[`@dotgui/render`](https://www.npmjs.com/package/@dotgui/render)'s `<gui-canvas>` — the
Rust renderer, compiled to WebAssembly — one CDN script, **zero dependencies** for the
consumer.

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

`src` is fetched and drawn by the renderer, package assets and all — never shown raw.
Google fonts and remote images load directly; system fonts a page cannot see fall back
to the bundled Inter.

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
| `zoom` | on | pinch or ⌘/ctrl + wheel to zoom, drag to pan, double-click or "Fit" to reset |
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
install() // registers <gui-embed> (and <gui-canvas>)
```

`el.canvas` is the `<gui-canvas>` inside: `modes`, `mode`, `source`, `nodeAt`, `bounds`
and the `render` / `error` events.

## Accessible by default

The pixels are a canvas, but the element keeps a transparent layer of the document's
text, image `alt`s and `role=`s (as ARIA) over it — screen readers, find-in-page and
search engines read what it shows.

## Build

```sh
bun run build       # → dist/gui-embed.js (IIFE, CDN) + dist/gui-embed.esm.js
bun run typecheck
```

`dist/gui-embed.js` is the player (~30 KB); the renderer's worker, WebAssembly (~1.6 MB
gzipped) and fonts sit beside it in `dist/` and load on first use, off the main thread.
The worker can be on another origin, so any CDN works. Demo: `embed/demo/index.html`.
