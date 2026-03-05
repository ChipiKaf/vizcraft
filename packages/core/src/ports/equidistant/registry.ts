import type { NodePort, NodeShape } from '../../types';
import type { EquidistantPort, PerimeterStrategy } from './types';
import { walkPolygonEquidistant } from './utils';
import { builtInStrategies } from './strategies';

const FALLBACK_COUNT = 8;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const strategyRegistry = new Map<NodeShape['kind'], PerimeterStrategy<any>>();

/** Register (or replace) a {@link PerimeterStrategy} for a shape kind. */
export function registerPerimeterStrategy<K extends NodeShape['kind']>(
  strategy: PerimeterStrategy<K>
): void {
  strategyRegistry.set(strategy.kind, strategy);
}

for (const s of builtInStrategies) {
  registerPerimeterStrategy(s);
}

function shapeBoundingBox(shape: NodeShape): { hw: number; hh: number } {
  switch (shape.kind) {
    case 'circle':
      return { hw: shape.r, hh: shape.r };
    case 'rect':
      return { hw: shape.w / 2, hh: shape.h / 2 };
    case 'diamond':
      return { hw: shape.w / 2, hh: shape.h / 2 };
    case 'ellipse':
      return { hw: shape.rx, hh: shape.ry };
    case 'hexagon':
      return { hw: shape.r, hh: shape.r };
    case 'cylinder':
      return { hw: shape.w / 2, hh: shape.h / 2 };
    case 'arc':
      return { hw: shape.r, hh: shape.r };
    case 'blockArrow':
      return { hw: shape.length / 2, hh: shape.headWidth / 2 };
    case 'callout':
      return { hw: shape.w / 2, hh: shape.h / 2 };
    case 'cloud':
      return { hw: shape.w / 2, hh: shape.h / 2 };
    case 'cross':
      return { hw: shape.size / 2, hh: shape.size / 2 };
    case 'cube':
      return { hw: shape.w / 2, hh: shape.h / 2 };
    case 'path':
      return { hw: shape.w / 2, hh: shape.h / 2 };
    case 'document':
      return { hw: shape.w / 2, hh: shape.h / 2 };
    case 'note':
      return { hw: shape.w / 2, hh: shape.h / 2 };
    case 'parallelogram':
      return { hw: shape.w / 2, hh: shape.h / 2 };
    case 'star':
      return { hw: shape.outerR, hh: shape.outerR };
    case 'trapezoid':
      return {
        hw: Math.max(shape.topW, shape.bottomW) / 2,
        hh: shape.h / 2,
      };
    case 'triangle':
      return { hw: shape.w / 2, hh: shape.h / 2 };
    case 'image':
      return { hw: shape.w / 2, hh: shape.h / 2 };
    case 'icon':
      return { hw: shape.w / 2, hh: shape.h / 2 };
    case 'svg':
      return { hw: shape.w / 2, hh: shape.h / 2 };
    default:
      return { hw: 0, hh: 0 };
  }
}

function boundingBoxFallback(
  shape: NodeShape,
  count: number
): EquidistantPort[] {
  const { hw, hh } = shapeBoundingBox(shape);
  return walkPolygonEquidistant(
    [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh },
    ],
    count
  );
}

/**
 * Compute N equidistant points along a shape's perimeter by arc length.
 * Delegates to a registered {@link PerimeterStrategy} or falls back to
 * a bounding-box rectangle approximation.
 *
 * @param shape - The node shape specification.
 * @param count - Number of ports (uses a shape-specific default when omitted).
 */
export function getEquidistantPorts(
  shape: NodeShape,
  count?: number
): EquidistantPort[] {
  const strategy = strategyRegistry.get(shape.kind);

  const n =
    count ??
    (strategy
      ? typeof strategy.defaultCount === 'function'
        ? strategy.defaultCount(shape)
        : strategy.defaultCount
      : FALLBACK_COUNT);

  if (n <= 0) return [];

  if (strategy) return strategy.computePorts(shape, n);

  return boundingBoxFallback(shape, n);
}

/** Convert equidistant ports to `NodePort[]` with `offset` and `direction`. */
export function toNodePorts(ports: readonly EquidistantPort[]): NodePort[] {
  return ports.map((p) => ({
    id: p.id,
    offset: { x: p.x, y: p.y },
    direction: p.angle,
  }));
}
