/**
 * Mode detection — reuse the kit parser so the embed knows exactly which token
 * mode axes (RFC-0037) a file declares. Drives the optional mode switcher: it
 * only renders when an axis has more than one value.
 */
import { parseXml } from '@dotgui/kit/parser'

export interface ModeAxis {
  values: string[]
  default: string
}

/** Declared mode axes for a .guix string, keyed by axis name. Empty when none. */
export function detectModes(xml: string): Record<string, ModeAxis> {
  try {
    const parsed = parseXml(xml)
    return parsed?.modes ?? {}
  } catch {
    return {}
  }
}

/** Axes worth showing a switcher for (more than one value). */
export function switchableAxes(modes: Record<string, ModeAxis>): string[] {
  return Object.keys(modes).filter((axis) => modes[axis].values.length > 1)
}
