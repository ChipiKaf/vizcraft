/** Resolves full rendered geometry for an edge in a single call. @module */

import type { Vec2, VizScene, VizEdge, VizNode } from '../types';
import type { EdgePathResult } from './paths';
import {
  computeEdgeEndpoints,
  computeEdgePath,
  computeSelfLoop,
} from './paths';

/** Fully resolved edge geometry. Extends `EdgePathResult` with anchor and label positions. */
export interface ResolvedEdgeGeometry extends EdgePathResult {
  /** Boundary/port position where the edge exits the source node. */
  startAnchor: Vec2;
  /** Boundary/port position where the edge enters the target node. */
  endAnchor: Vec2;
  /** Label position ~15% along the path (alias of `start`). */
  startLabel: Vec2;
  /** Label position ~85% along the path (alias of `end`). */
  endLabel: Vec2;
  /** Waypoints used for the path (empty array when none). */
  waypoints: Vec2[];
  /** Whether this edge is a self-loop. */
  isSelfLoop: boolean;
}

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
 * Resolve geometry from an edge + a pre-built node map.
 * Prefer {@link resolveEdgeGeometry} unless you already hold the map.
 * @internal
 */
export function resolveEdgeGeometryFromData(
  edge: VizEdge,
  nodesById: Map<string, VizNode>
): ResolvedEdgeGeometry | null {
  const startNode = edge.from ? (nodesById.get(edge.from) ?? null) : null;
  const endNode = edge.to ? (nodesById.get(edge.to) ?? null) : null;

  if (edge.from && !startNode) return null;
  if (edge.to && !endNode) return null;
  if (!startNode && !edge.fromAt && !endNode && !edge.toAt) return null;

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
