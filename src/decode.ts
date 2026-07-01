/**
 * Decode .gui / .guix bytes into renderable input.
 *
 * The kit owns unzip + .guix/assets discovery (`unpack`); here we only turn the
 * decoded asset bytes into browser `blob:` URLs the renderer can resolve. This
 * mirrors the playground / gui-app decode path so rendering behaves identically.
 */
import { unpack, pack, type GuiPackage } from '@dotgui/kit/package'

export interface Decoded {
  /** The .guix markup (XML, `<gui>` root). */
  xml: string
  /** assetMap keyed by package path, e.g. "assets/hero.webp" -> blob: URL. */
  assetMap: Record<string, string>
  /** The in-memory package (used for download). */
  pkg: GuiPackage
}

function mimeForExt(ext: string): string {
  if (ext === 'svg') return 'image/svg+xml'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  return `image/${ext}`
}

/** Decode raw .gui (ZIP) or .guix (XML) bytes into xml + a blob: asset map. */
export function decodeBytes(bytes: Uint8Array): Decoded {
  const pkg = unpack(bytes)
  const assetMap: Record<string, string> = {}
  for (const [name, fileBytes] of Object.entries(pkg.assets)) {
    const ext = name.split('.').pop() || 'png'
    const blob = new Blob([fileBytes as unknown as BlobPart], { type: mimeForExt(ext) })
    assetMap[name] = URL.createObjectURL(blob)
  }
  return { xml: pkg.xml, assetMap, pkg }
}

/** Build a Decoded from inline .guix markup (no assets). */
export function decodeMarkup(xml: string): Decoded {
  return { xml, assetMap: {}, pkg: { xml, assets: {} } }
}

/** Fetch a .gui / .guix from a URL and decode it. */
export async function fetchGui(src: string): Promise<Decoded> {
  const res = await fetch(src)
  if (!res.ok) throw new Error(`gui-embed: failed to fetch "${src}" (${res.status})`)
  const buf = new Uint8Array(await res.arrayBuffer())
  return decodeBytes(buf)
}

/** Re-pack a decoded package into .gui (ZIP) bytes for download. */
export function toGuiBytes(pkg: GuiPackage): Uint8Array {
  return pack(pkg)
}

/** Release any blob: URLs created for an asset map. */
export function revokeAssets(assetMap: Record<string, string>) {
  for (const url of Object.values(assetMap)) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url)
  }
}
