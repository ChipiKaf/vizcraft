import { describe, it, expect } from 'vitest';
import { viz } from '../builder';
import {
  resolveEdgeGeometry,
  resolveEdgeGeometryFromData,
} from './resolveEdgeGeometry';
import type { VizNode, VizEdge } from '../types';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal scene with two rectangular nodes and a connecting edge. */
function twoNodeScene() {
  return viz()
    .view(400, 400)
    .node('a', { at: { x: 50, y: 50 }, rect: { w: 40, h: 40 } })
    .node('b', { at: { x: 200, y: 200 }, rect: { w: 40, h: 40 } })
    .edge('a', 'b', 'e1')
    .done()
    .build();
}

describe('resolveEdgeGeometry', () => {
  it('returns null for a non-existent edge id', () => {
    const scene = twoNodeScene();
    expect(resolveEdgeGeometry(scene, 'nope')).toBeNull();
  });

  it('resolves geometry for a simple two-node edge', () => {
    const scene = twoNodeScene();
    const geo = resolveEdgeGeometry(scene, 'e1');

    expect(geo).not.toBeNull();
    expect(geo!.d).toContain('M');
    expect(geo!.isSelfLoop).toBe(false);
    expect(geo!.waypoints).toEqual([]);

    // mid should be somewhere between the two nodes
    expect(geo!.mid.x).toBeGreaterThan(50);
    expect(geo!.mid.x).toBeLessThan(200);
  });

  it('returns startAnchor and endAnchor as aliases of start/end', () => {
    const scene = twoNodeScene();
    const geo = resolveEdgeGeometry(scene, 'e1')!;

    expect(geo.startAnchor).toEqual(geo.start);
    expect(geo.endAnchor).toEqual(geo.end);
  });

  it('detects a self-loop edge', () => {
    const scene = viz()
      .view(400, 400)
      .node('a', { at: { x: 100, y: 100 }, rect: { w: 60, h: 60 } })
      .edge('a', 'a', 'loop')
      .done()
      .build();

    const geo = resolveEdgeGeometry(scene, 'loop');
    expect(geo).not.toBeNull();
    expect(geo!.isSelfLoop).toBe(true);
    expect(geo!.d).toContain('C'); // Self-loops use cubic bezier
  });

  it('handles dangling edge with fromAt only', () => {
    const scene = viz()
      .view(400, 400)
      .node('b', { at: { x: 200, y: 200 }, rect: { w: 40, h: 40 } })
      .danglingEdge('d1', { toId: 'b', fromAt: { x: 10, y: 10 } })
      .build();

    const geo = resolveEdgeGeometry(scene, 'd1');
    expect(geo).not.toBeNull();
    expect(geo!.isSelfLoop).toBe(false);
  });

  it('handles dangling edge with toAt only', () => {
    const scene = viz()
      .view(400, 400)
      .node('a', { at: { x: 50, y: 50 }, rect: { w: 40, h: 40 } })
      .danglingEdge('d2', { fromId: 'a', toAt: { x: 300, y: 300 } })
      .build();

    const geo = resolveEdgeGeometry(scene, 'd2');
    expect(geo).not.toBeNull();
    expect(geo!.isSelfLoop).toBe(false);
  });

  it('returns null when a referenced node id is missing', () => {
    // Create a scene, then fabricate an edge that references a non-existent node
    const scene = twoNodeScene();
    scene.edges.push({
      id: 'bad',
      from: 'a',
      to: 'nonexistent',
    });

    expect(resolveEdgeGeometry(scene, 'bad')).toBeNull();
  });

  it('handles curved routing', () => {
    const scene = viz()
      .view(400, 400)
      .node('a', { at: { x: 50, y: 50 }, rect: { w: 40, h: 40 } })
      .node('b', { at: { x: 200, y: 200 }, rect: { w: 40, h: 40 } })
      .edge('a', 'b', 'curved-e')
      .routing('curved')
      .done()
      .build();

    const geo = resolveEdgeGeometry(scene, 'curved-e');
    expect(geo).not.toBeNull();
    expect(geo!.d).toContain('Q'); // Quadratic bezier for auto-curved
  });

  it('handles orthogonal routing', () => {
    const scene = viz()
      .view(400, 400)
      .node('a', { at: { x: 50, y: 50 }, rect: { w: 40, h: 40 } })
      .node('b', { at: { x: 200, y: 200 }, rect: { w: 40, h: 40 } })
      .edge('a', 'b', 'orth-e')
      .routing('orthogonal')
      .done()
      .build();

    const geo = resolveEdgeGeometry(scene, 'orth-e');
    expect(geo).not.toBeNull();
    // Orthogonal generates L-shaped path segments
    expect(geo!.d).toContain('L');
  });

  it('passes through waypoints in the result', () => {
    const scene = viz()
      .view(400, 400)
      .node('a', { at: { x: 50, y: 50 }, rect: { w: 40, h: 40 } })
      .node('b', { at: { x: 200, y: 200 }, rect: { w: 40, h: 40 } })
      .edge('a', 'b', 'wp-e')
      .via(100, 50)
      .via(100, 200)
      .done()
      .build();

    const geo = resolveEdgeGeometry(scene, 'wp-e');
    expect(geo).not.toBeNull();
    expect(geo!.waypoints).toEqual([
      { x: 100, y: 50 },
      { x: 100, y: 200 },
    ]);
  });
});

describe('resolveEdgeGeometryFromData', () => {
  it('resolves when given an edge and a node map directly', () => {
    const nodeA: VizNode = {
      id: 'a',
      pos: { x: 0, y: 0 },
      shape: { kind: 'rect', w: 60, h: 40 },
    };
    const nodeB: VizNode = {
      id: 'b',
      pos: { x: 200, y: 100 },
      shape: { kind: 'rect', w: 60, h: 40 },
    };
    const edge: VizEdge = { id: 'e', from: 'a', to: 'b' };
    const nodesById = new Map<string, VizNode>([
      ['a', nodeA],
      ['b', nodeB],
    ]);

    const geo = resolveEdgeGeometryFromData(edge, nodesById);
    expect(geo).not.toBeNull();
    expect(geo!.isSelfLoop).toBe(false);
    expect(geo!.d).toBeTruthy();
  });

  it('returns null for fully unconnected edge', () => {
    const edge: VizEdge = { id: 'orphan' };
    const geo = resolveEdgeGeometryFromData(edge, new Map());
    expect(geo).toBeNull();
  });
});
