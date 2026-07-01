/**
 * `<gui-embed>` — the host/player around a .gui file.
 *
 * It is NOT the format. The format vocabulary (`w`/`h` = the file's own size)
 * lives on `<gui>`. Everything here is host vocabulary, expressed in CSS:
 *
 *   <gui-embed style="width:100vw;height:100vh" zoom download copy mode-switch>
 *     <gui w="300" h="300"> … </gui>
 *   </gui-embed>
 *
 *   <gui-embed src="hero.gui" style="width:400px;aspect-ratio:auto"></gui-embed>
 *
 * The file is placed center-center, scaled to fit the canvas. Controls are
 * individual boolean attributes — present = on. `zoom` defaults on (it is a
 * player); `download`, `copy`, `mode-switch` default off.
 */
import { render, type ZoomControl } from '@dotgui/kit/render'
import {
  fetchGui,
  decodeMarkup,
  revokeAssets,
  toGuiBytes,
  type Decoded,
} from './decode'
import { detectModes, switchableAxes, type ModeAxis } from './modes'

const TAG = 'gui-embed'

export class GuiEmbedElement extends HTMLElement {
  private _canvas!: HTMLDivElement
  private _bar!: HTMLDivElement
  private _zoomCtl: ZoomControl | null = null
  private _decoded: Decoded | null = null
  private _modes: Record<string, ModeAxis> = {}
  private _mode: Record<string, string> = {}
  private _ro: ResizeObserver | null = null
  /** True once the user pans/zooms — stops auto-fit from snapping their view back. */
  private _userZoomed = false

  static get observedAttributes() {
    return ['src']
  }

  connectedCallback() {
    if (!this._canvas) this._build()
    void this._load()
  }

  disconnectedCallback() {
    this._ro?.disconnect()
    this._ro = null
    if (this._decoded) revokeAssets(this._decoded.assetMap)
    this._decoded = null
  }

  attributeChangedCallback(name: string) {
    if (name === 'src' && this._canvas) void this._load()
  }

  // ── DOM scaffold ──────────────────────────────────────────────────────────

  private _build() {
    const cs = getComputedStyle(this)
    if (cs.position === 'static') this.style.position = 'relative'
    if (cs.display === 'inline') this.style.display = 'block'
    this.style.overflow = 'hidden'

    const canvas = document.createElement('div')
    canvas.className = 'gui-embed-canvas'
    // The dot grid is the CANVAS, not the file — it signals "this is rendered in
    // a dotgui surface" and stays behind the file. Toggle with `grid="false"`.
    const dots = this.getAttribute('grid') !== 'false'
    canvas.style.cssText = [
      'position:absolute;inset:0',
      'background-color:var(--gui-embed-bg, #fafaf8)',
      dots
        ? 'background-image:radial-gradient(var(--gui-embed-dot, rgba(0,0,0,.14)) 1px, transparent 1.4px);background-size:var(--gui-embed-dot-gap, 18px) var(--gui-embed-dot-gap, 18px);background-position:center'
        : '',
    ]
      .filter(Boolean)
      .join(';')
    this.appendChild(canvas)
    this._canvas = canvas

    // A pan/zoom canvas fits its content to the container size. When the
    // container resizes (responsive width, async aspect-ratio, font reflow),
    // refit — unless the user has taken over the viewport.
    const markUser = () => (this._userZoomed = true)
    canvas.addEventListener('wheel', markUser, { passive: true })
    canvas.addEventListener('pointerdown', markUser)
    this._ro = new ResizeObserver(() => {
      if (!this._userZoomed) this._zoomCtl?.(1)
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
    try {
      let decoded: Decoded
      const src = this.getAttribute('src')
      if (src) {
        decoded = await fetchGui(src)
      } else {
        // Inline content lives in a <script type="application/gui"> child — raw
        // text the HTML parser never mangles (so `<col>`/`<img>` survive).
        const script = this.querySelector(':scope > script[type="application/gui"]')
        if (!script) return
        decoded = decodeMarkup(script.textContent ?? '')
      }

      if (this._decoded) revokeAssets(this._decoded.assetMap)
      this._decoded = decoded
      this._userZoomed = false

      this._modes = detectModes(decoded.xml)
      this._mode = {}
      for (const [axis, ax] of Object.entries(this._modes)) this._mode[axis] = ax.default

      this._render()
      this._buildControls()
    } catch (err) {
      this._canvas.textContent = String((err as Error)?.message ?? err)
      this._canvas.style.cssText +=
        ';display:flex;align-items:center;justify-content:center;font:13px system-ui;color:#c00;padding:12px;text-align:center'
    }
  }

  private _render() {
    if (!this._decoded) return
    const { xml, assetMap } = this._decoded
    const interactive = this.getAttribute('zoom') !== 'false' // default on

    // The pan/zoom canvas fits content to the container, so it MUST render into a
    // sized box — fitting against a zero-height container produces a broken
    // transform that a later refit can't recover. When the author only fixed a
    // width, do a cheap native-size pass first to learn the ratio, set the
    // aspect-ratio (giving the canvas a real height), then render the zoom canvas.
    if (!this._hasHeight()) {
      render(xml, this._canvas, assetMap, { mode: this._mode }) // native size, no zoom
      const screen = this._canvas.querySelector('.gui-relative') as HTMLElement | null
      const w = screen?.offsetWidth ?? 0
      const h = screen?.offsetHeight ?? 0
      if (w > 0 && h > 0) {
        if (this.style.width) {
          // Author fixed a width → derive height from the file's ratio.
          this.style.aspectRatio = `${w} / ${h}`
        } else {
          // No CSS size at all → size to the file's native dimensions, like an SVG.
          this.style.width = `${w}px`
          this.style.height = `${h}px`
        }
      }
      requestAnimationFrame(() => {
        this._zoomCtl = render(xml, this._canvas, assetMap, { zoom: interactive, mode: this._mode })
      })
      return
    }

    this._zoomCtl = render(xml, this._canvas, assetMap, { zoom: interactive, mode: this._mode })
  }

  /** Whether the canvas already has a usable height (fixed by CSS or aspect-ratio). */
  private _hasHeight(): boolean {
    if (this.style.height || this.style.aspectRatio) return true
    const h = getComputedStyle(this).height
    return !!h && h !== 'auto' && parseFloat(h) > 1
  }

  // ── controls ────────────────────────────────────────────────────────────────

  private _buildControls() {
    const bar = this._bar
    bar.innerHTML = ''

    if (this.getAttribute('zoom') !== 'false') {
      bar.appendChild(this._btn('Fit', 'Reset zoom', () => this._zoomCtl?.(1)))
    }

    const axes = switchableAxes(this._modes)
    if (this.hasAttribute('mode-switch') && axes.length) {
      for (const axis of axes) bar.appendChild(this._modeSelect(axis))
    }

    if (this.hasAttribute('copy')) {
      bar.appendChild(
        this._btn('Copy', 'Copy .gui markup', async () => {
          if (this._decoded) await navigator.clipboard.writeText(this._decoded.xml)
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
    b.style.cssText = [
      'all:unset;cursor:pointer;font:600 12px/1 system-ui',
      'color:#fff;padding:6px 9px;border-radius:5px',
    ].join(';')
    b.addEventListener('pointerenter', () => (b.style.background = 'rgba(255,255,255,.18)'))
    b.addEventListener('pointerleave', () => (b.style.background = 'transparent'))
    b.addEventListener('click', onClick)
    return b
  }

  private _modeSelect(axis: string): HTMLSelectElement {
    const sel = document.createElement('select')
    sel.title = `Mode: ${axis}`
    sel.style.cssText = [
      'all:unset;cursor:pointer;font:600 12px/1 system-ui',
      'color:#fff;padding:6px 9px;border-radius:5px',
    ].join(';')
    for (const value of this._modes[axis].values) {
      const opt = document.createElement('option')
      opt.value = value
      opt.textContent = value
      opt.style.color = '#000'
      if (value === this._mode[axis]) opt.selected = true
      sel.appendChild(opt)
    }
    sel.addEventListener('change', () => {
      this._mode[axis] = sel.value
      this._render() // re-render the active mode; renderer switches via tokens
    })
    return sel
  }

  private _download() {
    if (!this._decoded) return
    const bytes = toGuiBytes(this._decoded.pkg)
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
