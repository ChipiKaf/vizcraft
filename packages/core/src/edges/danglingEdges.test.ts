// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { viz } from '../builder';
import { computeEdgeEndpoints, computeEdgePath } from './paths';
import { hitTestRect, edgeDistance } from '../interaction/hitTest';
import type { VizEdge, VizNode } from '../types';

describe('Dangling edges — types & build', () => {
  it('builds a scene with a toAt-only dangling edge', () => {
    const scene = viz()
      .view(400, 400)
      .node('a', { at: { x: 50, y: 50 }, circle: { r: 20 } })
      .danglingEdge('drag-1', {
        toAt: { x: 300, y: 300 },
      })
      .build();

    const edge = scene.edges.find((e) => e.id === 'drag-1');
    expect(edge).toBeDefined();
    expect(edge?.toAt).toEqual({ x: 300, y: 300 });
    expect(edge?.from).toBeUndefined();
    expect(edge?.to).toBeUndefined();
  });

  it('builds a scene with a from + toAt dangling edge', () => {
    const scene = viz()
      .view(400, 400)
      .node('a', { at: { x: 50, y: 50 }, circle: { r: 20 } })
      .edge('a', '', 'drag-2')
      .toAt({ x: 300, y: 300 })
      .done()
      .build();

    const edge = scene.edges.find((e) => e.id === 'drag-2');
    expect(edge).toBeDefined();
    expect(edge?.from).toBe('a');
    expect(edge?.toAt).toEqual({ x: 300, y: 300 });
  });

  it('danglingEdge fluent API sets fromAt and toAt', () => {
    const scene = viz()
      .view(400, 400)
      .danglingEdge('free-1')
      .fromAt({ x: 10, y: 20 })
      .toAt({ x: 100, y: 200 })
      .done()
      .build();

    const edge = scene.edges.find((e) => e.id === 'free-1');
    expect(edge).toBeDefined();
    expect(edge?.fromAt).toEqual({ x: 10, y: 20 });
    expect(edge?.toAt).toEqual({ x: 100, y: 200 });
    expect(edge?.from).toBeUndefined();
    expect(edge?.to).toBeUndefined();
  });

  it('danglingEdge declarative opts sets fromAt and toAt', () => {
    const scene = viz()
      .view(400, 400)
      .danglingEdge('free-2', {
        fromAt: { x: 10, y: 20 },
        toAt: { x: 100, y: 200 },
        stroke: 'red',
      })
      .build();

    const edge = scene.edges.find((e) => e.id === 'free-2');
    expect(edge).toBeDefined();
    expect(edge?.fromAt).toEqual({ x: 10, y: 20 });
    expect(edge?.toAt).toEqual({ x: 100, y: 200 });
    expect(edge?.style?.stroke).toBe('red');
  });

  it('build() does not warn for dangling edges with no node ids', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    viz()
      .view(400, 400)
      .node('a', { at: { x: 50, y: 50 }, circle: { r: 20 } })
      .danglingEdge('drag', {
        fromAt: { x: 10, y: 10 },
        toAt: { x: 200, y: 200 },
      })
      .build();

    const edgeWarnings = warnSpy.mock.calls.filter(
      (args) =>
        typeof args[0] === 'string' && args[0].includes('missing source')
    );
    expect(edgeWarnings).toHaveLength(0);

    warnSpy.mockRestore();
  });
});

describe('computeEdgeEndpoints — dangling', () => {
  const nodeA: VizNode = {
    id: 'a',
    pos: { x: 50, y: 50 },
    shape: { kind: 'circle', r: 20 },
  };

  it('resolves free source endpoint from fromAt', () => {
    const edge: VizEdge = {
      id: 'e1',
      fromAt: { x: 10, y: 20 },
      to: 'a',
    };

    const { start, end } = computeEdgeEndpoints(null, nodeA, edge);
    expect(start).toEqual({ x: 10, y: 20 });
    // end should be a boundary point on nodeA, not the center
    expect(end).toBeDefined();
  });

  it('resolves free target endpoint from toAt', () => {
    const edge: VizEdge = {
      id: 'e2',
      from: 'a',
      toAt: { x: 300, y: 300 },
    };

    const { start, end } = computeEdgeEndpoints(nodeA, null, edge);
    expect(end).toEqual({ x: 300, y: 300 });
    expect(start).toBeDefined();
  });

  it('resolves both free endpoints', () => {
    const edge: VizEdge = {
      id: 'e3',
      fromAt: { x: 10, y: 20 },
      toAt: { x: 300, y: 300 },
    };

    const { start, end } = computeEdgeEndpoints(null, null, edge);
    expect(start).toEqual({ x: 10, y: 20 });
    expect(end).toEqual({ x: 300, y: 300 });
  });

  it('connected edge still works (backward compat)', () => {
    const nodeB: VizNode = {
      id: 'b',
      pos: { x: 200, y: 200 },
      shape: { kind: 'circle', r: 20 },
    };
    const edge: VizEdge = { id: 'e4', from: 'a', to: 'b' };

    const { start, end } = computeEdgeEndpoints(nodeA, nodeB, edge);
    // Both should be boundary points (not centers)
    expect(start.x).not.toBe(50);
    expect(end.x).not.toBe(200);
  });
});

describe('computeEdgePath — dangling coords', () => {
  it('generates a straight path between two free points', () => {
    const result = computeEdgePath(
      { x: 10, y: 20 },
      { x: 300, y: 300 },
      'straight'
    );
    expect(result.d).toContain('M 10 20');
    expect(result.d).toContain('L 300 300');
  });
});

describe('Hit testing — dangling edges', () => {
  it('edgeDistance works for a fully-free edge', () => {
    const scene = viz()
      .view(400, 400)
      .danglingEdge('free', {
        fromAt: { x: 0, y: 0 },
        toAt: { x: 400, y: 400 },
      })
      .build();

    // Point near the diagonal should be close
    const dist = edgeDistance(scene, 'free', { x: 200, y: 200 });
    expect(dist).toBeLessThan(5);

    // Point far from the diagonal should be distant
    const farDist = edgeDistance(scene, 'free', { x: 0, y: 400 });
    expect(farDist).toBeGreaterThan(100);
  });

  it('edgeDistance works for a from-node + toAt edge', () => {
    const scene = viz()
      .view(400, 400)
      .node('a', { at: { x: 50, y: 50 }, circle: { r: 20 } })
      .edge('a', '', 'half')
      .toAt({ x: 350, y: 350 })
      .done()
      .build();

    const dist = edgeDistance(scene, 'half', { x: 200, y: 200 });
    expect(dist).toBeLessThan(15);
  });

  it('hitTestRect includes dangling edges', () => {
    const scene = viz()
      .view(400, 400)
      .danglingEdge('free-edge', {
        fromAt: { x: 100, y: 100 },
        toAt: { x: 300, y: 300 },
      })
      .build();

    const results = hitTestRect(scene, { x: 50, y: 50, w: 300, h: 300 });
    const edgeHits = results.filter((r) => r.type === 'edge');
    expect(edgeHits.length).toBeGreaterThanOrEqual(1);
    expect(edgeHits[0]?.id).toBe('free-edge');
  });
});

describe('SVG export — dangling edges', () => {
  it('svg() renders a dangling edge path from node to free point', () => {
    const output = viz()
      .view(400, 400)
      .node('a', { at: { x: 50, y: 50 }, circle: { r: 20 } })
      .edge('a', '', 'drag')
      .toAt({ x: 300, y: 300 })
      .done()
      .svg();

    expect(output).toContain('data-id="drag"');
  });

  it('svg() renders a fully-free dangling edge', () => {
    const output = viz()
      .view(400, 400)
      .danglingEdge('free', {
        fromAt: { x: 10, y: 10 },
        toAt: { x: 390, y: 390 },
      })
      .svg();

    expect(output).toContain('data-id="free"');
    expect(output).toContain('M ');
  });
});

describe('DOM mount — dangling edges', () => {
  it('mount() renders a dangling edge to the DOM', () => {
    const container = document.createElement('div');

    viz()
      .view(400, 400)
      .node('a', { at: { x: 50, y: 50 }, circle: { r: 20 } })
      .danglingEdge('drag')
      .fromAt({ x: 50, y: 50 })
      .toAt({ x: 300, y: 300 })
      .done()
      .mount(container);

    const edgeGroup = container.querySelector('[data-id="drag"]');
    expect(edgeGroup).toBeTruthy();

    const path = edgeGroup?.querySelector('[data-viz-role="edge-line"]');
    expect(path).toBeTruthy();
    expect(path?.getAttribute('d')).toBeTruthy();
  });

  it('mount() renders a node->free edge correctly', () => {
    const container = document.createElement('div');

    const b = viz()
      .view(400, 400)
      .node('a', { at: { x: 50, y: 50 }, circle: { r: 20 } });

    // Use edge with from='a' and toAt
    b.edge('a', '', 'conn').toAt({ x: 300, y: 300 }).done();
    b.mount(container);

    const edgeGroup = container.querySelector('[data-id="conn"]');
    expect(edgeGroup).toBeTruthy();
  });
});
