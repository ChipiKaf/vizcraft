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
});
