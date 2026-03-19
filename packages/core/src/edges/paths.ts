/**
 * Edge path computation helpers.
 *
 * Given start/end points, routing mode, and optional waypoints this module
 * produces:
 *   1. An SVG `d` attribute string (for `<path>` elements).
 *   2. A midpoint along the path (for label positioning).
 */

import type { Vec2, VizNode, VizEdge, EdgeRouting, NodeShape } from '../types';
import {
  computeNodeAnchor,
  computeNodeAnchorAtAngle,
  effectivePos,
  effectiveShape,
  getNodeBoundingBox,
  resolvePortPosition,
} from '../shapes/geometry';

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Return the angle (VizCraft degrees: 0 = right, 90 = down) from `from` to `to`.
 *
 * Useful for computing `fromAngle` / `toAngle` so an edge exits a node's
 * perimeter aimed straight at another point.
 *
 * @example
 * ```ts
 * import { angleBetween } from 'vizcraft';
 * const angle = angleBetween(sourceNode.pos, targetNode.pos);
 * eb.fromAngle(angle).toAngle(angle + 180);
 * ```
 */
export function angleBetween(from: Vec2, to: Vec2): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

export interface EdgePathResult {
  /** SVG path `d` attribute. */
  d: string;
  /** Approximate label position along the path (exact for straight/quadratic, approximated for spline and orthogonal-with-waypoints paths). */
  mid: Vec2;
  /** Position near the source end (~15% along the path). */
  start: Vec2;
  /** Position near the target end (~85% along the path). */
  end: Vec2;
}

/**
 * Compute anchor-resolved start/end points for an edge.
 *
 * When an edge specifies `fromPort` / `toPort`, the endpoint is resolved
 * to the port's absolute position. Otherwise the legacy `anchor` mode
 * (`'center'` | `'boundary'`) is used.
 *
 * Accepts `null` for either node to support dangling edges.
 *
 * This replicates the logic used internally by the core builder and
 * runtime patcher so that external renderers (e.g. React) can
 * resolve boundary anchors consistently.
 */
export function computeEdgeEndpoints(
  start: VizNode | null,
  end: VizNode | null,
  edge: VizEdge
): { start: Vec2; end: Vec2 } {
  const anchor = edge.anchor ?? 'boundary';

  const freeStart: Vec2 | undefined = edge.fromAt;
  const freeEnd: Vec2 | undefined = edge.toAt;

  // Determine the "other" position for anchor resolution.
  // When waypoints exist, use the nearest waypoint as the direction reference
  // so that bundled edges sharing the same convergence waypoint resolve to
  // the same perimeter anchor point on the node.
  const wps = edge.waypoints;
  const endTarget: Vec2 =
    wps && wps.length > 0
      ? wps[0]!
      : end
        ? effectivePos(end)
        : (freeEnd ?? { x: 0, y: 0 });
  const startTarget: Vec2 =
    wps && wps.length > 0
      ? wps[wps.length - 1]!
      : start
        ? effectivePos(start)
        : (freeStart ?? { x: 0, y: 0 });

  // Auto-compute straight-line angles when requested.
  // Strategy: find horizontal or vertical overlap between the two node
  // bounding boxes and route the edge through the overlap midpoint so it
  // drops perfectly vertically (or runs perfectly horizontally).  When the
  // boxes don't overlap on either axis, fall back to the center-to-center
  // diagonal.
  let effectiveFromAngle = edge.fromAngle;
  let effectiveToAngle = edge.toAngle;
  if (edge.straightLine && start && end) {
    const startPos = effectivePos(start);
    const endPos = effectivePos(end);
    const startBB = getNodeBoundingBox(effectiveShape(start));
    const endBB = getNodeBoundingBox(effectiveShape(end));
    const sHW = startBB.width / 2;
    const sHH = startBB.height / 2;
    const eHW = endBB.width / 2;
    const eHH = endBB.height / 2;

    // Check horizontal overlap → vertical edge
    const overlapLeft = Math.max(startPos.x - sHW, endPos.x - eHW);
    const overlapRight = Math.min(startPos.x + sHW, endPos.x + eHW);
    // Check vertical overlap → horizontal edge
    const overlapTop = Math.max(startPos.y - sHH, endPos.y - eHH);
    const overlapBottom = Math.min(startPos.y + sHH, endPos.y + eHH);

    if (overlapLeft < overlapRight) {
      // Horizontal overlap exists → route vertically through the midpoint
      const midX = (overlapLeft + overlapRight) / 2;
      const isStartAbove = startPos.y <= endPos.y;
      const fromAngle =
        (Math.atan2(isStartAbove ? sHH : -sHH, midX - startPos.x) * 180) /
        Math.PI;
      const toAngle =
        (Math.atan2(isStartAbove ? -eHH : eHH, midX - endPos.x) * 180) /
        Math.PI;
      if (
        (edge.straightLine === true || edge.straightLine === 'from') &&
        effectiveFromAngle === undefined
      ) {
        effectiveFromAngle = fromAngle;
      }
      if (
        (edge.straightLine === true || edge.straightLine === 'to') &&
        effectiveToAngle === undefined
      ) {
        effectiveToAngle = toAngle;
      }
    } else if (overlapTop < overlapBottom) {
      // Vertical overlap exists → route horizontally through the midpoint
      const midY = (overlapTop + overlapBottom) / 2;
      const isStartLeft = startPos.x <= endPos.x;
      const fromAngle =
        (Math.atan2(midY - startPos.y, isStartLeft ? sHW : -sHW) * 180) /
        Math.PI;
      const toAngle =
        (Math.atan2(midY - endPos.y, isStartLeft ? -eHW : eHW) * 180) / Math.PI;
      if (
        (edge.straightLine === true || edge.straightLine === 'from') &&
        effectiveFromAngle === undefined
      ) {
        effectiveFromAngle = fromAngle;
      }
      if (
        (edge.straightLine === true || edge.straightLine === 'to') &&
        effectiveToAngle === undefined
      ) {
        effectiveToAngle = toAngle;
      }
    } else {
      // No overlap — fall back to center-to-center diagonal
      const angle = angleBetween(startPos, endPos);
      if (
        (edge.straightLine === true || edge.straightLine === 'from') &&
        effectiveFromAngle === undefined
      ) {
        effectiveFromAngle = angle;
      }
      if (
        (edge.straightLine === true || edge.straightLine === 'to') &&
        effectiveToAngle === undefined
      ) {
        effectiveToAngle = angle + 180;
      }
    }
  }

  // Source endpoint
  let startAnchor: Vec2;
  if (start) {
    if (effectiveFromAngle !== undefined) {
      startAnchor = computeNodeAnchorAtAngle(start, effectiveFromAngle);
    } else {
      startAnchor = edge.fromPort
        ? (resolvePortPosition(start, edge.fromPort) ??
          computeNodeAnchor(start, endTarget, anchor))
        : computeNodeAnchor(start, endTarget, anchor);
    }
  } else {
    startAnchor = freeStart ?? { x: 0, y: 0 };
  }

  // Target endpoint
  let endAnchor: Vec2;
  if (end) {
    if (effectiveToAngle !== undefined) {
      endAnchor = computeNodeAnchorAtAngle(end, effectiveToAngle);
    } else {
      endAnchor = edge.toPort
        ? (resolvePortPosition(end, edge.toPort) ??
          computeNodeAnchor(end, startTarget, anchor))
        : computeNodeAnchor(end, startTarget, anchor);
    }
  } else {
    endAnchor = freeEnd ?? { x: 0, y: 0 };
  }

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
  const positions = polylineLabelPositions(pts);
  return {
    d: segments.join(' '),
    ...positions,
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
  const mid = quadraticAt(start, cp, end, 0.5);
  const startPos = quadraticAt(start, cp, end, LABEL_FRACTION_START);
  const endPos = quadraticAt(start, cp, end, LABEL_FRACTION_END);
  return { d, mid, start: startPos, end: endPos };
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

/** Point on a quadratic bezier at parameter t (0–1). */
function quadraticAt(p0: Vec2, cp: Vec2, p1: Vec2, t: number): Vec2 {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * cp.x + t * t * p1.x,
    y: mt * mt * p0.y + 2 * mt * t * cp.y + t * t * p1.y,
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
      mid: quadraticAt(start, cp, end, 0.5),
      start: quadraticAt(start, cp, end, LABEL_FRACTION_START),
      end: quadraticAt(start, cp, end, LABEL_FRACTION_END),
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

  // Approximate label positions using the through-points polyline
  const positions = polylineLabelPositions(allPts);

  return { d, ...positions };
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
  let startPos: Vec2;
  let endPos: Vec2;

  if (dx >= dy) {
    // Horizontal-first elbow:  start → (midX, start.y) → (midX, end.y) → end
    const midX = (start.x + end.x) / 2;
    d = `M ${start.x} ${start.y} L ${midX} ${start.y} L ${midX} ${end.y} L ${end.x} ${end.y}`;
    const pts: Vec2[] = [
      start,
      { x: midX, y: start.y },
      { x: midX, y: end.y },
      end,
    ];
    mid = polylinePointAt(pts, 0.5);
    startPos = polylinePointAt(pts, LABEL_FRACTION_START);
    endPos = polylinePointAt(pts, LABEL_FRACTION_END);
  } else {
    // Vertical-first elbow:  start → (start.x, midY) → (end.x, midY) → end
    const midY = (start.y + end.y) / 2;
    d = `M ${start.x} ${start.y} L ${start.x} ${midY} L ${end.x} ${midY} L ${end.x} ${end.y}`;
    const pts: Vec2[] = [
      start,
      { x: start.x, y: midY },
      { x: end.x, y: midY },
      end,
    ];
    mid = polylinePointAt(pts, 0.5);
    startPos = polylinePointAt(pts, LABEL_FRACTION_START);
    endPos = polylinePointAt(pts, LABEL_FRACTION_END);
  }

  return { d, mid, start: startPos, end: endPos };
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

  // Build the actual rendered points (including elbow intermediaries)
  const renderedPts: Vec2[] = [allPts[0]!];
  for (let i = 1; i < allPts.length; i++) {
    const prev = allPts[i - 1]!;
    const cur = allPts[i]!;
    // Elbow: go horizontal first, then vertical
    d += ` L ${cur.x} ${prev.y} L ${cur.x} ${cur.y}`;
    renderedPts.push({ x: cur.x, y: prev.y });
    renderedPts.push(cur);
  }

  const positions = polylineLabelPositions(renderedPts);
  return { d, ...positions };
}

// ── Shared helpers ──────────────────────────────────────────────────────────

/** Fraction along the path for each label position. */
const LABEL_FRACTION_START = 0.15;
const LABEL_FRACTION_END = 0.85;

/**
 * Point along a polyline at a given fraction (0–1) of total arc length.
 * Fraction 0 = first point, 1 = last point.
 */
function polylinePointAt(pts: Vec2[], fraction: number): Vec2 {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return pts[0]!;

  let totalLen = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i]!.x - pts[i - 1]!.x;
    const dy = pts[i]!.y - pts[i - 1]!.y;
    totalLen += Math.sqrt(dx * dx + dy * dy);
  }

  const target = totalLen * fraction;
  let accumulated = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i]!.x - pts[i - 1]!.x;
    const dy = pts[i]!.y - pts[i - 1]!.y;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    if (accumulated + segLen >= target) {
      const t = segLen === 0 ? 0 : (target - accumulated) / segLen;
      return {
        x: pts[i - 1]!.x + dx * t,
        y: pts[i - 1]!.y + dy * t,
      };
    }
    accumulated += segLen;
  }

  return pts[pts.length - 1]!;
}

/** Shorthand: compute start, mid, end label positions for a polyline. */
function polylineLabelPositions(pts: Vec2[]): {
  start: Vec2;
  mid: Vec2;
  end: Vec2;
} {
  return {
    start: polylinePointAt(pts, LABEL_FRACTION_START),
    mid: polylinePointAt(pts, 0.5),
    end: polylinePointAt(pts, LABEL_FRACTION_END),
  };
}

// ── Self Loops ──────────────────────────────────────────────────────────────

/** Helper to estimate a shape's bounding box dimensions. */
function estimateNodeDims(shape: NodeShape): { w: number; h: number } {
  if (!shape) return { w: 60, h: 60 };
  if ('w' in shape && 'h' in shape) return { w: shape.w, h: shape.h };
  if ('r' in shape) return { w: shape.r * 2, h: shape.r * 2 };
  if ('rx' in shape && 'ry' in shape)
    return { w: shape.rx * 2, h: shape.ry * 2 };
  if ('size' in shape) return { w: shape.size, h: shape.size };
  return { w: 60, h: 60 };
}

/** Extends EdgePathResult with true boundary exit/entry points for self-loops. */
export interface SelfLoopResult extends EdgePathResult {
  /** Boundary point where the loop departs the node. */
  exitPoint: Vec2;
  /** Boundary point where the loop returns to the node. */
  entryPoint: Vec2;
}

/**
 * Compute the SVG path and positions for a self-loop edge.
 * Exits and enters the same node on the specified side.
 */
export function computeSelfLoop(node: VizNode, edge: VizEdge): SelfLoopResult {
  const c = effectivePos(node);
  const dims = estimateNodeDims(effectiveShape(node));
  const w = dims.w;
  const h = dims.h;

  const side = edge.loopSide || 'top';
  const size = edge.loopSize || 30;
  // How wide the loop sits at the base (gap between exit and entry)
  const spread = Math.min(
    20,
    (side === 'top' || side === 'bottom' ? w : h) * 0.8
  );

  let d = '';
  let start: Vec2, mid: Vec2, end: Vec2;
  let exitPt: Vec2, entryPt: Vec2;

  switch (side) {
    case 'top': {
      const sx = c.x - spread / 2;
      const sy = c.y - h / 2;
      const ex = c.x + spread / 2;
      const ey = c.y - h / 2;
      const cpY = sy - size * 1.5;
      d = `M ${sx} ${sy} C ${sx - spread / 2} ${cpY}, ${ex + spread / 2} ${cpY}, ${ex} ${ey}`;
      exitPt = { x: sx, y: sy };
      entryPt = { x: ex, y: ey };
      start = { x: sx, y: sy - size * 0.2 };
      mid = { x: c.x, y: sy - size };
      end = { x: ex, y: ey - size * 0.2 };
      break;
    }
    case 'bottom': {
      const sx = c.x - spread / 2;
      const sy = c.y + h / 2;
      const ex = c.x + spread / 2;
      const ey = c.y + h / 2;
      const cpY = sy + size * 1.5;
      d = `M ${sx} ${sy} C ${sx - spread / 2} ${cpY}, ${ex + spread / 2} ${cpY}, ${ex} ${ey}`;
      exitPt = { x: sx, y: sy };
      entryPt = { x: ex, y: ey };
      start = { x: sx, y: sy + size * 0.2 };
      mid = { x: c.x, y: sy + size };
      end = { x: ex, y: ey + size * 0.2 };
      break;
    }
    case 'left': {
      const sx = c.x - w / 2;
      const sy = c.y - spread / 2;
      const ex = c.x - w / 2;
      const ey = c.y + spread / 2;
      const cpX = sx - size * 1.5;
      d = `M ${sx} ${sy} C ${cpX} ${sy - spread / 2}, ${cpX} ${ey + spread / 2}, ${ex} ${ey}`;
      exitPt = { x: sx, y: sy };
      entryPt = { x: ex, y: ey };
      start = { x: sx - size * 0.2, y: sy };
      mid = { x: sx - size, y: c.y };
      end = { x: ex - size * 0.2, y: ey };
      break;
    }
    case 'right': {
      const sx = c.x + w / 2;
      const sy = c.y - spread / 2;
      const ex = c.x + w / 2;
      const ey = c.y + spread / 2;
      const cpX = sx + size * 1.5;
      d = `M ${sx} ${sy} C ${cpX} ${sy - spread / 2}, ${cpX} ${ey + spread / 2}, ${ex} ${ey}`;
      exitPt = { x: sx, y: sy };
      entryPt = { x: ex, y: ey };
      start = { x: sx + size * 0.2, y: sy };
      mid = { x: sx + size, y: c.y };
      end = { x: ex + size * 0.2, y: ey };
      break;
    }
  }

  return { d, start, mid, end, exitPoint: exitPt, entryPoint: entryPt };
}
