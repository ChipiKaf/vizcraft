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

/**
 * Assign angle-bucket IDs to ports based on their angle from center.
 *
 * Each port is bucketed into a 90° quadrant (0, 90, 180, 270) and given
 * an index within that quadrant. For example, a port at 45° becomes `0-0`
 * (first port in the 0°–90° quadrant).
 *
 * This scheme is stable across count changes — ports near the same angle
 * keep the same ID prefix regardless of total port count.
 */
export function assignAngleBucketIds(
  ports: readonly EquidistantPort[]
): EquidistantPort[] {
  const bucketCounts = new Map<number, number>();

  return ports.map((p) => {
    const bucket = Math.floor(normalizeAngle(p.angle) / 90) * 90;
    const idx = bucketCounts.get(bucket) ?? 0;
    bucketCounts.set(bucket, idx + 1);
    return { ...p, id: `${bucket}-${idx}` };
  });
}

/**
 * Place `count` equidistant points along a closed polygon by arc length.
 *
 * When `sideLabels` is provided (one label per edge), each port receives a
 * location-based ID in the format `{label}-{indexWithinSide}` (e.g.
 * `top-0`, `right-1`). Without labels, ports fall back to sequential
 * `p0`–`pN` IDs.
 */
export function walkPolygonEquidistant(
  vertices: Vec2[],
  count: number,
  sideLabels?: readonly string[]
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

  // Track per-side port counts for side-based IDs
  const sideCounts: number[] = sideLabels ? new Array<number>(n).fill(0) : [];

  for (let i = 0; i < count; i++) {
    const target = i * segLen;
    while (edgeIdx < n - 1 && cumDist[edgeIdx + 1]! <= target) edgeIdx++;

    const edgeStart = cumDist[edgeIdx]!;
    const edgeEnd = cumDist[edgeIdx + 1]!;
    const edgeLen = edgeEnd - edgeStart;
    const frac = edgeLen > 0 ? (target - edgeStart) / edgeLen : 0;

    const a = vertices[edgeIdx]!;
    const b = vertices[(edgeIdx + 1) % n]!;
    const pt = lerp(a, b, frac);

    let id: string;
    if (sideLabels) {
      const sideLabel = sideLabels[edgeIdx]!;
      const sideIdx = sideCounts[edgeIdx]!;
      sideCounts[edgeIdx] = sideIdx + 1;
      id = `${sideLabel}-${sideIdx}`;
    } else {
      id = `p${i}`;
    }

    ports.push({
      id,
      angle: normalizeAngle(angleDeg(pt)),
      t: target / perimeter,
      x: pt.x,
      y: pt.y,
    });
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

/**
 * Create a polygon strategy from a vertex extractor.
 *
 * When `extractSideLabels` is provided, ports receive location-based IDs
 * (e.g. `top-0`, `right-1`). Otherwise, angle-bucket IDs are assigned
 * (e.g. `0-0`, `90-1`).
 */
export function polygonStrategy<K extends NodeShape['kind']>(
  kind: K,
  defaultCount: number | ((shape: Extract<NodeShape, { kind: K }>) => number),
  extractVertices: (shape: Extract<NodeShape, { kind: K }>) => Vec2[],
  extractSideLabels?: (
    shape: Extract<NodeShape, { kind: K }>
  ) => readonly string[]
): PerimeterStrategy<K> {
  return {
    kind,
    defaultCount,
    computePorts: (shape, count) => {
      const vertices = extractVertices(shape);
      const labels = extractSideLabels?.(shape);
      const ports = walkPolygonEquidistant(vertices, count, labels);
      return labels ? ports : assignAngleBucketIds(ports);
    },
  };
}

/**
 * Create a curved-shape strategy from a perimeter sampler.
 *
 * Ports receive angle-bucket IDs (e.g. `0-0`, `90-1`).
 */
export function sampledCurveStrategy<K extends NodeShape['kind']>(
  kind: K,
  defaultCount: number,
  samplePerimeter: (shape: Extract<NodeShape, { kind: K }>) => Vec2[]
): PerimeterStrategy<K> {
  return {
    kind,
    defaultCount,
    computePorts: (shape, count) =>
      assignAngleBucketIds(
        walkSampledCurveEquidistant(samplePerimeter(shape), count)
      ),
  };
}
