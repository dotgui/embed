/**
 * `<gui-embed>` — the host/player around a .gui file.
 *
 * It is NOT the format. The format vocabulary (`w`/`h` = the file's own size)
 * lives on `<gui>`. Everything here is host vocabulary, expressed in CSS:
 *
 *   <gui-embed style="width:100vw;height:100vh" zoom download copy mode-switch>
 *     <script type="application/gui"> <gui w="300" h="300"> … </gui> </script>
 *   </gui-embed>
 *
 *   <gui-embed src="hero.gui" style="width:400px"></gui-embed>
 *
 * The drawing is `@dotgui/render`'s `<gui-canvas>`: the Rust renderer, as
 * WebAssembly, in a worker. This element only places it — center-center,
 * scaled to fit — and adds the player around it. Controls are individual
 * boolean attributes — present = on. `zoom` defaults on (it is a player);
 * `download`, `copy`, `mode-switch` default off.
 */
import type { GuiCanvas, ModeAxis, RenderDetail } from '@dotgui/render/canvas'
import { pack } from '@dotgui/kit/package'

const TAG = 'gui-embed'

/** How far a zoom may go, as a multiple of the fitted scale. */
const MIN_ZOOM = 0.25
const MAX_ZOOM = 8

export class GuiEmbedElement extends HTMLElement {
  private _stage!: HTMLDivElement
  private _view!: HTMLDivElement
  private _canvas!: GuiCanvas
  private _bar!: HTMLDivElement
  private _ro: ResizeObserver | null = null
  /** The bytes shown, kept for download: a fetched file as it came, or inline markup. */
  private _bytes: Uint8Array | null = null
  private _markup = ''
  /** The document's size in document pixels, once drawn. */
  private _size: { width: number; height: number } | null = null
  /** The view: scale, and the document's top-left in the stage. */
  private _scale = 1
  private _x = 0
  private _y = 0
  /** True once the user pans/zooms — stops auto-fit from snapping their view back. */
  private _userZoomed = false
  private _settle: ReturnType<typeof setTimeout> | null = null

  static get observedAttributes() {
    return ['src']
  }

  connectedCallback() {
    if (!this._stage) this._build()
    void this._load()
  }

  disconnectedCallback() {
    this._ro?.disconnect()
    this._ro = null
  }

  attributeChangedCallback(name: string) {
    if (name === 'src' && this._stage) void this._load()
  }

  /** The `<gui-canvas>` drawing the file. */
  get canvas(): GuiCanvas {
    return this._canvas
  }

  // ── DOM scaffold ──────────────────────────────────────────────────────────

  private _build() {
    const cs = getComputedStyle(this)
    if (cs.position === 'static') this.style.position = 'relative'
    if (cs.display === 'inline') this.style.display = 'block'
    this.style.overflow = 'hidden'

    const stage = document.createElement('div')
    stage.className = 'gui-embed-canvas'
    // The dot grid is the STAGE, not the file — it signals "this is rendered in
    // a dotgui surface" and stays behind the file. Toggle with `grid="false"`.
    const dots = this.getAttribute('grid') !== 'false'
    stage.style.cssText = [
      'position:absolute;inset:0;touch-action:none',
      'background-color:var(--gui-embed-bg, #fafaf8)',
      dots
        ? 'background-image:radial-gradient(var(--gui-embed-dot, rgba(0,0,0,.14)) 1px, transparent 1.4px);background-size:var(--gui-embed-dot-gap, 18px) var(--gui-embed-dot-gap, 18px);background-position:center'
        : '',
    ]
      .filter(Boolean)
      .join(';')
    this.appendChild(stage)
    this._stage = stage

    const view = document.createElement('div')
    // max-content: the canvas keeps its document size here, and the view scales it.
    view.style.cssText = 'position:absolute;left:0;top:0;width:max-content;transform-origin:0 0'
    stage.appendChild(view)
    this._view = view

    const canvas = document.createElement('gui-canvas') as GuiCanvas
    canvas.addEventListener('render', (event) => this._rendered((event as CustomEvent<RenderDetail>).detail))
    canvas.addEventListener('error', (event) => this._fail((event as CustomEvent<{ message: string }>).detail.message))
    view.appendChild(canvas)
    this._canvas = canvas

    this._bindZoom()

    // When the container resizes (responsive width, async aspect-ratio), refit —
    // unless the user has taken over the viewport.
    this._ro = new ResizeObserver(() => {
      if (!this._userZoomed) this.fit()
    })
    this._ro.observe(this)

    const bar = document.createElement('div')
    bar.className = 'gui-embed-controls'
    bar.style.cssText = [
      'position:absolute;top:8px;right:8px;z-index:2',
      'display:flex;gap:4px;padding:4px',
      'border-radius:8px;background:rgba(20,20,20,.55)',
      'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)',
      'opacity:0;transition:opacity .15s ease',
    ].join(';')
    this.appendChild(bar)
    this._bar = bar
    this.addEventListener('pointerenter', () => (bar.style.opacity = '1'))
    this.addEventListener('pointerleave', () => (bar.style.opacity = '0'))
  }

  // ── load + render ───────────────────────────────────────────────────────────

  private async _load() {
    this._size = null
    this._userZoomed = false
    this._canvas.mode = {}
    try {
      const src = this.getAttribute('src')
      if (src) {
        const response = await fetch(src)
        if (!response.ok) throw new Error(`gui-embed: failed to fetch "${src}" (${response.status})`)
        this._bytes = new Uint8Array(await response.arrayBuffer())
        this._markup = ''
        await this._canvas.loadBytes(this._bytes)
      } else {
        // Inline content lives in a <script type="application/gui"> child — raw
        // text the HTML parser never mangles (so `<col>`/`<img>` survive).
        const script = this.querySelector(':scope > script[type="application/gui"]')
        if (!script) {
          // The CDN script defines this element before the parser has reached
          // its children: look again once the document is parsed.
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => void this._load(), { once: true })
          }
          return
        }
        this._bytes = null
        this._markup = script.textContent ?? ''
        await this._canvas.loadMarkup(this._markup)
      }
      this._buildControls()
    } catch (err) {
      this._fail(String((err as Error)?.message ?? err))
    }
  }

  private _fail(message: string) {
    let note = this.querySelector(':scope > .gui-embed-error') as HTMLDivElement | null
    if (!note) {
      note = document.createElement('div')
      note.className = 'gui-embed-error'
      note.style.cssText =
        'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:13px system-ui;color:#c00;padding:12px;text-align:center'
      this.appendChild(note)
    }
    note.textContent = message
  }

  /** A frame arrived: size the host on the first, and keep the view fitted. */
  private _rendered(detail: RenderDetail) {
    this.querySelector(':scope > .gui-embed-error')?.remove()
    const first = !this._size || this._size.width !== detail.width || this._size.height !== detail.height
    this._size = { width: detail.width, height: detail.height }
    if (!first) return
    if (!this._hasHeight()) {
      if (this.style.width) {
        // Author fixed a width → derive height from the file's ratio.
        this.style.aspectRatio = `${detail.width} / ${detail.height}`
      } else {
        // No CSS size at all → size to the file's native dimensions, like an SVG.
        this.style.width = `${detail.width}px`
        this.style.height = `${detail.height}px`
      }
    }
    if (!this._userZoomed) this.fit()
  }

  /** Whether the host already has a usable height (fixed by CSS or aspect-ratio). */
  private _hasHeight(): boolean {
    if (this.style.height || this.style.aspectRatio) return true
    const cs = getComputedStyle(this)
    if (cs.aspectRatio && cs.aspectRatio !== 'auto') return true
    return this.clientHeight > 1
  }

  // ── pan + zoom ──────────────────────────────────────────────────────────────

  /** Places the document center-center, scaled to fit, and hands the view back to auto-fit. */
  fit() {
    if (!this._size) return
    const { width, height } = this._size
    const box = this._stage.getBoundingClientRect()
    if (box.width < 1 || box.height < 1) return
    this._scale = Math.min(box.width / width, box.height / height)
    this._x = (box.width - width * this._scale) / 2
    this._y = (box.height - height * this._scale) / 2
    this._userZoomed = false
    this._apply()
  }

  /** Zooms by `factor` about a point in the stage (its center by default). */
  zoomBy(factor: number, anchorX?: number, anchorY?: number) {
    if (!this._size) return
    const box = this._stage.getBoundingClientRect()
    const fitted = Math.min(box.width / this._size.width, box.height / this._size.height)
    const next = Math.min(Math.max(this._scale * factor, fitted * MIN_ZOOM), fitted * MAX_ZOOM)
    const ax = anchorX ?? box.width / 2
    const ay = anchorY ?? box.height / 2
    this._x = ax - ((ax - this._x) * next) / this._scale
    this._y = ay - ((ay - this._y) * next) / this._scale
    this._scale = next
    this._userZoomed = true
    this._apply()
  }

  private _apply() {
    this._view.style.transform = `translate(${this._x}px, ${this._y}px) scale(${this._scale})`
    // Draw sharp at the zoom the view settles on, not at every wheel tick.
    if (this._settle) clearTimeout(this._settle)
    this._settle = setTimeout(() => {
      const density = Math.min(Math.max(2, Math.ceil((window.devicePixelRatio || 1) * this._scale)), 4)
      if (Number(this._canvas.getAttribute('density')) !== density) this._canvas.setAttribute('density', String(density))
    }, 150)
  }

  private _bindZoom() {
    const stage = this._stage
    const enabled = () => this.getAttribute('zoom') !== 'false'
    stage.addEventListener(
      'wheel',
      (event) => {
        // Pinch on a trackpad and ctrl/⌘ + wheel zoom; a plain wheel scrolls the page.
        if (!enabled() || !(event.ctrlKey || event.metaKey)) return
        event.preventDefault()
        const box = stage.getBoundingClientRect()
        this.zoomBy(Math.exp(-event.deltaY * 0.01), event.clientX - box.left, event.clientY - box.top)
      },
      { passive: false },
    )
    let drag: { id: number; x: number; y: number } | null = null
    stage.addEventListener('pointerdown', (event) => {
      if (!enabled() || event.button !== 0) return
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY }
      stage.setPointerCapture(event.pointerId)
    })
    stage.addEventListener('pointermove', (event) => {
      if (!drag || drag.id !== event.pointerId) return
      this._x += event.clientX - drag.x
      this._y += event.clientY - drag.y
      drag.x = event.clientX
      drag.y = event.clientY
      this._userZoomed = true
      this._view.style.transform = `translate(${this._x}px, ${this._y}px) scale(${this._scale})`
    })
    const end = () => (drag = null)
    stage.addEventListener('pointerup', end)
    stage.addEventListener('pointercancel', end)
    stage.addEventListener('dblclick', () => enabled() && this.fit())
  }

  // ── controls ────────────────────────────────────────────────────────────────

  private _buildControls() {
    const bar = this._bar
    bar.innerHTML = ''

    if (this.getAttribute('zoom') !== 'false') {
      bar.appendChild(this._btn('Fit', 'Reset zoom', () => this.fit()))
    }

    const modes = this._canvas.modes
    const axes = Object.keys(modes).filter((axis) => modes[axis].values.length > 1)
    if (this.hasAttribute('mode-switch') && axes.length) {
      for (const axis of axes) bar.appendChild(this._modeSelect(axis, modes[axis]))
    }

    if (this.hasAttribute('copy')) {
      bar.appendChild(
        this._btn('Copy', 'Copy .gui markup', async () => {
          await navigator.clipboard.writeText(this._canvas.source)
        }),
      )
    }

    if (this.hasAttribute('download')) {
      bar.appendChild(this._btn('Download', 'Download .gui file', () => this._download()))
    }

    bar.style.display = bar.children.length ? 'flex' : 'none'
  }

  private _btn(label: string, title: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = label
    b.title = title
    b.style.cssText = ['all:unset;cursor:pointer;font:600 12px/1 system-ui', 'color:#fff;padding:6px 9px;border-radius:5px'].join(';')
    b.addEventListener('pointerenter', () => (b.style.background = 'rgba(255,255,255,.18)'))
    b.addEventListener('pointerleave', () => (b.style.background = 'transparent'))
    b.addEventListener('click', onClick)
    return b
  }

  private _modeSelect(axis: string, mode: ModeAxis): HTMLSelectElement {
    const sel = document.createElement('select')
    sel.title = `Mode: ${axis}`
    sel.style.cssText = ['all:unset;cursor:pointer;font:600 12px/1 system-ui', 'color:#fff;padding:6px 9px;border-radius:5px'].join(';')
    const current = this._canvas.mode[axis] ?? mode.default
    for (const value of mode.values) {
      const opt = document.createElement('option')
      opt.value = value
      opt.textContent = value
      opt.style.color = '#000'
      if (value === current) opt.selected = true
      sel.appendChild(opt)
    }
    // The renderer switches via tokens; the markup is unchanged.
    sel.addEventListener('change', () => this._canvas.setMode(axis, sel.value))
    return sel
  }

  private _download() {
    const bytes = this._bytes ?? pack({ xml: this._markup, assets: {} })
    const name = (this.getAttribute('src')?.split('/').pop() || 'design.gui').replace(/\.guix$/, '.gui')
    const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/octet-stream' }))
    const a = document.createElement('a')
    a.href = url
    a.download = name.endsWith('.gui') ? name : name + '.gui'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

export function defineGuiEmbed() {
  if (typeof customElements !== 'undefined' && !customElements.get(TAG)) {
    customElements.define(TAG, GuiEmbedElement)
  }
}
