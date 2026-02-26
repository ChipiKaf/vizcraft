import type { LayoutAlgorithm, LayoutGraph, LayoutResult } from './types';

export interface CircularLayoutOptions {
  /** X coordinate of the center (default: 0) */
  cx?: number;
  /** Y coordinate of the center (default: 0) */
  cy?: number;
  /** Radius of the circle (default: 200) */
  radius?: number;
  /** Starting angle in degrees (default: 0) */
  startAngle?: number;
  /** Total angle span in degrees (default: 360) */
  sweep?: number;
}

/**
 * Arranges nodes in a circle.
 */
export const circularLayout: LayoutAlgorithm<CircularLayoutOptions> = (
  graph: LayoutGraph,
  options?: CircularLayoutOptions
): LayoutResult => {
  const { nodes } = graph;
  const cx = options?.cx ?? 0;
  const cy = options?.cy ?? 0;
  const radius = options?.radius ?? 200;
  const startAngle = options?.startAngle ?? 0;
  const sweep = options?.sweep ?? 360;

  const result: LayoutResult = { nodes: {} };

  if (nodes.length === 0) return result;
  if (nodes.length === 1) {
    const node = nodes[0];
    if (node) {
      result.nodes[node.id] = { x: cx, y: cy };
    }
    return result;
  }

  const isFullCircle = Math.abs(sweep) >= 360;
  // If we sweep a full 360, we divide by N (so the last node doesn't overlap the first).
  // If we sweep less than 360 (e.g. an arc), we divide by N-1 to put the endpoints exactly at the boundaries.
  const steps = isFullCircle ? nodes.length : Math.max(1, nodes.length - 1);
  const angleStep = sweep / steps;

  nodes.forEach((node, i) => {
    const angleDeg = startAngle + i * angleStep;
    const angleRad = (angleDeg * Math.PI) / 180;

    result.nodes[node.id] = {
      x: cx + radius * Math.cos(angleRad),
      y: cy + radius * Math.sin(angleRad),
    };
  });

  return result;
};

export interface GridLayoutOptions {
  /** Number of columns (default: Math.ceil(sqrt(N))) */
  cols?: number;
  /** Start X coordinate (default: 0) */
  x?: number;
  /** Start Y coordinate (default: 0) */
  y?: number;
  /** Horizontal spacing (center-to-center) between nodes (default: 100) */
  colSpacing?: number;
  /** Vertical spacing (center-to-center) between nodes (default: 100) */
  rowSpacing?: number;
}

/**
 * Arranges nodes in a basic grid.
 */
export const gridLayout: LayoutAlgorithm<GridLayoutOptions> = (
  graph: LayoutGraph,
  options?: GridLayoutOptions
): LayoutResult => {
  const { nodes } = graph;
  const N = nodes.length;

  const result: LayoutResult = { nodes: {} };
  if (N === 0) return result;

  const cols = options?.cols ?? Math.ceil(Math.sqrt(N));
  const startX = options?.x ?? 0;
  const startY = options?.y ?? 0;
  const colSpacing = options?.colSpacing ?? 100;
  const rowSpacing = options?.rowSpacing ?? 100;

  nodes.forEach((node, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);

    result.nodes[node.id] = {
      x: startX + col * colSpacing,
      y: startY + row * rowSpacing,
    };
  });

  return result;
};
