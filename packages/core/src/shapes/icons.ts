export class CoreIconRegistry {
  private icons = new Map<string, string>();

  /**
   * Register an icon by id.
   *
   * The `svg` string should be a full `<svg>...</svg>` snippet.
   * For themeable color, prefer using `fill="currentColor"` / `stroke="currentColor"`.
   */
  register(id: string, svg: string) {
    this.icons.set(id, svg);
    return this;
  }

  get(id: string) {
    return this.icons.get(id);
  }
}

// Minimal built-in icons (simple geometry, `currentColor`-friendly).
const ICON_DATABASE =
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<ellipse cx="12" cy="6" rx="7" ry="3" />' +
  '<path d="M5 6v12c0 1.66 3.13 3 7 3s7-1.34 7-3V6" />' +
  '<path d="M5 12c0 1.66 3.13 3 7 3s7-1.34 7-3" />' +
  '<path d="M5 18c0 1.66 3.13 3 7 3s7-1.34 7-3" />' +
  '</svg>';

const ICON_SERVER =
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="5" y="4" width="14" height="6" rx="1" />' +
  '<rect x="5" y="14" width="14" height="6" rx="1" />' +
  '<path d="M8 7h0" />' +
  '<path d="M8 17h0" />' +
  '</svg>';

const ICON_CLOUD =
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M7.5 18h10.2a3.8 3.8 0 0 0 .7-7.54A5.8 5.8 0 0 0 7.28 8.2 4.6 4.6 0 0 0 7.5 18Z" />' +
  '</svg>';

const ICON_PERSON =
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<circle cx="12" cy="8" r="3" />' +
  '<path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />' +
  '</svg>';

export const defaultCoreIconRegistry = new CoreIconRegistry()
  .register('database', ICON_DATABASE)
  .register('server', ICON_SERVER)
  .register('cloud', ICON_CLOUD)
  .register('person', ICON_PERSON);

/**
 * Register an icon into the default core icon registry.
 *
 * This is the simplest way to make `.icon('name', ...)` work.
 */
export function registerIcon(id: string, svg: string) {
  defaultCoreIconRegistry.register(id, svg);
}
