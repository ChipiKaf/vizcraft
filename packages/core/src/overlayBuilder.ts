import type { OverlayId, OverlayParams, VizOverlaySpec } from './types';
import type {
  CircleOverlayParams,
  RectOverlayParams,
  TextOverlayParams,
} from './overlays';

export type OverlayAddOptions = {
  /** Optional stable key used to uniquely identify an overlay instance. */
  key?: string;
  /** Optional class applied by the overlay renderer. */
  className?: string;
};

/**
 * Fluent overlay authoring.
 *
 * - Produces portable `VizOverlaySpec[]` data (rendering remains registry-driven).
 * - Typed by `OverlayKindRegistry` when available, with a back-compat escape hatch.
 */
export class OverlayBuilder {
  private readonly specs: VizOverlaySpec[] = [];
  private readonly keyCounters = new Map<string, number>();

  /**
   * Add an overlay spec.
   *
   * Overload 1: typed overlay ids via `OverlayKindRegistry`.
   */
  add<K extends OverlayId>(
    id: K,
    params: OverlayParams<K>,
    options?: OverlayAddOptions
  ): this;
  /**
   * Add an overlay spec.
   *
   * Overload 2: back-compat escape hatch for arbitrary ids.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  add(id: string, params: any, options?: OverlayAddOptions): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  add(id: string, params: any, options?: OverlayAddOptions): this {
    const className = options?.className;

    // If a user adds multiple overlays of the same id without keys, they will
    // collide at reconcile time (since the DOM layer uses `key || id`).
    // We auto-generate a stable-ish key in that case.
    let key = options?.key;
    if (!key) {
      const hasUnkeyedSameId = this.specs.some(
        (s) => s.id === id && (s.key === undefined || s.key === '')
      );
      if (hasUnkeyedSameId) {
        const next = (this.keyCounters.get(id) ?? 0) + 1;
        this.keyCounters.set(id, next);
        key = `${id}#${next}`;
      }
    }

    this.specs.push({ id, params, key, className });
    return this;
  }

  /** Remove overlays by key, or (if unkeyed) by id. */
  remove(keyOrId: string): this {
    for (let i = this.specs.length - 1; i >= 0; i--) {
      const s = this.specs[i];
      if (!s) continue;
      const matchesKey = s.key === keyOrId;
      const matchesUnkeyedId = !s.key && s.id === keyOrId;
      if (matchesKey || matchesUnkeyedId) this.specs.splice(i, 1);
    }
    return this;
  }

  /** Remove all overlays. */
  clear(): this {
    this.specs.length = 0;
    this.keyCounters.clear();
    return this;
  }

  build(): VizOverlaySpec[] {
    return [...this.specs];
  }

  /** Add a generic rectangle overlay (built-in, no custom registry needed). */
  rect(params: RectOverlayParams, options?: OverlayAddOptions): this {
    return this.add('rect', params, options);
  }

  /** Add a generic circle overlay (built-in, no custom registry needed). */
  circle(params: CircleOverlayParams, options?: OverlayAddOptions): this {
    return this.add('circle', params, options);
  }

  /** Add a generic text overlay (built-in, no custom registry needed). */
  text(params: TextOverlayParams, options?: OverlayAddOptions): this {
    return this.add('text', params, options);
  }
}

/** Convenience helper for one-off overlay list compilation. */
export function buildOverlaySpecs(
  cb: (overlay: OverlayBuilder) => unknown
): VizOverlaySpec[] {
  const overlay = new OverlayBuilder();
  cb(overlay);
  return overlay.build();
}
