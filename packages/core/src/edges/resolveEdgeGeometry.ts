/**
 * Convenience function that resolves the full rendered geometry for an edge
 * in a single call. Handles node lookup, dangling edges, self-loop detection,
 * port/angle/boundary anchors, waypoints, and routing.
 *
 * @module
 */

import type { Vec2, VizScene, VizEdge, VizNode } from '../types';
import type { EdgePathResult } from './paths';
import {
  computeEdgeEndpoints,
  computeEdgePath,
  computeSelfLoop,
} from './paths';

// ── Public types ────────────────────────────────────────────────────────────

/**
 * Fully resolved edge geometry returned by {@link resolveEdgeGeometry}.
 *
 * Extends `EdgePathResult` with extra convenience fields so consumers
 * never need to orchestrate multiple helpers manually.
 */
export interface ResolvedEdgeGeometry extends EdgePathResult {
  /** True boundary/port position where the edge exits the source node. */
  startAnchor: Vec2;
  /** True boundary/port position where the edge enters the target node. */
  endAnchor: Vec2;
  /** Label position ~15% along the path (alias of `start` from EdgePathResult). */
  startLabel: Vec2;
  /** Label position ~85% along the path (alias of `end` from EdgePathResult). */
  endLabel: Vec2;
  /** Waypoints used for the path (empty array when none). */
  waypoints: Vec2[];
  /** Whether this edge is a self-loop (same source and target node). */
  isSelfLoop: boolean;
}

// ── Implementation ──────────────────────────────────────────────────────────

/**
 * Resolve all rendered geometry for a single edge in one call.
 *
 * Returns `null` when:
 * - The edge id is not found in the scene.
 * - A referenced `from` / `to` node id does not exist.
 * - Both endpoints are missing (no `from`/`to` and no `fromAt`/`toAt`).
 *
 * @example
 * ```ts
 * import { resolveEdgeGeometry } from 'vizcraft';
 *
 * const geo = resolveEdgeGeometry(scene, 'edge-1');
 * if (!geo) return;
 * overlay.setAttribute('d', geo.d);
 * positionToolbar(geo.mid);
 * ```
 */
export function resolveEdgeGeometry(
  scene: VizScene,
  edgeId: string
): ResolvedEdgeGeometry | null {
  const edge = scene.edges.find((e) => e.id === edgeId);
  if (!edge) return null;

  const nodesById = new Map<string, VizNode>(scene.nodes.map((n) => [n.id, n]));

  return resolveEdgeGeometryFromData(edge, nodesById);
}

/**
 * Lower-level helper: resolve geometry from an edge + a node lookup map.
 *
 * Useful when the caller already has a `Map` built (e.g. inside a render loop
 * processing many edges).
 *
 * @internal exported for advanced consumers and testing — prefer
 * {@link resolveEdgeGeometry} for typical usage.
 */
export function resolveEdgeGeometryFromData(
  edge: VizEdge,
  nodesById: Map<string, VizNode>
): ResolvedEdgeGeometry | null {
  // ── Node lookup (null-safe for dangling edges) ──────────────────────────
  const startNode = edge.from ? (nodesById.get(edge.from) ?? null) : null;
  const endNode = edge.to ? (nodesById.get(edge.to) ?? null) : null;

  // Bail out if a referenced node id doesn't exist.
  if (edge.from && !startNode) return null;
  if (edge.to && !endNode) return null;

  // Bail out if both endpoints are entirely unresolvable.
  if (!startNode && !edge.fromAt && !endNode && !edge.toAt) return null;

  // ── Self-loop detection ─────────────────────────────────────────────────
  const isSelfLoop = !!(startNode && endNode && startNode === endNode);

  let pathResult: EdgePathResult;
  let anchorStart: Vec2;
  let anchorEnd: Vec2;

  if (isSelfLoop) {
    const selfLoop = computeSelfLoop(startNode!, edge);
    pathResult = selfLoop;
    anchorStart = selfLoop.exitPoint;
    anchorEnd = selfLoop.entryPoint;
  } else {
    const endpoints = computeEdgeEndpoints(startNode, endNode, edge);
    pathResult = computeEdgePath(
      endpoints.start,
      endpoints.end,
      edge.routing,
      edge.waypoints
    );
    anchorStart = endpoints.start;
    anchorEnd = endpoints.end;
  }

  return {
    ...pathResult,
    startAnchor: anchorStart,
    endAnchor: anchorEnd,
    startLabel: pathResult.start,
    endLabel: pathResult.end,
    waypoints: edge.waypoints ?? [],
    isSelfLoop,
  };
}
