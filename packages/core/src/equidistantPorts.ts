import type { NodePort, NodeShape, Vec2 } from './types';

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

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

const ARC_SAMPLES = 720;
const FALLBACK_COUNT = 8;

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

function portFromPoint(pt: Vec2, i: number, t: number): EquidistantPort {
  return {
    id: `p${i}`,
    angle: normalizeAngle(angleDeg(pt)),
    t,
    x: pt.x,
    y: pt.y,
  };
}

/** Place `count` equidistant points along a closed polygon by arc length. */
function walkPolygonEquidistant(
  vertices: Vec2[],
  count: number
): EquidistantPort[] {
  const n = vertices.length;
  if (n === 0 || count <= 0) return [];

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
    while (edgeIdx < n - 1 && cumDist[edgeIdx + 1]! <= target) edgeIdx++;

    const edgeStart = cumDist[edgeIdx]!;
    const edgeEnd = cumDist[edgeIdx + 1]!;
    const edgeLen = edgeEnd - edgeStart;
    const frac = edgeLen > 0 ? (target - edgeStart) / edgeLen : 0;

    const a = vertices[edgeIdx]!;
    const b = vertices[(edgeIdx + 1) % n]!;
    ports.push(portFromPoint(lerp(a, b, frac), i, target / perimeter));
  }

  return ports;
}

/** Place `count` equidistant points along densely-sampled perimeter points. */
function walkSampledCurveEquidistant(
  pts: Vec2[],
  count: number
): EquidistantPort[] {
  const totalPts = pts.length;
  if (totalPts < 2 || count <= 0) return [];

  const cumLen: number[] = [0];
  for (let i = 1; i < totalPts; i++) {
    cumLen.push(cumLen[i - 1]! + dist(pts[i - 1]!, pts[i]!));
  }
  const perimeter = cumLen[totalPts - 1]! + dist(pts[totalPts - 1]!, pts[0]!);
  if (perimeter === 0) return [];

  const ports: EquidistantPort[] = [];
  let sampleIdx = 0;

  for (let i = 0; i < count; i++) {
    const t = i / count;
    const target = t * perimeter;

    while (sampleIdx < totalPts - 1 && cumLen[sampleIdx + 1]! <= target) {
      sampleIdx++;
    }

    let pt: Vec2;
    if (sampleIdx >= totalPts - 1) {
      const segStart = cumLen[totalPts - 1]!;
      const closeLen = perimeter - segStart;
      const frac = closeLen > 0 ? (target - segStart) / closeLen : 0;
      pt = lerp(pts[totalPts - 1]!, pts[0]!, frac);
    } else {
      const segStart = cumLen[sampleIdx]!;
      const segEnd = cumLen[sampleIdx + 1]!;
      const segL = segEnd - segStart;
      const frac = segL > 0 ? (target - segStart) / segL : 0;
      pt = lerp(pts[sampleIdx]!, pts[sampleIdx + 1]!, frac);
    }

    ports.push(portFromPoint(pt, i, t));
  }

  return ports;
}

/** Create a polygon strategy from a vertex extractor. */
function polygonStrategy<K extends NodeShape['kind']>(
  kind: K,
  defaultCount: number | ((shape: Extract<NodeShape, { kind: K }>) => number),
  extractVertices: (shape: Extract<NodeShape, { kind: K }>) => Vec2[]
): PerimeterStrategy<K> {
  return {
    kind,
    defaultCount,
    computePorts: (shape, count) =>
      walkPolygonEquidistant(extractVertices(shape), count),
  };
}

/** Create a curved-shape strategy from a perimeter sampler. */
function sampledCurveStrategy<K extends NodeShape['kind']>(
  kind: K,
  defaultCount: number,
  samplePerimeter: (shape: Extract<NodeShape, { kind: K }>) => Vec2[]
): PerimeterStrategy<K> {
  return {
    kind,
    defaultCount,
    computePorts: (shape, count) =>
      walkSampledCurveEquidistant(samplePerimeter(shape), count),
  };
}

function rectVertices(w: number, h: number): Vec2[] {
  const hw = w / 2;
  const hh = h / 2;
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
  return [
    { x: 0, y: -hh },
    { x: hw, y: 0 },
    { x: 0, y: hh },
    { x: -hw, y: 0 },
  ];
}

function hexagonVertices(r: number, orientation: 'pointy' | 'flat'): Vec2[] {
  const offset = orientation === 'pointy' ? -Math.PI / 2 : 0;
  const verts: Vec2[] = [];
  for (let i = 0; i < 6; i++) {
    const a = offset + (Math.PI / 3) * i;
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
  return [
    { x: -hw + half, y: -hh },
    { x: hw + half, y: -hh },
    { x: hw - half, y: hh },
    { x: -hw - half, y: hh },
  ];
}

function trapezoidVertices(topW: number, bottomW: number, h: number): Vec2[] {
  const htw = topW / 2;
  const hbw = bottomW / 2;
  const hh = h / 2;
  return [
    { x: -htw, y: -hh },
    { x: htw, y: -hh },
    { x: hbw, y: hh },
    { x: -hbw, y: hh },
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

function sampleEllipse(rx: number, ry: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= ARC_SAMPLES; i++) {
    const theta = (2 * Math.PI * i) / ARC_SAMPLES;
    pts.push({ x: rx * Math.cos(theta), y: ry * Math.sin(theta) });
  }
  return pts;
}

/** Sample the visible cylinder outline. Matches `cylinderGeometry` in shapes.ts. */
function sampleCylinder(
  w: number,
  h: number,
  arcHeight: number | undefined
): Vec2[] {
  const rx = w / 2;
  const ry = arcHeight ?? Math.round(h * 0.15);
  const hh = h / 2;

  const arcSamples = Math.ceil(ARC_SAMPLES / 2);
  const sideSamples = Math.max(4, Math.ceil(arcSamples / 4));

  const pts: Vec2[] = [];

  // Top cap upper arc: (rx, -hh) → (0, -hh-ry) → (-rx, -hh)
  for (let i = 0; i <= arcSamples; i++) {
    const phi = (Math.PI * i) / arcSamples;
    pts.push({ x: rx * Math.cos(phi), y: -hh - ry * Math.sin(phi) });
  }

  // Left side: (-rx, -hh) → (-rx, hh)
  for (let i = 1; i <= sideSamples; i++) {
    pts.push({ x: -rx, y: -hh + (i / sideSamples) * h });
  }

  // Bottom arc lower half: (-rx, hh) → (0, hh+ry) → (rx, hh)
  for (let i = 1; i <= arcSamples; i++) {
    const phi = (Math.PI * i) / arcSamples;
    pts.push({ x: -rx * Math.cos(phi), y: hh + ry * Math.sin(phi) });
  }

  // Right side: (rx, hh) → (rx, -hh)  (exclude last = start)
  for (let i = 1; i < sideSamples; i++) {
    pts.push({ x: rx, y: hh - (i / sideSamples) * h });
  }

  return pts;
}

// Uniform angle is equidistant by arc length for circles.
function circleEquidistant(r: number, count: number): EquidistantPort[] {
  const ports: EquidistantPort[] = [];
  for (let i = 0; i < count; i++) {
    const aDeg = (360 * i) / count;
    const aRad = aDeg * RAD;
    ports.push(
      portFromPoint(
        { x: r * Math.cos(aRad), y: r * Math.sin(aRad) },
        i,
        i / count
      )
    );
  }
  return ports;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const strategyRegistry = new Map<NodeShape['kind'], PerimeterStrategy<any>>();

/** Register (or replace) a {@link PerimeterStrategy} for a shape kind. */
export function registerPerimeterStrategy<K extends NodeShape['kind']>(
  strategy: PerimeterStrategy<K>
): void {
  strategyRegistry.set(strategy.kind, strategy);
}

registerPerimeterStrategy({
  kind: 'circle',
  defaultCount: 8,
  computePorts: (shape, count) => circleEquidistant(shape.r, count),
} satisfies PerimeterStrategy<'circle'>);

registerPerimeterStrategy(
  sampledCurveStrategy('ellipse', 8, (s) => sampleEllipse(s.rx, s.ry))
);

registerPerimeterStrategy(
  sampledCurveStrategy('cylinder', 10, (s) =>
    sampleCylinder(s.w, s.h, s.arcHeight)
  )
);

registerPerimeterStrategy(
  polygonStrategy('rect', 8, (s) => rectVertices(s.w, s.h))
);

registerPerimeterStrategy(
  polygonStrategy('diamond', 4, (s) => diamondVertices(s.w, s.h))
);

registerPerimeterStrategy(
  polygonStrategy('hexagon', 6, (s) =>
    hexagonVertices(s.r, s.orientation ?? 'pointy')
  )
);

registerPerimeterStrategy(
  polygonStrategy('triangle', 6, (s) =>
    triangleVertices(s.w, s.h, s.direction ?? 'up')
  )
);

registerPerimeterStrategy(
  polygonStrategy('parallelogram', 8, (s) =>
    parallelogramVertices(s.w, s.h, s.skew ?? Math.round(s.w * 0.2))
  )
);

registerPerimeterStrategy(
  polygonStrategy('trapezoid', 8, (s) =>
    trapezoidVertices(s.topW, s.bottomW, s.h)
  )
);

registerPerimeterStrategy(
  polygonStrategy(
    'star',
    (s) => s.points * 2,
    (s) =>
      starVertices(s.points, s.outerR, s.innerR ?? Math.round(s.outerR * 0.4))
  )
);

registerPerimeterStrategy(
  polygonStrategy('cross', 12, (s) =>
    crossVertices(s.size, s.barWidth ?? Math.round(s.size / 3))
  )
);

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
  const bb = shapeBoundingBox(shape);
  return walkPolygonEquidistant(rectVertices(bb.hw * 2, bb.hh * 2), count);
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
