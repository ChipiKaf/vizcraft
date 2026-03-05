/**
 * Named stroke-dasharray preset mappings.
 *
 * | Preset      | SVG value      |
 * |-------------|----------------|
 * | `'solid'`   | (none)         |
 * | `'dashed'`  | `8, 4`         |
 * | `'dotted'`  | `2, 4`         |
 * | `'dash-dot'`| `8, 4, 2, 4`  |
 */
const DASH_PRESETS: Record<string, string> = {
  solid: '',
  dashed: '8, 4',
  dotted: '2, 4',
  'dash-dot': '8, 4, 2, 4',
};

/**
 * Resolve a `strokeDasharray` value to an SVG-ready `stroke-dasharray` string.
 *
 * Accepts preset names (`'dashed'`, `'dotted'`, `'dash-dot'`, `'solid'`)
 * or any freeform SVG dasharray string (e.g. `'12, 3, 3, 3'`).
 * Returns an empty string for `'solid'` / `undefined`.
 */
export function resolveDasharray(value: string | undefined): string {
  if (!value || value === 'solid') return '';
  return DASH_PRESETS[value] ?? value;
}
