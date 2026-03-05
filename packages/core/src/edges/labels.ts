import type { EdgeLabel, VizEdge } from './types';
import type { EdgePathResult } from './edgePaths';

/**
 * Resolve the (x, y) position of an edge label given an EdgePathResult.
 * Falls back to `mid` for unknown positions.
 */
export function resolveEdgeLabelPosition(
  lbl: EdgeLabel,
  path: EdgePathResult
): { x: number; y: number } {
  const base =
    lbl.position === 'start'
      ? path.start
      : lbl.position === 'end'
        ? path.end
        : path.mid;
  return {
    x: base.x + (lbl.dx || 0),
    y: base.y + (lbl.dy || 0),
  };
}

/**
 * Collect all labels for an edge, preferring `labels[]` when present
 * and falling back to the legacy `label` field.
 */
export function collectEdgeLabels(edge: VizEdge): EdgeLabel[] {
  if (edge.labels && edge.labels.length > 0) return edge.labels;
  if (edge.label) return [edge.label];
  return [];
}
