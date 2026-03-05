import { describe, expect, it } from 'vitest';
import { circularLayout, gridLayout } from './layouts';
import { LayoutGraph, VizNode } from './types';

function createMockNodes(count: number): VizNode[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    pos: { x: 0, y: 0 },
    shape: { kind: 'circle', r: 10 },
  }));
}

describe('Layout Algorithms', () => {
  describe('circularLayout', () => {
    it('returns empty result for empty graph', () => {
      const graph: LayoutGraph = { nodes: [], edges: [] };
      const result = circularLayout(graph);
      expect(result.nodes).toEqual({});
    });

    it('positions a single node at the center', () => {
      const graph: LayoutGraph = { nodes: createMockNodes(1), edges: [] };
      const result = circularLayout(graph, { cx: 50, cy: 50 });
      expect(result.nodes['n0']).toEqual({ x: 50, y: 50 });
    });

    it('positions nodes in a circle', () => {
      const graph: LayoutGraph = { nodes: createMockNodes(4), edges: [] };
      // 4 nodes in a full circle (sweep = 360). Angle step = 90 deg.
      const result = circularLayout(graph, { cx: 0, cy: 0, radius: 100 });

      // Node 0: 0 deg -> (100, 0)
      expect(result.nodes['n0'].x).toBeCloseTo(100);
      expect(result.nodes['n0'].y).toBeCloseTo(0);

      // Node 1: 90 deg -> (0, 100)
      expect(result.nodes['n1'].x).toBeCloseTo(0);
      expect(result.nodes['n1'].y).toBeCloseTo(100);

      // Node 2: 180 deg -> (-100, 0)
      expect(result.nodes['n2'].x).toBeCloseTo(-100);
      expect(result.nodes['n2'].y).toBeCloseTo(0);

      // Node 3: 270 deg -> (0, -100)
      expect(result.nodes['n3'].x).toBeCloseTo(0);
      expect(result.nodes['n3'].y).toBeCloseTo(-100);
    });
  });

  describe('gridLayout', () => {
    it('returns empty result for empty graph', () => {
      const graph: LayoutGraph = { nodes: [], edges: [] };
      const result = gridLayout(graph);
      expect(result.nodes).toEqual({});
    });

    it('positions nodes in a grid', () => {
      const graph: LayoutGraph = { nodes: createMockNodes(4), edges: [] };
      // 4 nodes -> automatically 2 cols, 2 rows
      const result = gridLayout(graph, {
        x: 0,
        y: 0,
        colSpacing: 50,
        rowSpacing: 50,
      });

      // Col 0, Row 0
      expect(result.nodes['n0']).toEqual({ x: 0, y: 0 });
      // Col 1, Row 0
      expect(result.nodes['n1']).toEqual({ x: 50, y: 0 });
      // Col 0, Row 1
      expect(result.nodes['n2']).toEqual({ x: 0, y: 50 });
      // Col 1, Row 1
      expect(result.nodes['n3']).toEqual({ x: 50, y: 50 });
    });

    it('allows customized column count', () => {
      const graph: LayoutGraph = { nodes: createMockNodes(6), edges: [] };
      const result = gridLayout(graph, {
        cols: 3,
        x: 10,
        y: 10,
        colSpacing: 10,
        rowSpacing: 20,
      });

      // Node 5 should be col 2, row 1
      // x = 10 + 2*10 = 30
      // y = 10 + 1*20 = 30
      expect(result.nodes['n5']).toEqual({ x: 30, y: 30 });
    });
  });
});
