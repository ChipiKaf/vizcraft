import type { NodeShape } from '../types';

/**
 * A port positioned equidistantly along a shape's perimeter.
 *
 * Returned by {@link getEquidistantPorts}.
 */
export interface EquidistantPort {
  /** Stable port identifier (e.g. `'p0'`, `'p1'`, …). */
  id: string;
  /** Angle from center in **degrees** (0 = right, 90 = down). */
  angle: number;
  /** Parametric perimeter proportion in **[0, 1)**. */
  t: number;
  /** X offset from node center. */
  x: number;
  /** Y offset from node center. */
  y: number;
}

/**
 * A pluggable strategy that knows how to compute equidistant ports
 * for a specific shape kind.
 *
 * Implement this interface and register it via
 * {@link registerPerimeterStrategy} to add support for additional shapes
 * or to override a built-in strategy.
 */
export interface PerimeterStrategy<
  K extends NodeShape['kind'] = NodeShape['kind'],
> {
  /** Shape kind this strategy handles. */
  readonly kind: K;
  /**
   * Default port count when the caller omits `count`.
   * May be a fixed number or a function that derives the count from the
   * shape (e.g. `star` → `points * 2`).
   */
  readonly defaultCount:
    | number
    | ((shape: Extract<NodeShape, { kind: K }>) => number);
  /** Compute equidistant ports for the given shape and count. */
  computePorts(
    shape: Extract<NodeShape, { kind: K }>,
    count: number
  ): EquidistantPort[];
}
