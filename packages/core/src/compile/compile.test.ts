import { describe, expect, it, vi } from 'vitest';
import { compileSpec } from './index';
import type { ResolvedNode } from './index';
import type { VizSpec } from '../spec';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const view = { width: 1000, height: 600 };

function nodeById(
  compiled: ReturnType<typeof compileSpec>,
  id: string
): ResolvedNode {
  const n = compiled.nodes.find((n) => n.id === id);
  if (!n) throw new Error(`node '${id}' not found in compiled output`);
  return n;
}

function boxesOverlap(a: ResolvedNode, b: ResolvedNode): boolean {
  return (
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 &&
    Math.abs(a.y - b.y) < (a.height + b.height) / 2
  );
}

// ---------------------------------------------------------------------------
// FR-1 — containment
// ---------------------------------------------------------------------------

describe('compileSpec — containment (FR-1)', () => {
  const grouped: VizSpec = {
    view,
    nodes: [
      { id: 'github', label: 'Github', type: 'group', x: 200, y: 200 },
      { id: 'gha', label: 'Github Actions', parent: 'github' },
      { id: 'hooks', label: 'Webhooks', parent: 'github' },
    ],
  };

  it('auto-sizes a group to hug its children plus padding', () => {
    const compiled = compileSpec(grouped);
    const g = nodeById(compiled, 'github');
    const gha = nodeById(compiled, 'gha');
    const hooks = nodeById(compiled, 'hooks');

    // Children stack vertically (default group engine): 120×40 each + 24 gap.
    // Content = 120 × 104; group = content + 2×24 padding + 28 header.
    expect(g.width).toBe(120 + 48);
    expect(g.height).toBe(104 + 48 + 28);

    // Children sit inside the group's content box.
    for (const child of [gha, hooks]) {
      expect(child.x - child.width / 2).toBeGreaterThanOrEqual(
        g.x - g.width / 2
      );
      expect(child.x + child.width / 2).toBeLessThanOrEqual(g.x + g.width / 2);
      expect(child.y - child.height / 2).toBeGreaterThanOrEqual(
        g.y - g.height / 2 + g.headerHeight
      );
      expect(child.y + child.height / 2).toBeLessThanOrEqual(
        g.y + g.height / 2
      );
    }
  });

  it('reflows the frame when a child is added', () => {
    const before = nodeById(compileSpec(grouped), 'github');
    const after = nodeById(
      compileSpec({
        ...grouped,
        nodes: [...grouped.nodes, { id: 'extra', parent: 'github' }],
      }),
      'github'
    );
    expect(after.height).toBeGreaterThan(before.height);
  });

  it('supports recursive nesting (group inside group)', () => {
    const compiled = compileSpec({
      view,
      nodes: [
        { id: 'repo', label: 'Repo Root', type: 'group' },
        { id: 'apps', label: 'Apps: Claims', type: 'group', parent: 'repo' },
        { id: 'mf', label: 'module-federation.config.ts', parent: 'apps' },
      ],
    });
    const repo = nodeById(compiled, 'repo');
    const apps = nodeById(compiled, 'apps');
    const mf = nodeById(compiled, 'mf');

    // Inner group inside outer, leaf inside inner.
    expect(apps.width).toBeLessThan(repo.width);
    expect(mf.x - mf.width / 2).toBeGreaterThan(apps.x - apps.width / 2);
    expect(mf.x + mf.width / 2).toBeLessThan(apps.x + apps.width / 2);
    expect(mf.parent).toBe('apps');
    expect(apps.parent).toBe('repo');
  });

  it('reserves a header strip so the label does not overlap children', () => {
    const compiled = compileSpec(grouped);
    const g = nodeById(compiled, 'github');
    const gha = nodeById(compiled, 'gha');
    expect(g.headerHeight).toBe(28);
    // First child starts below the header strip.
    expect(gha.y - gha.height / 2).toBeGreaterThanOrEqual(
      g.y - g.height / 2 + 28
    );
  });

  it('throws on unknown parents', () => {
    expect(() =>
      compileSpec({ view, nodes: [{ id: 'a', parent: 'nope', x: 0, y: 0 }] })
    ).toThrow(/unknown parent/);
  });

  it('throws when the parent is not a group', () => {
    expect(() =>
      compileSpec({
        view,
        nodes: [
          { id: 'p', x: 0, y: 0 },
          { id: 'a', parent: 'p', x: 0, y: 0 },
        ],
      })
    ).toThrow(/not a 'group'/);
  });

  it('throws on containment cycles', () => {
    expect(() =>
      compileSpec({
        view,
        nodes: [
          { id: 'a', type: 'group', parent: 'b' },
          { id: 'b', type: 'group', parent: 'a' },
        ],
      })
    ).toThrow(/cycle/);
  });

  it('keeps flat specs byte-identical (backward compatibility)', () => {
    const flat: VizSpec = {
      view: { width: 900, height: 360 },
      nodes: [
        { id: 'a', label: 'A', x: 80, y: 180, width: 100, height: 50 },
        { id: 'b', label: 'B', x: 420, y: 180 },
      ],
      edges: [{ from: 'a', to: 'b' }],
    };
    const compiled = compileSpec(flat);
    expect(nodeById(compiled, 'a')).toMatchObject({
      x: 80,
      y: 180,
      width: 100,
      height: 50,
    });
    expect(nodeById(compiled, 'b')).toMatchObject({
      x: 420,
      y: 180,
      width: 120,
      height: 40,
    });
    expect(compiled.edges[0]).toMatchObject({
      from: 'a',
      to: 'b',
      routing: 'straight',
    });
    expect(compiled.edges[0]!.waypoints).toBeUndefined();
    expect(compiled.overlays).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// FR-2 — zones
// ---------------------------------------------------------------------------

describe('compileSpec — zones (FR-2)', () => {
  it('hugs explicit members plus padding and renders behind real nodes', () => {
    const compiled = compileSpec({
      view,
      nodes: [
        { id: 'browser', label: 'Browser', type: 'zone' },
        { id: 'm1', x: 100, y: 100, zone: 'browser' },
        { id: 'm2', x: 300, y: 200, zone: 'browser' },
      ],
    });
    const z = nodeById(compiled, 'browser');

    // Members: m1 box 40..160 × 80..120, m2 box 240..360 × 180..220.
    // Hug: 40..360 × 80..220 (+24 padding, +22 label reserve above).
    expect(z.width).toBe(320 + 48);
    expect(z.height).toBe(140 + 48 + 22);
    expect(z.zIndex).toBe(-10);
    expect(z.dash).toBe('dashed');
    expect(z.fill).toBe('rgba(148,163,184,0.06)');
    // Zones render first.
    expect(compiled.nodes[0]!.id).toBe('browser');
  });

  it('respects pinned zone bounds', () => {
    const compiled = compileSpec({
      view,
      nodes: [
        {
          id: 'z',
          type: 'zone',
          x: 400,
          y: 300,
          width: 500,
          height: 250,
        },
        { id: 'a', x: 100, y: 100 },
      ],
    });
    expect(nodeById(compiled, 'z')).toMatchObject({
      x: 400,
      y: 300,
      width: 500,
      height: 250,
    });
  });

  it('lets zones and groups coexist and overlap', () => {
    const compiled = compileSpec({
      view,
      nodes: [
        { id: 'zone', type: 'zone' },
        { id: 'g', type: 'group', x: 200, y: 200 },
        { id: 'child', parent: 'g', zone: 'zone' },
        { id: 'free', x: 500, y: 100, zone: 'zone' },
      ],
    });
    const z = nodeById(compiled, 'zone');
    const child = nodeById(compiled, 'child');
    const free = nodeById(compiled, 'free');
    // The zone spans the group child AND the free node — membership does not
    // re-parent anything.
    expect(child.parent).toBe('g');
    expect(free.parent).toBeUndefined();
    expect(z.x - z.width / 2).toBeLessThan(child.x);
    expect(z.x + z.width / 2).toBeGreaterThan(free.x);
  });
});

// ---------------------------------------------------------------------------
// FR-3 — ports & routing
// ---------------------------------------------------------------------------

describe('compileSpec — ports & routing (FR-3)', () => {
  it('parses node.e port suffixes to side ports', () => {
    const compiled = compileSpec({
      view,
      nodes: [
        { id: 'amplify', x: 100, y: 100 },
        { id: 'hooks', x: 400, y: 300 },
      ],
      edges: [{ from: 'amplify.e', to: 'hooks.s' }],
    });
    const e = compiled.edges[0]!;
    expect(e.from).toBe('amplify');
    expect(e.to).toBe('hooks');
    expect(e.fromPort).toBe('right');
    expect(e.toPort).toBe('bottom');
  });

  it('keeps node ids containing dots working', () => {
    const compiled = compileSpec({
      view,
      nodes: [
        { id: 'module-federation.config.ts', x: 100, y: 100 },
        { id: 'b', x: 400, y: 100 },
      ],
      edges: [{ from: 'module-federation.config.ts', to: 'b' }],
    });
    expect(compiled.edges[0]!.from).toBe('module-federation.config.ts');
    expect(compiled.edges[0]!.fromPort).toBeUndefined();
  });

  it('resolves named ports declared on the node', () => {
    const compiled = compileSpec({
      view,
      nodes: [
        {
          id: 'a',
          x: 100,
          y: 100,
          ports: [{ id: 'out-1', x: 60, y: 10 }],
        },
        { id: 'b', x: 400, y: 100 },
      ],
      edges: [{ from: 'a.out-1', to: 'b' }],
    });
    expect(compiled.edges[0]!.fromPort).toBe('out-1');
    expect(nodeById(compiled, 'a').ports).toEqual([
      { id: 'out-1', x: 60, y: 10 },
    ]);
  });

  it('adds a clean orthogonal wall exit when an edge crosses a group boundary', () => {
    const compiled = compileSpec({
      view,
      nodes: [
        { id: 'g', type: 'group', x: 200, y: 200 },
        { id: 'inner', parent: 'g' },
        { id: 'outer', x: 500, y: 200 },
      ],
      edges: [{ from: 'inner', to: 'outer' }],
    });
    const g = nodeById(compiled, 'g');
    const e = compiled.edges[0]!;

    expect(e.routing).toBe('orthogonal');
    expect(e.waypoints).toHaveLength(1);
    // Exit through the group's right wall, level with the source node.
    expect(e.waypoints![0]!.x).toBeCloseTo(g.x + g.width / 2, 5);
    expect(e.waypoints![0]!.y).toBeCloseTo(nodeById(compiled, 'inner').y, 5);
  });

  it('respects an explicit straight/curved style over boundary stubs', () => {
    const compiled = compileSpec({
      view,
      nodes: [
        { id: 'g', type: 'group', x: 200, y: 200 },
        { id: 'inner', parent: 'g' },
        { id: 'outer', x: 500, y: 200 },
      ],
      edges: [{ from: 'inner', to: 'outer', style: 'curved' }],
    });
    expect(compiled.edges[0]!.routing).toBe('curved');
    expect(compiled.edges[0]!.waypoints).toBeUndefined();
  });

  it('routes around obstacles with routing avoid', () => {
    const compiled = compileSpec({
      view,
      nodes: [
        { id: 'a', x: 100, y: 100, width: 80, height: 40 },
        { id: 'blocker', x: 300, y: 100, width: 80, height: 40 },
        { id: 'c', x: 500, y: 100, width: 80, height: 40 },
      ],
      edges: [{ from: 'a', to: 'c', routing: 'avoid' }],
    });
    const e = compiled.edges[0]!;
    expect(e.waypoints).toBeDefined();
    expect(e.waypoints!.length).toBeGreaterThanOrEqual(2);

    // No polyline segment may pass through the blocker's core box.
    const blocker = nodeById(compiled, 'blocker');
    const left = blocker.x - blocker.width / 2;
    const right = blocker.x + blocker.width / 2;
    const top = blocker.y - blocker.height / 2;
    const bottom = blocker.y + blocker.height / 2;

    const pts = e.waypoints!;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1]!;
      const q = pts[i]!;
      const segMinX = Math.min(p.x, q.x);
      const segMaxX = Math.max(p.x, q.x);
      const segMinY = Math.min(p.y, q.y);
      const segMaxY = Math.max(p.y, q.y);
      const intersects =
        segMaxX > left && segMinX < right && segMaxY > top && segMinY < bottom;
      expect(intersects).toBe(false);
    }
  });

  it('separates parallel edges between the same pair', () => {
    const compiled = compileSpec({
      view,
      nodes: [
        { id: 'a', x: 100, y: 100 },
        { id: 'b', x: 400, y: 100 },
      ],
      edges: [
        { from: 'a', to: 'b', id: 'e1' },
        { from: 'a', to: 'b', id: 'e2' },
      ],
    });
    const [e1, e2] = compiled.edges;
    expect(e1!.fromAngle).toBeDefined();
    expect(e2!.fromAngle).toBeDefined();
    expect(e1!.fromAngle).not.toBe(e2!.fromAngle);
  });

  it('leaves a single edge between a pair untouched', () => {
    const compiled = compileSpec({
      view,
      nodes: [
        { id: 'a', x: 100, y: 100 },
        { id: 'b', x: 400, y: 100 },
      ],
      edges: [{ from: 'a', to: 'b' }],
    });
    expect(compiled.edges[0]!.fromAngle).toBeUndefined();
    expect(compiled.edges[0]!.toAngle).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// FR-4 — auto-layout
// ---------------------------------------------------------------------------

describe('compileSpec — auto-layout (FR-4)', () => {
  it('produces a readable, non-overlapping layout with no coordinates at all', () => {
    const compiled = compileSpec({
      view,
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
        { id: 'd', label: 'D' },
        { id: 'e', label: 'E' },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
        { from: 'b', to: 'd' },
        { from: 'c', to: 'd' },
        { from: 'd', to: 'e' },
      ],
    });

    for (let i = 0; i < compiled.nodes.length; i++) {
      for (let j = i + 1; j < compiled.nodes.length; j++) {
        expect(
          boxesOverlap(compiled.nodes[i]!, compiled.nodes[j]!),
          `${compiled.nodes[i]!.id} overlaps ${compiled.nodes[j]!.id}`
        ).toBe(false);
      }
      // Everything inside the view.
      const n = compiled.nodes[i]!;
      expect(n.x - n.width / 2).toBeGreaterThanOrEqual(0);
      expect(n.x + n.width / 2).toBeLessThanOrEqual(view.width);
      expect(n.y - n.height / 2).toBeGreaterThanOrEqual(0);
      expect(n.y + n.height / 2).toBeLessThanOrEqual(view.height);
    }
  });

  it('is deterministic: same input → same positions', () => {
    const spec: VizSpec = {
      view,
      nodes: [
        { id: 'a' },
        { id: 'b' },
        { id: 'g', type: 'group' },
        { id: 'c', parent: 'g' },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ],
    };
    const geom = (s: VizSpec) =>
      compileSpec(s).nodes.map((n) => [n.id, n.x, n.y, n.width, n.height]);
    expect(geom(spec)).toEqual(geom(spec));
  });

  it('follows edge direction in layered LR layout', () => {
    const compiled = compileSpec({
      view: { ...view, layout: 'layered', direction: 'LR' },
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ],
    });
    const [a, b, c] = ['a', 'b', 'c'].map((id) => nodeById(compiled, id));
    expect(a!.x).toBeLessThan(b!.x);
    expect(b!.x).toBeLessThan(c!.x);
    expect(a!.y).toBeCloseTo(b!.y, 5);
  });

  it('lays out container children with the parent layout (stack)', () => {
    const compiled = compileSpec({
      view,
      nodes: [
        { id: 'shell', label: 'Portal Shell', type: 'group', layout: 'stack' },
        { id: 'c1', parent: 'shell' },
        { id: 'c2', parent: 'shell' },
        { id: 'c3', parent: 'shell' },
      ],
    });
    const [c1, c2, c3] = ['c1', 'c2', 'c3'].map((id) => nodeById(compiled, id));
    expect(c1!.x).toBeCloseTo(c2!.x, 5);
    expect(c2!.x).toBeCloseTo(c3!.x, 5);
    expect(c1!.y).toBeLessThan(c2!.y);
    expect(c2!.y).toBeLessThan(c3!.y);
  });

  it('supports horizontal stacks via direction: LR', () => {
    const compiled = compileSpec({
      view,
      nodes: [
        { id: 'g', type: 'group', layout: 'stack', direction: 'LR' },
        { id: 'c1', parent: 'g' },
        { id: 'c2', parent: 'g' },
      ],
    });
    const c1 = nodeById(compiled, 'c1');
    const c2 = nodeById(compiled, 'c2');
    expect(c1.y).toBeCloseTo(c2.y, 5);
    expect(c1.x).toBeLessThan(c2.x);
  });

  it('mixed mode: pinned nodes keep their coordinates, the rest auto-place', () => {
    const compiled = compileSpec({
      view: { ...view, layout: 'grid' },
      nodes: [{ id: 'pinned', x: 900, y: 50 }, { id: 'a' }, { id: 'b' }],
    });
    expect(nodeById(compiled, 'pinned')).toMatchObject({ x: 900, y: 50 });
    expect(boxesOverlap(nodeById(compiled, 'a'), nodeById(compiled, 'b'))).toBe(
      false
    );
  });

  it('arranges grid layout in rows and columns', () => {
    const compiled = compileSpec({
      view: { ...view, layout: 'grid' },
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
    });
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((id) =>
      nodeById(compiled, id)
    );
    // 2×2: a,b top row; c,d bottom row.
    expect(a!.y).toBeCloseTo(b!.y, 5);
    expect(c!.y).toBeCloseTo(d!.y, 5);
    expect(a!.x).toBeCloseTo(c!.x, 5);
    expect(a!.y).toBeLessThan(c!.y);
  });
});

// ---------------------------------------------------------------------------
// FR-5 — semantic kinds
// ---------------------------------------------------------------------------

describe('compileSpec — semantic kinds (FR-5)', () => {
  it('maps built-in edge kinds to visual tokens', () => {
    const compiled = compileSpec({
      view,
      nodes: [
        { id: 'a', x: 100, y: 100 },
        { id: 'b', x: 400, y: 100 },
        { id: 'c', x: 400, y: 300 },
      ],
      edges: [
        { from: 'a', to: 'b', kind: 'data', id: 'd' },
        { from: 'a', to: 'c', kind: 'async', id: 'as' },
        { from: 'b', to: 'c', kind: 'contains', id: 'ct' },
      ],
    });
    const data = compiled.edges.find((e) => e.id === 'd')!;
    expect(data.stroke).toBe('#0284c7');
    expect(data.markerEnd).toBe('arrow');
    expect(data.dash).toBeUndefined();

    const asyncEdge = compiled.edges.find((e) => e.id === 'as')!;
    expect(asyncEdge.dash).toBe('dashed');
    expect(asyncEdge.markerEnd).toBe('arrowOpen');

    const contains = compiled.edges.find((e) => e.id === 'ct')!;
    expect(contains.markerEnd).toBe('none');
    expect(contains.dash).toBe('dotted');
  });

  it('maps node kinds to fill/stroke/shape tokens', () => {
    const compiled = compileSpec({
      view,
      nodes: [
        { id: 'db', kind: 'datastore', x: 100, y: 100 },
        { id: 'ext', kind: 'external', x: 300, y: 100 },
      ],
    });
    const db = nodeById(compiled, 'db');
    expect(db.shape).toBe('cylinder');
    expect(db.fill).toBe('#f0fdf4');
    const ext = nodeById(compiled, 'ext');
    expect(ext.dash).toBe('dashed');
  });

  it('recolours all kinds through a single theme block', () => {
    const compiled = compileSpec({
      view,
      theme: {
        edgeKinds: { data: { stroke: '#ff0000' } },
        nodeKinds: { custom: { fill: '#00ff00' } },
      },
      nodes: [
        { id: 'a', x: 100, y: 100, kind: 'custom' },
        { id: 'b', x: 400, y: 100 },
      ],
      edges: [{ from: 'a', to: 'b', kind: 'data' }],
    });
    expect(compiled.edges[0]!.stroke).toBe('#ff0000');
    // Built-in token fields not overridden survive the merge.
    expect(compiled.edges[0]!.markerEnd).toBe('arrow');
    expect(nodeById(compiled, 'a').fill).toBe('#00ff00');
  });

  it('lets explicit per-element style win over the kind token', () => {
    const compiled = compileSpec({
      view,
      nodes: [
        { id: 'a', x: 100, y: 100 },
        { id: 'b', x: 400, y: 100 },
      ],
      edges: [{ from: 'a', to: 'b', kind: 'data', stroke: '#123456' }],
    });
    expect(compiled.edges[0]!.stroke).toBe('#123456');
  });

  it('warns on unknown kinds without crashing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const compiled = compileSpec({
      view,
      nodes: [
        { id: 'a', x: 100, y: 100, kind: 'mystery' },
        { id: 'b', x: 400, y: 100 },
      ],
      edges: [{ from: 'a', to: 'b', kind: 'mystery-edge' }],
    });
    expect(compiled.nodes).toHaveLength(2);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('unknown node kind')
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('unknown edge kind')
    );
    warn.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// FR-6 — legend, title, notes
// ---------------------------------------------------------------------------

describe('compileSpec — legend, title, notes (FR-6)', () => {
  it('legend auto lists every kind actually used', () => {
    const compiled = compileSpec({
      view,
      legend: 'auto',
      nodes: [
        { id: 'a', x: 100, y: 100, kind: 'service' },
        { id: 'b', x: 400, y: 100 },
      ],
      edges: [
        { from: 'a', to: 'b', kind: 'data' },
        { from: 'b', to: 'a', kind: 'async' },
      ],
    });
    const texts = compiled.overlays
      .filter((o) => o.type === 'text')
      .map((o) => (o.type === 'text' ? o.text : ''));
    expect(texts).toContain('Data flow');
    expect(texts).toContain('Async event');
    expect(texts).toContain('Service');
    // Unused kinds do not appear.
    expect(texts).not.toContain('Sync call');
  });

  it('renders explicit legend entries', () => {
    const compiled = compileSpec({
      view,
      legend: [{ label: 'Custom flow', swatch: '#ff00ff' }],
      nodes: [{ id: 'a', x: 100, y: 100 }],
    });
    const texts = compiled.overlays
      .filter((o) => o.type === 'text')
      .map((o) => (o.type === 'text' ? o.text : ''));
    expect(texts).toContain('Custom flow');
  });

  it('renders title/subtitle in a header band that offsets auto-laid content', () => {
    const compiled = compileSpec({
      view: {
        ...view,
        title: 'Extension points — contribution flow',
        subtitle: 'How widgets register',
      },
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ from: 'a', to: 'b' }],
    });
    const texts = compiled.overlays.filter((o) => o.type === 'text');
    expect(
      texts.some(
        (o) => o.type === 'text' && o.text.includes('Extension points')
      )
    ).toBe(true);
    // Auto-laid nodes start below the title band.
    for (const n of compiled.nodes) {
      expect(n.y - n.height / 2).toBeGreaterThanOrEqual(64);
    }
  });

  it('places anchored notes beside their anchor with a dashed leader line', () => {
    const compiled = compileSpec({
      view,
      nodes: [
        { id: 'ep-schema', x: 300, y: 300 },
        {
          id: 'n1',
          type: 'note',
          label: 'z.unknown() — schema not built yet',
          anchor: 'ep-schema',
        },
      ],
    });
    const note = nodeById(compiled, 'n1');
    const anchor = nodeById(compiled, 'ep-schema');
    expect(note.shape).toBe('note');
    expect(note.x).toBeGreaterThan(anchor.x + anchor.width / 2);
    expect(note.y).toBeCloseTo(anchor.y, 5);

    const leader = compiled.edges.find(
      (e) => e.className === 'viz-note-leader'
    );
    expect(leader).toBeDefined();
    expect(leader!.from).toBe('n1');
    expect(leader!.to).toBe('ep-schema');
    expect(leader!.dash).toBe('dotted');
    expect(leader!.markerEnd).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// FR-7 — collapse & focus
// ---------------------------------------------------------------------------

describe('compileSpec — collapse & focus (FR-7)', () => {
  const collapsible: VizSpec = {
    view,
    nodes: [
      { id: 'ext', x: 600, y: 200 },
      {
        id: 'github',
        label: 'Github',
        type: 'group',
        collapsed: true,
        x: 200,
        y: 200,
      },
      { id: 'gha', parent: 'github' },
      { id: 'hooks', parent: 'github' },
    ],
    edges: [
      { from: 'ext', to: 'gha', id: 'e1' },
      { from: 'ext', to: 'hooks', id: 'e2' },
      { from: 'gha', to: 'hooks', id: 'internal' },
    ],
  };

  it('renders a collapsed group as a summary node with a child count', () => {
    const compiled = compileSpec(collapsible);
    const ids = compiled.nodes.map((n) => n.id);
    expect(ids).toContain('github');
    expect(ids).not.toContain('gha');
    expect(ids).not.toContain('hooks');

    const g = nodeById(compiled, 'github');
    expect(g.collapsed).toBe(true);
    expect(g.hiddenChildCount).toBe(2);
    expect(g.width).toBe(160);
    expect(g.height).toBe(48);
  });

  it('re-terminates and dedupes edges to hidden children on the group', () => {
    const compiled = compileSpec(collapsible);
    // e1 and e2 both become ext→github and dedupe to one edge;
    // the internal edge disappears entirely.
    expect(compiled.edges).toHaveLength(1);
    expect(compiled.edges[0]).toMatchObject({ from: 'ext', to: 'github' });
  });

  it('honours runtime collapse overrides over the spec value', () => {
    const compiled = compileSpec(collapsible, {
      collapsedOverrides: new Map([['github', false]]),
    });
    const ids = compiled.nodes.map((n) => n.id);
    expect(ids).toContain('gha');
    expect(ids).toContain('hooks');
    expect(compiled.edges).toHaveLength(3);
  });

  it('reports collapsible groups for interactive toggling', () => {
    const compiled = compileSpec(collapsible);
    expect(compiled.collapsibleGroupIds).toEqual(['github']);
  });

  it('focus dims everything not connected to the target', () => {
    const compiled = compileSpec({
      view,
      focus: 'a',
      nodes: [
        { id: 'a', x: 100, y: 100 },
        { id: 'b', x: 300, y: 100 },
        { id: 'unrelated', x: 500, y: 100 },
      ],
      edges: [
        { from: 'a', to: 'b', id: 'ab' },
        { from: 'b', to: 'unrelated', id: 'bu' },
      ],
    });
    expect(nodeById(compiled, 'a').dimmed).toBeUndefined();
    expect(nodeById(compiled, 'b').dimmed).toBeUndefined();
    const unrelated = nodeById(compiled, 'unrelated');
    expect(unrelated.dimmed).toBe(true);
    expect(unrelated.opacity).toBe(0.2);
    expect(unrelated.className).toContain('viz-dimmed');

    const ab = compiled.edges.find((e) => e.id === 'ab')!;
    const bu = compiled.edges.find((e) => e.id === 'bu')!;
    expect(ab.dimmed).toBeUndefined();
    expect(bu.dimmed).toBe(true);
  });

  it('focus on a group keeps the whole container and its children visible', () => {
    const compiled = compileSpec({
      view,
      focus: 'g',
      nodes: [
        { id: 'g', type: 'group', x: 200, y: 200 },
        { id: 'child', parent: 'g' },
        { id: 'other', x: 600, y: 200 },
      ],
    });
    expect(nodeById(compiled, 'g').dimmed).toBeUndefined();
    expect(nodeById(compiled, 'child').dimmed).toBeUndefined();
    expect(nodeById(compiled, 'other').dimmed).toBe(true);
  });
});
