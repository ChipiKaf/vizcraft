/**
 * Edge path computation helpers.
 *
 * Given start/end points, routing mode, and optional waypoints this module
 * produces:
 *   1. An SVG `d` attribute string (for `<path>` elements).
 *   2. A midpoint along the path (for label positioning).
 */

import type { Vec2, VizNode, VizEdge, EdgeRouting } from './types';
import { computeNodeAnchor, effectivePos } from './shapes';

// ── Public API ──────────────────────────────────────────────────────────────

export interface EdgePathResult {
  /** SVG path `d` attribute. */
  d: string;
  /** Approximate label position along the path (exact for straight/quadratic, approximated for spline and orthogonal-with-waypoints paths). */
  mid: Vec2;
}

/**
 * Compute anchor-resolved start/end points for an edge.
 *
 * This replicates the logic used internally by the core builder and
 * runtime patcher so that external renderers (e.g. React) can
 * resolve boundary anchors consistently.
 */
export function computeEdgeEndpoints(
  start: VizNode,
  end: VizNode,
  edge: VizEdge
): { start: Vec2; end: Vec2 } {
  const anchor = edge.anchor ?? 'boundary';
  const startPos = effectivePos(start);
  const endPos = effectivePos(end);

  const startAnchor = computeNodeAnchor(start, endPos, anchor);
  const endAnchor = computeNodeAnchor(end, startPos, anchor);
  return { start: startAnchor, end: endAnchor };
}

/**
 * Compute the SVG path for an edge.
 *
 * @param start    Start point (already anchor-resolved).
 * @param end      End point (already anchor-resolved).
 * @param routing  Routing algorithm (default `'straight'`).
 * @param waypoints Optional intermediate points.
 */
export function computeEdgePath(
  start: Vec2,
  end: Vec2,
  routing: EdgeRouting = 'straight',
  waypoints?: Vec2[]
): EdgePathResult {
  switch (routing) {
    case 'curved':
      return curvedPath(start, end, waypoints);
    case 'orthogonal':
      return orthogonalPath(start, end, waypoints);
    case 'straight':
    default:
      return straightPath(start, end, waypoints);
  }
}

// ── Straight routing ────────────────────────────────────────────────────────

function straightPath(
  start: Vec2,
  end: Vec2,
  waypoints?: Vec2[]
): EdgePathResult {
  const pts = [start, ...(waypoints ?? []), end];
  const segments = pts.map((p, i) =>
    i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`
  );
  return {
    d: segments.join(' '),
    mid: polylineMidpoint(pts),
  };
}

// ── Curved routing ──────────────────────────────────────────────────────────

function curvedPath(
  start: Vec2,
  end: Vec2,
  waypoints?: Vec2[]
): EdgePathResult {
  if (waypoints && waypoints.length > 0) {
    // Use waypoints as control/through points – produce a smooth cubic path.
    return curvedThroughPoints(start, end, waypoints);
  }

  // No waypoints: single quadratic bezier with auto-computed control point.
  const cp = autoControlPoint(start, end);
  const d = `M ${start.x} ${start.y} Q ${cp.x} ${cp.y} ${end.x} ${end.y}`;
  const mid = quadraticMid(start, cp, end);
  return { d, mid };
}

/**
 * Auto-compute a control point that creates a gentle arc.
 * The control point is offset perpendicular to the line at the midpoint.
 */
function autoControlPoint(start: Vec2, end: Vec2): Vec2 {
  const mx = (start.x + end.x) / 2;
  const my = (start.y + end.y) / 2;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  // Perpendicular offset: 20% of the line length
  const offset = len * 0.2;
  return {
    x: mx + (-dy / len) * offset,
    y: my + (dx / len) * offset,
  };
}

/** Midpoint of a quadratic bezier at t=0.5. */
function quadraticMid(p0: Vec2, cp: Vec2, p1: Vec2): Vec2 {
  return {
    x: 0.25 * p0.x + 0.5 * cp.x + 0.25 * p1.x,
    y: 0.25 * p0.y + 0.5 * cp.y + 0.25 * p1.y,
  };
}

/**
 * Create a smooth cubic bezier path that goes through all waypoints.
 *
 * Strategy: use Catmull-Rom → cubic conversion for smooth interpolation
 * through all points.
 */
function curvedThroughPoints(
  start: Vec2,
  end: Vec2,
  waypoints: Vec2[]
): EdgePathResult {
  const allPts = [start, ...waypoints, end];

  if (allPts.length === 2) {
    // Degenerate — just a quadratic
    const cp = autoControlPoint(start, end);
    return {
      d: `M ${start.x} ${start.y} Q ${cp.x} ${cp.y} ${end.x} ${end.y}`,
      mid: quadraticMid(start, cp, end),
    };
  }

  // Convert Catmull-Rom through allPts to cubic bezier segments.
  let d = `M ${allPts[0]!.x} ${allPts[0]!.y}`;
  const tension = 0.3; // 0 = straight, 0.5 = Catmull-Rom

  for (let i = 0; i < allPts.length - 1; i++) {
    const p0 = allPts[Math.max(i - 1, 0)]!;
    const p1 = allPts[i]!;
    const p2 = allPts[i + 1]!;
    const p3 = allPts[Math.min(i + 2, allPts.length - 1)]!;

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  // Approximate midpoint: middle segment at t=0.5 (simple midpoint for label)
  const midIdx = Math.floor(allPts.length / 2);
  const mid: Vec2 = {
    x: (allPts[midIdx - 1]!.x + allPts[midIdx]!.x) / 2,
    y: (allPts[midIdx - 1]!.y + allPts[midIdx]!.y) / 2,
  };

  return { d, mid };
}

// ── Orthogonal routing ──────────────────────────────────────────────────────

function orthogonalPath(
  start: Vec2,
  end: Vec2,
  waypoints?: Vec2[]
): EdgePathResult {
  if (waypoints && waypoints.length > 0) {
    // With waypoints, route through each using orthogonal segments.
    return orthogonalThroughWaypoints(start, end, waypoints);
  }

  // Default: auto-compute an L-shaped or Z-shaped orthogonal route.
  return autoOrthogonal(start, end);
}

/**
 * Auto-orthogonal routing (no waypoints).
 * Creates an elbow connector: H → V (or V → H depending on direction).
 */
function autoOrthogonal(start: Vec2, end: Vec2): EdgePathResult {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);

  let d: string;
  let mid: Vec2;

  if (dx >= dy) {
    // Horizontal-first elbow:  start → (midX, start.y) → (midX, end.y) → end
    const midX = (start.x + end.x) / 2;
    d = `M ${start.x} ${start.y} L ${midX} ${start.y} L ${midX} ${end.y} L ${end.x} ${end.y}`;
    mid = { x: midX, y: (start.y + end.y) / 2 };
  } else {
    // Vertical-first elbow:  start → (start.x, midY) → (end.x, midY) → end
    const midY = (start.y + end.y) / 2;
    d = `M ${start.x} ${start.y} L ${start.x} ${midY} L ${end.x} ${midY} L ${end.x} ${end.y}`;
    mid = { x: (start.x + end.x) / 2, y: midY };
  }

  return { d, mid };
}

/**
 * Orthogonal routing through user-specified waypoints.
 * Each waypoint pair is connected by an elbow (H-V or V-H).
 */
function orthogonalThroughWaypoints(
  start: Vec2,
  end: Vec2,
  waypoints: Vec2[]
): EdgePathResult {
  const allPts = [start, ...waypoints, end];
  let d = `M ${allPts[0]!.x} ${allPts[0]!.y}`;

  for (let i = 1; i < allPts.length; i++) {
    const prev = allPts[i - 1]!;
    const cur = allPts[i]!;
    // Elbow: go horizontal first, then vertical
    d += ` L ${cur.x} ${prev.y} L ${cur.x} ${cur.y}`;
  }

  const midIdx = Math.floor(allPts.length / 2);
  const mid: Vec2 = {
    x: (allPts[midIdx - 1]!.x + allPts[midIdx]!.x) / 2,
    y: (allPts[midIdx - 1]!.y + allPts[midIdx]!.y) / 2,
  };

  return { d, mid };
}

// ── Shared helpers ──────────────────────────────────────────────────────────

/** Midpoint along a polyline by arc length (point at half the total path length). */
function polylineMidpoint(pts: Vec2[]): Vec2 {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return pts[0]!;
  if (pts.length === 2) {
    return {
      x: (pts[0]!.x + pts[1]!.x) / 2,
      y: (pts[0]!.y + pts[1]!.y) / 2,
    };
  }

  // Walk segments, find the point at half the total length.
  let totalLen = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i]!.x - pts[i - 1]!.x;
    const dy = pts[i]!.y - pts[i - 1]!.y;
    totalLen += Math.sqrt(dx * dx + dy * dy);
  }

  const half = totalLen / 2;
  let accumulated = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i]!.x - pts[i - 1]!.x;
    const dy = pts[i]!.y - pts[i - 1]!.y;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    if (accumulated + segLen >= half) {
      const t = segLen === 0 ? 0 : (half - accumulated) / segLen;
      return {
        x: pts[i - 1]!.x + dx * t,
        y: pts[i - 1]!.y + dy * t,
      };
    }
    accumulated += segLen;
  }

  return pts[pts.length - 1]!;
}
