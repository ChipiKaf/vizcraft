import { describe, expect, it } from 'vitest';
import { circularLayout, gridLayout } from './algorithms';
import { LayoutGraph, LayoutResult, VizNode } from '../types';
import { getNodeBoundingBox } from '../shapes/geometry';

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

describe('getNodeBoundingBox', () => {
  it('returns correct size for circle', () => {
    expect(getNodeBoundingBox({ kind: 'circle', r: 25 })).toEqual({
      width: 50,
      height: 50,
    });
  });

  it('returns correct size for rect', () => {
    expect(getNodeBoundingBox({ kind: 'rect', w: 120, h: 60 })).toEqual({
      width: 120,
      height: 60,
    });
  });

  it('returns correct size for diamond', () => {
    expect(getNodeBoundingBox({ kind: 'diamond', w: 80, h: 80 })).toEqual({
      width: 80,
      height: 80,
    });
  });

  it('returns correct size for ellipse', () => {
    expect(getNodeBoundingBox({ kind: 'ellipse', rx: 50, ry: 30 })).toEqual({
      width: 100,
      height: 60,
    });
  });

  it('returns correct size for hexagon (default pointy-top)', () => {
    const box = getNodeBoundingBox({ kind: 'hexagon', r: 40 });
    expect(box.width).toBeCloseTo(40 * Math.sqrt(3), 5);
    expect(box.height).toBeCloseTo(80, 5);
  });

  it('returns correct size for hexagon (flat-top)', () => {
    const box = getNodeBoundingBox({
      kind: 'hexagon',
      r: 40,
      orientation: 'flat',
    });
    expect(box.width).toBeCloseTo(80, 5);
    expect(box.height).toBeCloseTo(40 * Math.sqrt(3), 5);
  });

  it('returns correct size for star', () => {
    expect(getNodeBoundingBox({ kind: 'star', points: 5, outerR: 30 })).toEqual(
      { width: 60, height: 60 }
    );
  });

  it('returns correct size for trapezoid', () => {
    expect(
      getNodeBoundingBox({ kind: 'trapezoid', topW: 60, bottomW: 100, h: 50 })
    ).toEqual({ width: 100, height: 50 });
  });

  it('returns correct size for image shape', () => {
    expect(
      getNodeBoundingBox({ kind: 'image', href: 'x.png', w: 200, h: 150 })
    ).toEqual({ width: 200, height: 150 });
  });

  it('returns correct size for blockArrow (default right)', () => {
    expect(
      getNodeBoundingBox({
        kind: 'blockArrow',
        length: 100,
        bodyWidth: 30,
        headWidth: 50,
        headLength: 20,
      })
    ).toEqual({ width: 100, height: 50 });
  });

  it('returns correct size for blockArrow (up)', () => {
    expect(
      getNodeBoundingBox({
        kind: 'blockArrow',
        length: 100,
        bodyWidth: 30,
        headWidth: 50,
        headLength: 20,
        direction: 'up',
      })
    ).toEqual({ width: 50, height: 100 });
  });

  it('returns correct size for callout (default bottom pointer)', () => {
    expect(getNodeBoundingBox({ kind: 'callout', w: 100, h: 60 })).toEqual({
      width: 100,
      height: 60 + Math.round(60 * 0.25) * 2,
    });
  });

  it('returns correct size for callout (right pointer)', () => {
    expect(
      getNodeBoundingBox({
        kind: 'callout',
        w: 100,
        h: 60,
        pointerSide: 'right',
        pointerHeight: 20,
      })
    ).toEqual({ width: 140, height: 60 });
  });

  it('returns correct size for callout (explicit pointerHeight)', () => {
    expect(
      getNodeBoundingBox({
        kind: 'callout',
        w: 100,
        h: 60,
        pointerHeight: 30,
      })
    ).toEqual({ width: 100, height: 120 });
  });

  it('returns correct size for cylinder', () => {
    expect(getNodeBoundingBox({ kind: 'cylinder', w: 80, h: 100 })).toEqual({
      width: 80,
      height: 100,
    });
  });

  it('returns correct size for path shape', () => {
    expect(
      getNodeBoundingBox({ kind: 'path', d: 'M0 0', w: 60, h: 40 })
    ).toEqual({ width: 60, height: 40 });
  });
});

describe('Async LayoutAlgorithm support', () => {
  it('async layout algorithm satisfies LayoutAlgorithm type', async () => {
    const asyncLayout = async (graph: LayoutGraph): Promise<LayoutResult> => {
      // Simulate async work
      await Promise.resolve();
      const result: LayoutResult = { nodes: {} };
      graph.nodes.forEach((node, i) => {
        result.nodes[node.id] = { x: i * 100, y: 0 };
      });
      return result;
    };

    const graph: LayoutGraph = { nodes: createMockNodes(3), edges: [] };
    const result = await asyncLayout(graph);

    expect(result.nodes['n0']).toEqual({ x: 0, y: 0 });
    expect(result.nodes['n1']).toEqual({ x: 100, y: 0 });
    expect(result.nodes['n2']).toEqual({ x: 200, y: 0 });
  });

  it('sync layout algorithm still satisfies LayoutAlgorithm type', () => {
    // circularLayout is sync, verifying it still Type-checks as LayoutAlgorithm
    const graph: LayoutGraph = { nodes: createMockNodes(2), edges: [] };
    const result = circularLayout(graph, { radius: 50 });
    expect(Object.keys(result.nodes)).toHaveLength(2);
  });
});
