import type { NodeShape, Vec2 } from '../../types';
import type { EquidistantPort, PerimeterStrategy } from './types';

export const DEG = 180 / Math.PI;
export const RAD = Math.PI / 180;
export const ARC_SAMPLES = 720;

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

export function portFromPoint(pt: Vec2, i: number, t: number): EquidistantPort {
  return {
    id: `p${i}`,
    angle: normalizeAngle(angleDeg(pt)),
    t,
    x: pt.x,
    y: pt.y,
  };
}

/** Place `count` equidistant points along a closed polygon by arc length. */
export function walkPolygonEquidistant(
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
export function polygonStrategy<K extends NodeShape['kind']>(
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
export function sampledCurveStrategy<K extends NodeShape['kind']>(
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
