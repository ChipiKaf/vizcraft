import type { NodePort, NodeShape, Vec2 } from './types';

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

/**
 * Number of samples used when integrating ellipse / curve arc‑length.
 * Higher values give better accuracy at negligible cost for typical counts.
 */
const ARC_SAMPLES = 720;

/* ------------------------------------------------------------------ */
/*  Smart defaults per shape kind                                      */
/* ------------------------------------------------------------------ */

const DEFAULT_COUNT: Partial<Record<NodeShape['kind'], number>> = {
  rect: 8,
  circle: 8,
  ellipse: 8,
  diamond: 4,
  hexagon: 6,
  triangle: 6,
  parallelogram: 8,
  trapezoid: 8,
  star: undefined, // derived from `points` field at runtime
  cross: 12,
};

const FALLBACK_COUNT = 8;

function defaultCount(shape: NodeShape): number {
  if (shape.kind === 'star') return shape.points * 2;
  return DEFAULT_COUNT[shape.kind] ?? FALLBACK_COUNT;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function lerp(a: Vec2, b: Vec2, f: number): Vec2 {
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

function angleDeg(v: Vec2): number {
  return Math.atan2(v.y, v.x) * DEG;
}

function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/* ------------------------------------------------------------------ */
/*  Polygon vertex extraction (offsets from center)                    */
/* ------------------------------------------------------------------ */

function rectVertices(w: number, h: number): Vec2[] {
  const hw = w / 2;
  const hh = h / 2;
  // CW from top-left
  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
}

function diamondVertices(w: number, h: number): Vec2[] {
  const hw = w / 2;
  const hh = h / 2;
  // CW from top
  return [
    { x: 0, y: -hh },
    { x: hw, y: 0 },
    { x: 0, y: hh },
    { x: -hw, y: 0 },
  ];
}

function hexagonVertices(r: number, orientation: 'pointy' | 'flat'): Vec2[] {
  const angleOffset = orientation === 'pointy' ? -Math.PI / 2 : 0;
  const verts: Vec2[] = [];
  for (let i = 0; i < 6; i++) {
    const a = angleOffset + (Math.PI / 3) * i;
    verts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  return verts;
}

function triangleVertices(
  w: number,
  h: number,
  direction: 'up' | 'down' | 'left' | 'right'
): Vec2[] {
  const hw = w / 2;
  const hh = h / 2;
  switch (direction) {
    case 'up':
      return [
        { x: 0, y: -hh },
        { x: hw, y: hh },
        { x: -hw, y: hh },
      ];
    case 'down':
      return [
        { x: 0, y: hh },
        { x: -hw, y: -hh },
        { x: hw, y: -hh },
      ];
    case 'left':
      return [
        { x: -hw, y: 0 },
        { x: hw, y: -hh },
        { x: hw, y: hh },
      ];
    case 'right':
      return [
        { x: hw, y: 0 },
        { x: -hw, y: hh },
        { x: -hw, y: -hh },
      ];
  }
}

function parallelogramVertices(w: number, h: number, skew: number): Vec2[] {
  const hw = w / 2;
  const hh = h / 2;
  const half = skew / 2;
  // CW from top-left (matches shapes.ts order, starting from bottom-left
  // but reordered CW from top-right for consistent winding)
  return [
    { x: -hw + half, y: -hh }, // top-left
    { x: hw + half, y: -hh }, // top-right
    { x: hw - half, y: hh }, // bottom-right
    { x: -hw - half, y: hh }, // bottom-left
  ];
}

function trapezoidVertices(topW: number, bottomW: number, h: number): Vec2[] {
  const htw = topW / 2;
  const hbw = bottomW / 2;
  const hh = h / 2;
  return [
    { x: -htw, y: -hh }, // top-left
    { x: htw, y: -hh }, // top-right
    { x: hbw, y: hh }, // bottom-right
    { x: -hbw, y: hh }, // bottom-left
  ];
}

function starVertices(points: number, outerR: number, innerR: number): Vec2[] {
  const verts: Vec2[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (Math.PI * i) / points - Math.PI / 2;
    verts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  return verts;
}

function crossVertices(size: number, barWidth: number): Vec2[] {
  const hs = size / 2;
  const bw = barWidth / 2;
  // 12-vertex plus sign, CW from top-left of vertical bar
  return [
    { x: -bw, y: -hs },
    { x: bw, y: -hs },
    { x: bw, y: -bw },
    { x: hs, y: -bw },
    { x: hs, y: bw },
    { x: bw, y: bw },
    { x: bw, y: hs },
    { x: -bw, y: hs },
    { x: -bw, y: bw },
    { x: -hs, y: bw },
    { x: -hs, y: -bw },
    { x: -bw, y: -bw },
  ];
}

/**
 * Extract polygon vertices (as offsets from center) for shapes that
 * are inherently polygonal. Returns `null` for curved shapes.
 */
function getPolygonVertices(shape: NodeShape): Vec2[] | null {
  switch (shape.kind) {
    case 'rect':
      return rectVertices(shape.w, shape.h);
    case 'diamond':
      return diamondVertices(shape.w, shape.h);
    case 'hexagon':
      return hexagonVertices(shape.r, shape.orientation ?? 'pointy');
    case 'triangle':
      return triangleVertices(shape.w, shape.h, shape.direction ?? 'up');
    case 'parallelogram':
      return parallelogramVertices(
        shape.w,
        shape.h,
        shape.skew ?? Math.round(shape.w * 0.2)
      );
    case 'trapezoid':
      return trapezoidVertices(shape.topW, shape.bottomW, shape.h);
    case 'star':
      return starVertices(
        shape.points,
        shape.outerR,
        shape.innerR ?? Math.round(shape.outerR * 0.4)
      );
    case 'cross':
      return crossVertices(
        shape.size,
        shape.barWidth ?? Math.round(shape.size / 3)
      );
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Equidistant walk along a closed polygon                            */
/* ------------------------------------------------------------------ */

/**
 * Walk a closed polygon's edges and place `count` equidistant points
 * spaced by perimeter arc length, using cumulative edge lengths.
 */
function walkPolygonEquidistant(
  vertices: Vec2[],
  count: number
): EquidistantPort[] {
  const n = vertices.length;
  if (n === 0 || count <= 0) return [];

  // Build cumulative distance array
  // cumDist[i] = distance from vertex 0 to vertex i along the perimeter
  const cumDist: number[] = [0];
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    cumDist.push(cumDist[i]! + dist(vertices[i]!, vertices[next]!));
  }
  const perimeter = cumDist[n]!;
  if (perimeter === 0) return [];

  const segLen = perimeter / count;
  const ports: EquidistantPort[] = [];
  let edgeIdx = 0;

  for (let i = 0; i < count; i++) {
    const target = i * segLen;

    // Advance to the edge that contains `target`
    while (edgeIdx < n - 1 && cumDist[edgeIdx + 1]! <= target) {
      edgeIdx++;
    }

    const edgeStart = cumDist[edgeIdx]!;
    const edgeEnd = cumDist[edgeIdx + 1]!;
    const edgeLen = edgeEnd - edgeStart;
    const frac = edgeLen > 0 ? (target - edgeStart) / edgeLen : 0;

    const a = vertices[edgeIdx]!;
    const b = vertices[(edgeIdx + 1) % n]!;
    const pt = lerp(a, b, frac);

    ports.push({
      id: `p${i}`,
      angle: normalizeAngle(angleDeg(pt)),
      t: target / perimeter,
      x: pt.x,
      y: pt.y,
    });
  }

  return ports;
}

/* ------------------------------------------------------------------ */
/*  Circle – trivially equidistant by angle                            */
/* ------------------------------------------------------------------ */

function circleEquidistant(r: number, count: number): EquidistantPort[] {
  const ports: EquidistantPort[] = [];
  for (let i = 0; i < count; i++) {
    const aDeg = (360 * i) / count;
    const aRad = aDeg * RAD;
    ports.push({
      id: `p${i}`,
      angle: normalizeAngle(aDeg),
      t: i / count,
      x: r * Math.cos(aRad),
      y: r * Math.sin(aRad),
    });
  }
  return ports;
}

/* ------------------------------------------------------------------ */
/*  Ellipse – numerical arc-length integration                         */
/* ------------------------------------------------------------------ */

function ellipseEquidistant(
  rx: number,
  ry: number,
  count: number
): EquidistantPort[] {
  // Sample many points and compute cumulative arc length
  const samples = ARC_SAMPLES;
  const cumLen: number[] = [0];
  const pts: Vec2[] = [];

  for (let i = 0; i <= samples; i++) {
    const theta = (2 * Math.PI * i) / samples;
    pts.push({ x: rx * Math.cos(theta), y: ry * Math.sin(theta) });
    if (i > 0) {
      cumLen.push(cumLen[i - 1]! + dist(pts[i - 1]!, pts[i]!));
    }
  }

  const perimeter = cumLen[samples]!;
  if (perimeter === 0) return [];

  const segLen = perimeter / count;
  const ports: EquidistantPort[] = [];
  let sampleIdx = 0;

  for (let i = 0; i < count; i++) {
    const target = i * segLen;

    // Advance to the sample segment containing `target`
    while (sampleIdx < samples - 1 && cumLen[sampleIdx + 1]! <= target) {
      sampleIdx++;
    }

    const segStart = cumLen[sampleIdx]!;
    const segEnd = cumLen[sampleIdx + 1]!;
    const segL = segEnd - segStart;
    const frac = segL > 0 ? (target - segStart) / segL : 0;

    const pt = lerp(pts[sampleIdx]!, pts[sampleIdx + 1]!, frac);

    ports.push({
      id: `p${i}`,
      angle: normalizeAngle(angleDeg(pt)),
      t: target / perimeter,
      x: pt.x,
      y: pt.y,
    });
  }

  return ports;
}

/* ------------------------------------------------------------------ */
/*  Bounding-box fallback (rect approximation)                         */
/* ------------------------------------------------------------------ */

function boundingBoxEquidistant(
  shape: NodeShape,
  count: number
): EquidistantPort[] {
  const bb = shapeBoundingBox(shape);
  return walkPolygonEquidistant(rectVertices(bb.hw * 2, bb.hh * 2), count);
}

/** Minimal bounding-box helper (mirrors shapes.ts `shapeBoundingBox`). */
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

/* ------------------------------------------------------------------ */
/*  Main entry point                                                   */
/* ------------------------------------------------------------------ */

/**
 * Compute **N equidistant points** along a shape's perimeter, spaced by
 * arc length (not angular spacing).
 *
 * Supports precise polygon‑walk for rect, diamond, hexagon, triangle,
 * parallelogram, trapezoid, star, and cross shapes. Circle uses uniform
 * angular spacing (which *is* arc‑length‑equidistant for circles). Ellipse
 * uses numerical arc‑length integration. All other shapes fall back to a
 * bounding‑box rectangle approximation.
 *
 * @param shape - The node shape specification.
 * @param count - Number of ports. When omitted, a shape‑specific smart
 *   default is used (e.g. 8 for rect, 4 for diamond, 6 for hexagon).
 * @returns An array of equidistant ports ordered clockwise from angle 0
 *   (the rightmost point of the perimeter for most shapes).
 *
 * @example
 * ```ts
 * import { getEquidistantPorts } from 'vizcraft';
 *
 * const ports = getEquidistantPorts({ kind: 'rect', w: 120, h: 60 });
 * // → 8 ports at corners and edge midpoints
 *
 * const custom = getEquidistantPorts({ kind: 'circle', r: 40 }, 12);
 * // → 12 ports every 30°
 * ```
 */
export function getEquidistantPorts(
  shape: NodeShape,
  count?: number
): EquidistantPort[] {
  const n = count ?? defaultCount(shape);
  if (n <= 0) return [];

  // Circle: equal angle = equal arc length
  if (shape.kind === 'circle') {
    return circleEquidistant(shape.r, n);
  }

  // Ellipse: numerical arc-length integration
  if (shape.kind === 'ellipse') {
    return ellipseEquidistant(shape.rx, shape.ry, n);
  }

  // Polygon shapes: exact vertex walk
  const vertices = getPolygonVertices(shape);
  if (vertices) {
    return walkPolygonEquidistant(vertices, n);
  }

  // Fallback: bounding-box rectangle
  return boundingBoxEquidistant(shape, n);
}

/* ------------------------------------------------------------------ */
/*  Conversion helpers                                                 */
/* ------------------------------------------------------------------ */

/**
 * Convert equidistant ports to VizCraft `NodePort` objects (with `offset`
 * and `direction`), ready for use on a `VizNode`.
 *
 * @example
 * ```ts
 * const node = viz.addNode('n1', { shape: { kind: 'hexagon', r: 40 } });
 * const ports = toNodePorts(getEquidistantPorts(node.shape));
 * // Assign: node.ports = ports;
 * ```
 */
export function toNodePorts(ports: readonly EquidistantPort[]): NodePort[] {
  return ports.map((p) => ({
    id: p.id,
    offset: { x: p.x, y: p.y },
    direction: p.angle,
  }));
}
