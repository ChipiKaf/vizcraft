/** Default values for the drop-shadow filter. */
export const SHADOW_DEFAULTS = {
  dx: 2,
  dy: 2,
  blur: 4,
  color: 'rgba(0,0,0,0.2)',
} as const;

/** Apply defaults to a partial shadow config. */
export function resolveShadow(shadow: {
  dx?: number;
  dy?: number;
  blur?: number;
  color?: string;
}): { dx: number; dy: number; blur: number; color: string } {
  return {
    dx: shadow.dx ?? SHADOW_DEFAULTS.dx,
    dy: shadow.dy ?? SHADOW_DEFAULTS.dy,
    blur: shadow.blur ?? SHADOW_DEFAULTS.blur,
    color: shadow.color ?? SHADOW_DEFAULTS.color,
  };
}

/** Deterministic filter id keyed by config tuple for dedup. */
export function shadowFilterId(cfg: {
  dx: number;
  dy: number;
  blur: number;
  color: string;
}): string {
  const colorSuffix = cfg.color.replace(/[^a-zA-Z0-9]/g, '_');
  return `viz-shadow-${cfg.dx}-${cfg.dy}-${cfg.blur}-${colorSuffix}`;
}

/** Escape a string for safe use inside an XML/SVG attribute value (e.g., color values). */
function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** SVG markup for a drop-shadow `<filter>`. */
export function shadowFilterSvg(
  id: string,
  cfg: { dx: number; dy: number; blur: number; color: string }
): string {
  return `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="${cfg.dx}" dy="${cfg.dy}" stdDeviation="${cfg.blur}" flood-color="${escapeXmlAttr(cfg.color)}" flood-opacity="1"/></filter>`;
}
