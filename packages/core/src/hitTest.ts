import type { VizScene, VizNode, Vec2 } from './types';
import { computeEdgePath, computeEdgeEndpoints } from './edgePaths';

/** Result of a point hit test. */
export type HitResult =
  | { type: 'node'; id: string }
  | { type: 'edge'; id: string }
  | { type: 'port'; nodeId: string; portId: string; position: Vec2 }
  | null;

export interface HitTestOptions {
  /** Maximum distance away from an edge to still "hit" it. Default: 5. */
  edgeTolerance?: number;
  /** Maximum distance to a port center. Default: 10. */
  portTolerance?: number;
}

// ----------------------------------------------------------------------------
// Mathematical Helpers
// ----------------------------------------------------------------------------

export function pointInRect(
  p: Vec2,
  rect: { x: number; y: number; w: number; h: number }
): boolean {
  return (
    p.x >= rect.x &&
    p.x <= rect.x + rect.w &&
    p.y >= rect.y &&
    p.y <= rect.y + rect.h
  );
}

function pointInCircle(p: Vec2, center: Vec2, radius: number): boolean {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return dx * dx + dy * dy <= radius * radius;
}

export function distanceSquare(p1: Vec2, p2: Vec2): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return dx * dx + dy * dy;
}

/** Distance from point p to line segment v-w */
function distToSegmentSquared(p: Vec2, v: Vec2, w: Vec2): number {
  const l2 = distanceSquare(v, w);
  if (l2 === 0) return distanceSquare(p, v);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return distanceSquare(p, {
    x: v.x + t * (w.x - v.x),
    y: v.y + t * (w.y - v.y),
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function distToSegment(p: Vec2, v: Vec2, w: Vec2): number {
  return Math.sqrt(distToSegmentSquared(p, v, w));
}

// ----------------------------------------------------------------------------
// Path Math (Approximations)
// ----------------------------------------------------------------------------

/**
 * Parses an SVG path string (`M`, `L`, `C`, `Q`, `Z`) into a sequence of points.
 * We sample curves by breaking them into linear segments.
 */
function samplePath(d: string, samplesPerCurve = 10): Vec2[] {
  const commands = d.match(/[a-zA-Z][^a-zA-Z]*/g);
  if (!commands) return [];

  const pts: Vec2[] = [];
  let currX = 0;
  let currY = 0;
  let startX = 0;
  let startY = 0;

  for (const cmdStr of commands) {
    const type = cmdStr[0]!;
    const args = cmdStr
      .substring(1)
      .trim()
      .split(/[\s,]+/)
      .filter((s) => s !== '')
      .map(parseFloat);

    switch (type.toUpperCase()) {
      case 'M':
        if (args.length >= 2) {
          currX = args[0]!;
          currY = args[1]!;
          startX = currX;
          startY = currY;
          pts.push({ x: currX, y: currY });
        }
        break;
      case 'L':
        for (let i = 0; i < args.length; i += 2) {
          currX = args[i]!;
          currY = args[i + 1]!;
          pts.push({ x: currX, y: currY });
        }
        break;
      case 'Q':
        for (let i = 0; i < args.length; i += 4) {
          const cx = args[i]!;
          const cy = args[i + 1]!;
          const ex = args[i + 2]!;
          const ey = args[i + 3]!;
          for (let js = 1; js <= samplesPerCurve; js++) {
            const t = js / samplesPerCurve;
            const mt = 1 - t;
            const x = mt * mt * currX + 2 * mt * t * cx + t * t * ex;
            const y = mt * mt * currY + 2 * mt * t * cy + t * t * ey;
            pts.push({ x, y });
          }
          currX = ex;
          currY = ey;
        }
        break;
      case 'C':
        for (let i = 0; i < args.length; i += 6) {
          const c1x = args[i]!;
          const c1y = args[i + 1]!;
          const c2x = args[i + 2]!;
          const c2y = args[i + 3]!;
          const ex = args[i + 4]!;
          const ey = args[i + 5]!;
          for (let js = 1; js <= samplesPerCurve; js++) {
            const t = js / samplesPerCurve;
            const mt = 1 - t;
            const x =
              mt * mt * mt * currX +
              3 * mt * mt * t * c1x +
              3 * mt * t * t * c2x +
              t * t * t * ex;
            const y =
              mt * mt * mt * currY +
              3 * mt * mt * t * c1y +
              3 * mt * t * t * c2y +
              t * t * t * ey;
            pts.push({ x, y });
          }
          currX = ex;
          currY = ey;
        }
        break;
      case 'Z':
        currX = startX;
        currY = startY;
        pts.push({ x: currX, y: currY });
        break;
    }
  }

  return pts;
}

function distToPolyline(p: Vec2, polyline: Vec2[]): number {
  if (polyline.length === 0) return Infinity;
  if (polyline.length === 1) return Math.sqrt(distanceSquare(p, polyline[0]!));

  let minDistSq = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const distSq = distToSegmentSquared(p, polyline[i]!, polyline[i + 1]!);
    if (distSq < minDistSq) minDistSq = distSq;
  }
  return Math.sqrt(minDistSq);
}

// ----------------------------------------------------------------------------
// Geometry Checkers
// ----------------------------------------------------------------------------

export function getEffectiveNodeBounds(node: VizNode): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  let w = 0,
    h = 0;
  const s = node.shape;
  const px = node.runtime?.x ?? node.pos.x;
  const py = node.runtime?.y ?? node.pos.y;

  if (node.runtime?.width !== undefined) w = node.runtime.width;
  else if ('w' in s) w = (s as { w: number }).w;
  else if ('r' in s) w = (s as { r: number }).r * 2;
  else if ('rx' in s && 'ry' in s) {
    w = (s as { rx: number }).rx * 2;
    h = (s as { ry: number }).ry * 2;
  } else if ('size' in s) w = (s as { size: number }).size;
  else if ('outerR' in s) w = (s as { outerR: number }).outerR * 2;

  if (node.runtime?.height !== undefined) h = node.runtime.height;
  else if ('h' in s) h = (s as { h: number }).h;
  else if (h === 0) h = w;

  return { x: px - w / 2, y: py - h / 2, w, h };
}

function hitTestNode(node: VizNode, point: Vec2): boolean {
  // A fast bounding box check first
  const bounds = getEffectiveNodeBounds(node);
  if (!pointInRect(point, bounds)) return false;

  // More precise geometric checks per shape, if needed.
  // For now, bounding box is often sufficient for most flow nodes,
  // but let's do circle/ellipse precisely.
  const shape = node.shape;
  const pos = {
    x: node.runtime?.x ?? node.pos.x,
    y: node.runtime?.y ?? node.pos.y,
  };

  if (shape.kind === 'circle') {
    const r = node.runtime?.radius ?? shape.r;
    return pointInCircle(point, pos, r);
  }

  if (shape.kind === 'ellipse') {
    const rx =
      node.runtime?.width !== undefined ? node.runtime.width / 2 : shape.rx;
    const ry =
      node.runtime?.height !== undefined ? node.runtime.height / 2 : shape.ry;
    const dx = point.x - pos.x;
    const dy = point.y - pos.y;
    return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
  }

  // Fallback to bounding rect for others like rect, document, callout, diamond, etc.
  return true;
}

// ----------------------------------------------------------------------------
// Core Hit Testing API
// ----------------------------------------------------------------------------

/**
 * Perform a hit test on the scene to find the element at the given coordinates.
 * Z-index is handled by iterating nodes in reverse order (drawn last = top).
 * Resolution order: 1. Nodes, 2. Ports (since they sit on nodes), 3. Edges.
 */
export function hitTest(
  scene: VizScene,
  point: Vec2,
  options: HitTestOptions = {}
): HitResult {
  const { edgeTolerance = 5, portTolerance = 10 } = options;

  // 1. Nodes (top-most first)
  for (let i = scene.nodes.length - 1; i >= 0; i--) {
    const node = scene.nodes[i]!;
    if (hitTestNode(node, point)) {
      return { type: 'node', id: node.id };
    }
  }

  // 2. Ports (check all explicit ports of all nodes)
  for (const node of scene.nodes) {
    if (!node.ports || node.ports.length === 0) continue;
    const pos = {
      x: node.runtime?.x ?? node.pos.x,
      y: node.runtime?.y ?? node.pos.y,
    };
    for (const port of node.ports) {
      const portAbsPos = { x: pos.x + port.offset.x, y: pos.y + port.offset.y };
      if (pointInCircle(point, portAbsPos, portTolerance)) {
        return {
          type: 'port',
          nodeId: node.id,
          portId: port.id,
          position: portAbsPos,
        };
      }
    }
  }

  // 3. Edges (top-most first)
  for (let i = scene.edges.length - 1; i >= 0; i--) {
    const edge = scene.edges[i]!;
    const dist = edgeDistance(scene, edge.id, point);
    const hitArea = edge.hitArea ?? edgeTolerance;
    if (dist <= hitArea) {
      return { type: 'edge', id: edge.id };
    }
  }

  return null;
}

/**
 * Returns all elements intersecting or contained within a given rectangle.
 */
export function hitTestRect(
  scene: VizScene,
  rect: { x: number; y: number; w: number; h: number }
): Array<{ type: 'node' | 'edge'; id: string }> {
  const results: Array<{ type: 'node' | 'edge'; id: string }> = [];

  // Check nodes (approximate with central bounds overlapping rect)
  for (const node of scene.nodes) {
    const bounds = getEffectiveNodeBounds(node);
    // Standard AABB intersection
    const intersect = !(
      bounds.x > rect.x + rect.w ||
      bounds.x + bounds.w < rect.x ||
      bounds.y > rect.y + rect.h ||
      bounds.y + bounds.h < rect.y
    );
    if (intersect) {
      results.push({ type: 'node', id: node.id });
    }
  }

  // Check edges
  // Roughly test if the edge's bounding box intersects the rect
  for (const edge of scene.edges) {
    const startNode = scene.nodes.find((n) => n.id === edge.from);
    const endNode = scene.nodes.find((n) => n.id === edge.to);
    if (!startNode || !endNode) continue;

    // Simplistic edge bounding box
    const startPos = {
      x: startNode.runtime?.x ?? startNode.pos.x,
      y: startNode.runtime?.y ?? startNode.pos.y,
    };
    const endPos = {
      x: endNode.runtime?.x ?? endNode.pos.x,
      y: endNode.runtime?.y ?? endNode.pos.y,
    };

    const minX = Math.min(startPos.x, endPos.x) - 10;
    const maxX = Math.max(startPos.x, endPos.x) + 10;
    const minY = Math.min(startPos.y, endPos.y) - 10;
    const maxY = Math.max(startPos.y, endPos.y) + 10;

    const intersect = !(
      minX > rect.x + rect.w ||
      maxX < rect.x ||
      minY > rect.y + rect.h ||
      maxY < rect.y
    );
    if (intersect) {
      results.push({ type: 'edge', id: edge.id });
    }
  }

  return results;
}

/**
 * Finds the nearest named port in the scene to the given point, within maxDistance.
 */
export function nearestPort(
  scene: VizScene,
  point: Vec2,
  options: { maxDistance: number }
): { nodeId: string; portId: string; position: Vec2; distance: number } | null {
  const { maxDistance } = options;
  let closest: {
    nodeId: string;
    portId: string;
    position: Vec2;
    distance: number;
  } | null = null;
  let minDistSq = maxDistance * maxDistance;

  for (const node of scene.nodes) {
    if (!node.ports) continue;
    const pos = {
      x: node.runtime?.x ?? node.pos.x,
      y: node.runtime?.y ?? node.pos.y,
    };

    for (const port of node.ports) {
      const portPos = { x: pos.x + port.offset.x, y: pos.y + port.offset.y };
      const dSq = distanceSquare(point, portPos);
      if (dSq <= minDistSq) {
        minDistSq = dSq;
        closest = {
          nodeId: node.id,
          portId: port.id,
          position: portPos,
          distance: Math.sqrt(dSq),
        };
      }
    }
  }

  return closest;
}

/**
 * Calculates the perpendicular distance from a point to a specific edge's drawn path.
 */
export function edgeDistance(
  scene: VizScene,
  edgeId: string,
  point: Vec2
): number {
  const edge = scene.edges.find((e) => e.id === edgeId);
  if (!edge) return Infinity;

  const startNode = scene.nodes.find((n) => n.id === edge.from);
  const endNode = scene.nodes.find((n) => n.id === edge.to);
  if (!startNode || !endNode) return Infinity;

  const { start, end } = computeEdgeEndpoints(startNode, endNode, edge);
  const pathData = computeEdgePath(start, end, edge.routing, edge.waypoints);

  const polyline = samplePath(pathData.d, 10);
  return distToPolyline(point, polyline);
}
