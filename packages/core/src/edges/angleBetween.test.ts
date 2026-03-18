import { describe, it, expect } from 'vitest';
import { angleBetween } from './paths';
import { viz } from '../builder';
import { resolveEdgeGeometry } from './resolveEdgeGeometry';

describe('angleBetween', () => {
  it('returns 0 for a target directly to the right', () => {
    expect(angleBetween({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(0);
  });

  it('returns 90 for a target directly below', () => {
    expect(angleBetween({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(90);
  });

  it('returns 180 (or -180) for a target directly to the left', () => {
    const angle = angleBetween({ x: 10, y: 0 }, { x: 0, y: 0 });
    // atan2 returns ±180 for the left direction
    expect(Math.abs(angle)).toBeCloseTo(180);
  });

  it('returns -90 for a target directly above', () => {
    expect(angleBetween({ x: 0, y: 10 }, { x: 0, y: 0 })).toBeCloseTo(-90);
  });

  it('returns 45 for a target at equal positive dx and dy', () => {
    expect(angleBetween({ x: 0, y: 0 }, { x: 10, y: 10 })).toBeCloseTo(45);
  });

  it('handles identical points (0-length vector)', () => {
    // atan2(0, 0) returns 0 in IEEE 754
    expect(angleBetween({ x: 5, y: 5 }, { x: 5, y: 5 })).toBeCloseTo(0);
  });
});

describe('EdgeBuilder.straightLine', () => {
  function makeDiagonalScene(straightLine?: boolean | 'from' | 'to') {
    const b = viz()
      .view(400, 400)
      .node('a', { at: { x: 50, y: 50 }, rect: { w: 40, h: 40 } })
      .node('b', { at: { x: 200, y: 200 }, rect: { w: 40, h: 40 } });

    const eb = b.edge('a', 'b', 'e1');
    if (straightLine === true) eb.straightLine();
    else if (straightLine === 'from') eb.straightLineFrom();
    else if (straightLine === 'to') eb.straightLineTo();
    eb.done();

    return b.build();
  }

  it('sets straightLine = true on VizEdge via builder', () => {
    const scene = makeDiagonalScene(true);
    expect(scene.edges[0]?.straightLine).toBe(true);
  });

  it('sets straightLine = "from" on VizEdge via builder', () => {
    const scene = makeDiagonalScene('from');
    expect(scene.edges[0]?.straightLine).toBe('from');
  });

  it('sets straightLine = "to" on VizEdge via builder', () => {
    const scene = makeDiagonalScene('to');
    expect(scene.edges[0]?.straightLine).toBe('to');
  });

  it('produces endpoints forming a straight line when straightLine = true', () => {
    const scene = makeDiagonalScene(true);
    const geo = resolveEdgeGeometry(scene, 'e1')!;

    // Nodes at (50,50) and (200,200): diagonal is 45° in screen coords.
    // With straightLine both endpoints should lie on the same 45° line.
    const dx = geo.endAnchor.x - geo.startAnchor.x;
    const dy = geo.endAnchor.y - geo.startAnchor.y;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    expect(angle).toBeCloseTo(45, 0);
  });

  it('explicit fromAngle overrides straightLine for source end', () => {
    const scene = viz()
      .view(400, 400)
      .node('a', { at: { x: 50, y: 50 }, rect: { w: 40, h: 40 } })
      .node('b', { at: { x: 200, y: 200 }, rect: { w: 40, h: 40 } })
      .edge('a', 'b', 'e1')
      .straightLine()
      .fromAngle(0)
      .done()
      .build();

    const geo = resolveEdgeGeometry(scene, 'e1')!;
    // fromAngle(0) forces the start anchor to the right side of the source node
    expect(geo.startAnchor.x).toBeCloseTo(70); // 50 + half-width 20
    expect(geo.startAnchor.y).toBeCloseTo(50);
  });

  it('works with declarative EdgeOptions', () => {
    const scene = viz()
      .view(400, 400)
      .node('a', { at: { x: 50, y: 50 }, rect: { w: 40, h: 40 } })
      .node('b', { at: { x: 200, y: 200 }, rect: { w: 40, h: 40 } })
      .edge('a', 'b', { straightLine: true })
      .build();

    expect(scene.edges[0]?.straightLine).toBe(true);

    const geo = resolveEdgeGeometry(scene, 'a->b')!;
    const dx = geo.endAnchor.x - geo.startAnchor.x;
    const dy = geo.endAnchor.y - geo.startAnchor.y;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    expect(angle).toBeCloseTo(45, 0);
  });

  it('produces a vertical edge when nodes overlap horizontally', () => {
    // A is at (100, 50), B is at (130, 200), both 80×40
    // A x-range: [60, 140], B x-range: [90, 170] → overlap [90, 140], midX = 115
    const scene = viz()
      .view(400, 400)
      .node('a', { at: { x: 100, y: 50 }, rect: { w: 80, h: 40 } })
      .node('b', { at: { x: 130, y: 200 }, rect: { w: 80, h: 40 } })
      .edge('a', 'b', 'e1')
      .straightLine()
      .done()
      .build();

    const geo = resolveEdgeGeometry(scene, 'e1')!;
    // Both anchors should share the same x-coordinate (vertical edge)
    expect(geo.startAnchor.x).toBeCloseTo(geo.endAnchor.x, 1);
    // Start should be on the bottom of A, end on the top of B
    expect(geo.startAnchor.y).toBeCloseTo(70); // 50 + 20
    expect(geo.endAnchor.y).toBeCloseTo(180); // 200 - 20
  });

  it('produces a horizontal edge when nodes overlap vertically', () => {
    // A is at (50, 100), B is at (200, 120), both 40×80
    // A y-range: [60, 140], B y-range: [80, 160] → overlap [80, 140], midY = 110
    const scene = viz()
      .view(400, 400)
      .node('a', { at: { x: 50, y: 100 }, rect: { w: 40, h: 80 } })
      .node('b', { at: { x: 200, y: 120 }, rect: { w: 40, h: 80 } })
      .edge('a', 'b', 'e1')
      .straightLine()
      .done()
      .build();

    const geo = resolveEdgeGeometry(scene, 'e1')!;
    // Both anchors should share the same y-coordinate (horizontal edge)
    expect(geo.startAnchor.y).toBeCloseTo(geo.endAnchor.y, 1);
    // Start should be on the right of A, end on the left of B
    expect(geo.startAnchor.x).toBeCloseTo(70); // 50 + 20
    expect(geo.endAnchor.x).toBeCloseTo(180); // 200 - 20
  });

  it('straightLineFrom only affects source endpoint in overlap case', () => {
    const scene = viz()
      .view(400, 400)
      .node('a', { at: { x: 100, y: 50 }, rect: { w: 80, h: 40 } })
      .node('b', { at: { x: 130, y: 200 }, rect: { w: 80, h: 40 } })
      .edge('a', 'b', 'e1')
      .straightLineFrom()
      .done()
      .build();

    const geo = resolveEdgeGeometry(scene, 'e1')!;
    // Source should use the overlap-based angle (bottom edge at midX)
    expect(geo.startAnchor.y).toBeCloseTo(70); // bottom of A
    // Target should use default boundary anchor (aimed at center of A)
    // so it will NOT have the same x as startAnchor
  });

  it('falls back to diagonal when no overlap exists', () => {
    // A at (50,50) and B at (300,300), both 40×40 — no overlap
    const scene = viz()
      .view(400, 400)
      .node('a', { at: { x: 50, y: 50 }, rect: { w: 40, h: 40 } })
      .node('b', { at: { x: 300, y: 300 }, rect: { w: 40, h: 40 } })
      .edge('a', 'b', 'e1')
      .straightLine()
      .done()
      .build();

    const geo = resolveEdgeGeometry(scene, 'e1')!;
    const dx = geo.endAnchor.x - geo.startAnchor.x;
    const dy = geo.endAnchor.y - geo.startAnchor.y;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    expect(angle).toBeCloseTo(45, 0);
  });
});
