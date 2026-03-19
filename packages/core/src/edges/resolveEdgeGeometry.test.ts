import { describe, it, expect } from 'vitest';
import { viz } from '../builder';
import {
  resolveEdgeGeometry,
  resolveEdgeGeometryFromData,
} from './resolveEdgeGeometry';
import type { VizNode, VizEdge } from '../types';

/** Two rectangular nodes connected by a single edge. */
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

    expect(geo!.mid.x).toBeGreaterThan(50);
    expect(geo!.mid.x).toBeLessThan(200);
  });

  it('returns startAnchor/endAnchor as true boundary points, not label positions', () => {
    const scene = twoNodeScene();
    const geo = resolveEdgeGeometry(scene, 'e1')!;

    // Node A at (50,50) 40×40 → boundary [30,70]; Node B at (200,200) → [180,220]
    expect(geo.startAnchor.x).toBeGreaterThanOrEqual(30);
    expect(geo.startAnchor.x).toBeLessThanOrEqual(70);
    expect(geo.startAnchor.y).toBeGreaterThanOrEqual(30);
    expect(geo.startAnchor.y).toBeLessThanOrEqual(70);

    expect(geo.endAnchor.x).toBeGreaterThanOrEqual(180);
    expect(geo.endAnchor.x).toBeLessThanOrEqual(220);
    expect(geo.endAnchor.y).toBeGreaterThanOrEqual(180);
    expect(geo.endAnchor.y).toBeLessThanOrEqual(220);
  });

  it('returns startLabel/endLabel as the ~15%/~85% label positions', () => {
    const scene = twoNodeScene();
    const geo = resolveEdgeGeometry(scene, 'e1')!;

    expect(geo.startLabel).toEqual(geo.start);
    expect(geo.endLabel).toEqual(geo.end);

    expect(geo.startLabel.x).toBeGreaterThan(50);
    expect(geo.startLabel.x).toBeLessThan(200);
    expect(geo.endLabel.x).toBeGreaterThan(50);
    expect(geo.endLabel.x).toBeLessThan(200);
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
    expect(geo!.d).toContain('C');
  });

  it('returns boundary anchors and label positions for self-loop edges', () => {
    const scene = viz()
      .view(400, 400)
      .node('a', { at: { x: 100, y: 100 }, rect: { w: 60, h: 60 } })
      .edge('a', 'a', 'loop')
      .done()
      .build();

    const geo = resolveEdgeGeometry(scene, 'loop')!;

    // Rect at (100,100) 60×60 → boundary [70,130]
    expect(geo.startAnchor.x).toBeGreaterThanOrEqual(70);
    expect(geo.startAnchor.x).toBeLessThanOrEqual(130);
    expect(geo.startAnchor.y).toBeGreaterThanOrEqual(70);
    expect(geo.startAnchor.y).toBeLessThanOrEqual(130);

    expect(geo.endAnchor.x).toBeGreaterThanOrEqual(70);
    expect(geo.endAnchor.x).toBeLessThanOrEqual(130);
    expect(geo.endAnchor.y).toBeGreaterThanOrEqual(70);
    expect(geo.endAnchor.y).toBeLessThanOrEqual(130);

    expect(geo.startLabel).toEqual(geo.start);
    expect(geo.endLabel).toEqual(geo.end);
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
    expect(geo!.d).toContain('Q');
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

  it('uses first waypoint as direction reference for source boundary anchor', () => {
    // Node A at (0,100), waypoint at (100,100) — directly to the right.
    // Without waypoints, boundary would aim toward node B at (200,0) (diagonal).
    // With waypoints, boundary should aim toward first waypoint (100,100) — straight right.
    const nodeA: VizNode = {
      id: 'a',
      pos: { x: 0, y: 100 },
      shape: { kind: 'rect', w: 40, h: 40 },
    };
    const nodeB: VizNode = {
      id: 'b',
      pos: { x: 200, y: 0 },
      shape: { kind: 'rect', w: 40, h: 40 },
    };
    const edge: VizEdge = {
      id: 'e',
      from: 'a',
      to: 'b',
      waypoints: [{ x: 100, y: 100 }],
    };
    const nodesById = new Map([
      ['a', nodeA],
      ['b', nodeB],
    ]);

    const geo = resolveEdgeGeometryFromData(edge, nodesById)!;
    // Waypoint is at the same y as node A → source anchor should exit horizontally (right side)
    expect(geo.startAnchor.x).toBeCloseTo(20, 0); // right edge of 40×40 box centered at x=0
    expect(geo.startAnchor.y).toBeCloseTo(100, 0); // same y as node center
  });

  it('uses last waypoint as direction reference for target boundary anchor', () => {
    // Node B at (200,0), last waypoint at (200,100) — directly above.
    // Without waypoints, boundary would aim toward node A at (0,100) (diagonal).
    // With waypoints, boundary should aim toward last waypoint (200,100) — straight down.
    const nodeA: VizNode = {
      id: 'a',
      pos: { x: 0, y: 100 },
      shape: { kind: 'rect', w: 40, h: 40 },
    };
    const nodeB: VizNode = {
      id: 'b',
      pos: { x: 200, y: 0 },
      shape: { kind: 'rect', w: 40, h: 40 },
    };
    const edge: VizEdge = {
      id: 'e',
      from: 'a',
      to: 'b',
      waypoints: [{ x: 200, y: 100 }],
    };
    const nodesById = new Map([
      ['a', nodeA],
      ['b', nodeB],
    ]);

    const geo = resolveEdgeGeometryFromData(edge, nodesById)!;
    // Last waypoint is directly below node B → target anchor should be at the bottom
    expect(geo.endAnchor.x).toBeCloseTo(200, 0); // same x as node center
    expect(geo.endAnchor.y).toBeCloseTo(20, 0); // bottom edge of 40×40 box centered at y=0
  });

  it('bundled edges sharing a convergence waypoint anchor at the same target point', () => {
    // Simulate edge bundling: two edges from different sources converge at
    // the same waypoint above the target node.
    const target: VizNode = {
      id: 'target',
      pos: { x: 200, y: 200 },
      shape: { kind: 'rect', w: 60, h: 60 },
    };
    const srcA: VizNode = {
      id: 'srcA',
      pos: { x: 50, y: 50 },
      shape: { kind: 'rect', w: 40, h: 40 },
    };
    const srcB: VizNode = {
      id: 'srcB',
      pos: { x: 350, y: 50 },
      shape: { kind: 'rect', w: 40, h: 40 },
    };
    const convergencePoint = { x: 200, y: 140 };
    const edgeA: VizEdge = {
      id: 'eA',
      from: 'srcA',
      to: 'target',
      waypoints: [convergencePoint],
    };
    const edgeB: VizEdge = {
      id: 'eB',
      from: 'srcB',
      to: 'target',
      waypoints: [convergencePoint],
    };
    const nodesById = new Map([
      ['target', target],
      ['srcA', srcA],
      ['srcB', srcB],
    ]);

    const geoA = resolveEdgeGeometryFromData(edgeA, nodesById)!;
    const geoB = resolveEdgeGeometryFromData(edgeB, nodesById)!;

    // Both edges should anchor at the exact same point on the target node
    expect(geoA.endAnchor.x).toBeCloseTo(geoB.endAnchor.x, 5);
    expect(geoA.endAnchor.y).toBeCloseTo(geoB.endAnchor.y, 5);
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
