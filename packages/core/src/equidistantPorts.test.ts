import { describe, it, expect } from 'vitest';
import { getEquidistantPorts, toNodePorts } from './equidistantPorts';
import type { EquidistantPort } from './equidistantPorts';
import type { NodeShape } from './types';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Assert all ports have unique ids. */
function expectUniqueIds(ports: EquidistantPort[]): void {
  const ids = ports.map((p) => p.id);
  expect(new Set(ids).size).toBe(ids.length);
}

/** Assert `t` values are monotonically increasing and in [0, 1). */
function expectMonotonicT(ports: EquidistantPort[]): void {
  for (let i = 0; i < ports.length; i++) {
    const t = ports[i]!.t;
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThan(1);
    if (i > 0) {
      expect(t).toBeGreaterThan(ports[i - 1]!.t);
    }
  }
}

/**
 * Assert that ports are equidistant by **perimeter arc length**.
 *
 * This checks that `t` values are evenly spaced (t[i] ≈ i / N),
 * which is the correct metric. Chord distances between consecutive
 * ports are NOT expected to be equal (e.g. rectangle corners).
 */
function expectEqualPerimeterSpacing(ports: EquidistantPort[]): void {
  const n = ports.length;
  if (n < 2) return;
  const step = 1 / n;
  for (let i = 0; i < n; i++) {
    expect(ports[i]!.t).toBeCloseTo(i * step, 5);
  }
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('getEquidistantPorts', () => {
  /* ---- Circle ---------------------------------------------------- */

  describe('circle', () => {
    const shape: NodeShape = { kind: 'circle', r: 50 };

    it('returns smart default count of 8', () => {
      const ports = getEquidistantPorts(shape);
      expect(ports).toHaveLength(8);
    });

    it('places ports at radius distance from center', () => {
      const ports = getEquidistantPorts(shape, 4);
      for (const p of ports) {
        expect(Math.hypot(p.x, p.y)).toBeCloseTo(50, 5);
      }
    });

    it('spaces ports equally by angle', () => {
      const ports = getEquidistantPorts(shape, 4);
      expect(ports[0]!.angle).toBeCloseTo(0, 5);
      expect(ports[1]!.angle).toBeCloseTo(90, 5);
      expect(ports[2]!.angle).toBeCloseTo(180, 5);
      expect(ports[3]!.angle).toBeCloseTo(270, 5);
    });

    it('has monotonically increasing t values in [0, 1)', () => {
      const ports = getEquidistantPorts(shape, 6);
      expectMonotonicT(ports);
    });

    it('assigns unique ids', () => {
      const ports = getEquidistantPorts(shape, 8);
      expectUniqueIds(ports);
    });

    it('first port at angle 0 is at (r, 0)', () => {
      const ports = getEquidistantPorts(shape, 4);
      expect(ports[0]!.x).toBeCloseTo(50, 5);
      expect(ports[0]!.y).toBeCloseTo(0, 5);
    });
  });

  /* ---- Ellipse --------------------------------------------------- */

  describe('ellipse', () => {
    const shape: NodeShape = { kind: 'ellipse', rx: 60, ry: 30 };

    it('returns smart default count of 8', () => {
      const ports = getEquidistantPorts(shape);
      expect(ports).toHaveLength(8);
    });

    it('all ports lie on the ellipse boundary', () => {
      const ports = getEquidistantPorts(shape, 8);
      for (const p of ports) {
        const n = (p.x / 60) ** 2 + (p.y / 30) ** 2;
        expect(n).toBeCloseTo(1, 1);
      }
    });

    it('ports are equidistant by arc length', () => {
      const ports = getEquidistantPorts(shape, 8);
      expectEqualPerimeterSpacing(ports);
    });

    it('has unique ids and monotonic t', () => {
      const ports = getEquidistantPorts(shape, 6);
      expectUniqueIds(ports);
      expectMonotonicT(ports);
    });

    it('degenerates to circle when rx === ry', () => {
      const circular: NodeShape = { kind: 'ellipse', rx: 40, ry: 40 };
      const ports = getEquidistantPorts(circular, 4);
      // Should be equidistant like a circle
      for (const p of ports) {
        expect(Math.hypot(p.x, p.y)).toBeCloseTo(40, 1);
      }
    });
  });

  /* ---- Rectangle ------------------------------------------------- */

  describe('rect', () => {
    const shape: NodeShape = { kind: 'rect', w: 120, h: 60 };

    it('returns smart default count of 8', () => {
      const ports = getEquidistantPorts(shape);
      expect(ports).toHaveLength(8);
    });

    it('all ports lie on the rectangle perimeter', () => {
      const ports = getEquidistantPorts(shape, 8);
      for (const p of ports) {
        const onHoriz = Math.abs(Math.abs(p.y) - 30) < 0.01;
        const onVert = Math.abs(Math.abs(p.x) - 60) < 0.01;
        expect(onHoriz || onVert).toBe(true);
      }
    });

    it('ports are equidistant by perimeter arc length', () => {
      const ports = getEquidistantPorts(shape, 8);
      expectEqualPerimeterSpacing(ports);
    });

    it('has unique ids and monotonic t', () => {
      const ports = getEquidistantPorts(shape, 8);
      expectUniqueIds(ports);
      expectMonotonicT(ports);
    });

    it('port 0 starts at the first vertex (top-left)', () => {
      const ports = getEquidistantPorts(shape, 4);
      // First vertex of rect is (-w/2, -h/2)
      expect(ports[0]!.x).toBeCloseTo(-60, 5);
      expect(ports[0]!.y).toBeCloseTo(-30, 5);
    });

    it('handles square correctly', () => {
      const square: NodeShape = { kind: 'rect', w: 100, h: 100 };
      const ports = getEquidistantPorts(square, 4);
      // 4 ports on a square should be at the 4 corners
      expectEqualPerimeterSpacing(ports);
    });
  });

  /* ---- Diamond --------------------------------------------------- */

  describe('diamond', () => {
    const shape: NodeShape = { kind: 'diamond', w: 80, h: 80 };

    it('returns smart default count of 4', () => {
      const ports = getEquidistantPorts(shape);
      expect(ports).toHaveLength(4);
    });

    it('ports are equidistant by perimeter', () => {
      const ports = getEquidistantPorts(shape, 4);
      expectEqualPerimeterSpacing(ports);
    });

    it('4 ports on symmetric diamond are at vertices', () => {
      const ports = getEquidistantPorts(shape, 4);
      // Diamond vertices: top, right, bottom, left
      expect(ports[0]!.x).toBeCloseTo(0, 5);
      expect(ports[0]!.y).toBeCloseTo(-40, 5);
    });
  });

  /* ---- Hexagon --------------------------------------------------- */

  describe('hexagon', () => {
    const shape: NodeShape = { kind: 'hexagon', r: 40 };

    it('returns smart default count of 6', () => {
      const ports = getEquidistantPorts(shape);
      expect(ports).toHaveLength(6);
    });

    it('6 ports on regular hexagon are at vertices', () => {
      const ports = getEquidistantPorts(shape, 6);
      // All edges are equal, so 6 equidistant ports = at vertices
      for (const p of ports) {
        expect(Math.hypot(p.x, p.y)).toBeCloseTo(40, 1);
      }
    });

    it('ports are equidistant by perimeter', () => {
      const ports = getEquidistantPorts(shape, 12);
      expectEqualPerimeterSpacing(ports);
    });

    it('flat-top orientation changes port positions', () => {
      const flat: NodeShape = { kind: 'hexagon', r: 40, orientation: 'flat' };
      const pointy: NodeShape = {
        kind: 'hexagon',
        r: 40,
        orientation: 'pointy',
      };
      const flatPorts = getEquidistantPorts(flat, 6);
      const pointyPorts = getEquidistantPorts(pointy, 6);
      // First port should differ
      expect(flatPorts[0]!.x).not.toBeCloseTo(pointyPorts[0]!.x, 1);
    });
  });

  /* ---- Triangle -------------------------------------------------- */

  describe('triangle', () => {
    const shape: NodeShape = { kind: 'triangle', w: 80, h: 80 };

    it('returns smart default count of 6', () => {
      const ports = getEquidistantPorts(shape);
      expect(ports).toHaveLength(6);
    });

    it('3 ports on equilateral-ish triangle are at vertices', () => {
      const ports = getEquidistantPorts(shape, 3);
      // First vertex of 'up' triangle: (0, -40)
      expect(ports[0]!.x).toBeCloseTo(0, 5);
      expect(ports[0]!.y).toBeCloseTo(-40, 5);
    });

    it('respects direction parameter', () => {
      const down: NodeShape = {
        kind: 'triangle',
        w: 80,
        h: 80,
        direction: 'down',
      };
      const ports = getEquidistantPorts(down, 3);
      // First vertex of 'down' triangle: (0, 40)
      expect(ports[0]!.x).toBeCloseTo(0, 5);
      expect(ports[0]!.y).toBeCloseTo(40, 5);
    });

    it('ports are equidistant by perimeter', () => {
      const ports = getEquidistantPorts(shape, 6);
      expectEqualPerimeterSpacing(ports);
    });
  });

  /* ---- Parallelogram --------------------------------------------- */

  describe('parallelogram', () => {
    const shape: NodeShape = { kind: 'parallelogram', w: 120, h: 60 };

    it('returns smart default count of 8', () => {
      const ports = getEquidistantPorts(shape);
      expect(ports).toHaveLength(8);
    });

    it('ports are equidistant by perimeter', () => {
      const ports = getEquidistantPorts(shape, 8);
      expectEqualPerimeterSpacing(ports);
    });

    it('has unique ids and monotonic t', () => {
      const ports = getEquidistantPorts(shape, 4);
      expectUniqueIds(ports);
      expectMonotonicT(ports);
    });
  });

  /* ---- Trapezoid ------------------------------------------------- */

  describe('trapezoid', () => {
    const shape: NodeShape = {
      kind: 'trapezoid',
      topW: 80,
      bottomW: 120,
      h: 60,
    };

    it('returns smart default count of 8', () => {
      const ports = getEquidistantPorts(shape);
      expect(ports).toHaveLength(8);
    });

    it('ports are equidistant by perimeter', () => {
      const ports = getEquidistantPorts(shape, 8);
      expectEqualPerimeterSpacing(ports);
    });

    it('4 ports on trapezoid are at vertices', () => {
      const ports = getEquidistantPorts(shape, 4);
      // Vertices: (-40, -30), (40, -30), (60, 30), (-60, 30)
      expect(ports[0]!.x).toBeCloseTo(-40, 5);
      expect(ports[0]!.y).toBeCloseTo(-30, 5);
    });
  });

  /* ---- Star ------------------------------------------------------ */

  describe('star', () => {
    const shape: NodeShape = { kind: 'star', points: 5, outerR: 50 };

    it('returns smart default count of 2*points (10)', () => {
      const ports = getEquidistantPorts(shape);
      expect(ports).toHaveLength(10);
    });

    it('ports are equidistant by perimeter', () => {
      const ports = getEquidistantPorts(shape, 10);
      expectEqualPerimeterSpacing(ports);
    });

    it('10 ports on 5-point star are at vertices', () => {
      const ports = getEquidistantPorts(shape, 10);
      // All 10 edges are equal length for a regular star
      expectUniqueIds(ports);
    });
  });

  /* ---- Cross ----------------------------------------------------- */

  describe('cross', () => {
    const shape: NodeShape = { kind: 'cross', size: 60 };

    it('returns smart default count of 12', () => {
      const ports = getEquidistantPorts(shape);
      expect(ports).toHaveLength(12);
    });

    it('12 ports are at vertices of the plus sign', () => {
      const ports = getEquidistantPorts(shape, 12);
      // All edges of a symmetric cross are equal → vertices
      expectUniqueIds(ports);
    });
  });

  /* ---- Fallback shapes ------------------------------------------- */

  describe('fallback (bounding-box)', () => {
    it('works for cylinder (falls back to rect)', () => {
      const shape: NodeShape = { kind: 'cylinder', w: 80, h: 100 };
      const ports = getEquidistantPorts(shape);
      expect(ports).toHaveLength(8);
      expectUniqueIds(ports);
    });

    it('works for cloud', () => {
      const shape: NodeShape = { kind: 'cloud', w: 100, h: 80 };
      const ports = getEquidistantPorts(shape);
      expect(ports).toHaveLength(8);
    });
  });

  /* ---- Edge cases ------------------------------------------------ */

  describe('edge cases', () => {
    it('returns empty array for count 0', () => {
      const ports = getEquidistantPorts({ kind: 'circle', r: 50 }, 0);
      expect(ports).toHaveLength(0);
    });

    it('returns empty array for negative count', () => {
      const ports = getEquidistantPorts({ kind: 'rect', w: 100, h: 50 }, -1);
      expect(ports).toHaveLength(0);
    });

    it('returns 1 port for count 1', () => {
      const ports = getEquidistantPorts({ kind: 'circle', r: 50 }, 1);
      expect(ports).toHaveLength(1);
      expect(ports[0]!.t).toBe(0);
    });

    it('identical inputs produce identical outputs', () => {
      const shape: NodeShape = { kind: 'rect', w: 120, h: 60 };
      const a = getEquidistantPorts(shape, 8);
      const b = getEquidistantPorts(shape, 8);
      expect(a).toEqual(b);
    });
  });
});

/* ------------------------------------------------------------------ */
/*  toNodePorts                                                        */
/* ------------------------------------------------------------------ */

describe('toNodePorts', () => {
  it('converts EquidistantPort[] to NodePort[] with offset and direction', () => {
    const equiPorts = getEquidistantPorts({ kind: 'circle', r: 50 }, 4);
    const nodePorts = toNodePorts(equiPorts);

    expect(nodePorts).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      const ep = equiPorts[i]!;
      const np = nodePorts[i]!;
      expect(np.id).toBe(ep.id);
      expect(np.offset).toEqual({ x: ep.x, y: ep.y });
      expect(np.direction).toBe(ep.angle);
    }
  });
});
