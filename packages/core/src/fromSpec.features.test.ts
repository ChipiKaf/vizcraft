/**
 * @vitest-environment jsdom
 *
 * Scene-level and interaction tests for the FR-1…FR-8 declarative features:
 * hydration of compiled specs into `VizScene`, interactive collapse/expand,
 * container-aware signals, and group highlight expansion in step specs.
 */
import { describe, expect, it } from 'vitest';
import { fromSpec } from './fromSpec';
import { createStepControllerFromSpec } from './steps/controller';
import { resolveEdgeGeometryFromData } from './edges/resolveEdgeGeometry';
import { sampleEdgePathFromData } from './edges/pathSampling';
import type { VizSpec } from './spec';
import type { VizNode } from './types';

const view = { width: 1000, height: 600 };

function sceneNode(spec: VizSpec, id: string): VizNode {
  const scene = fromSpec(spec).build();
  const n = scene.nodes.find((n) => n.id === id);
  if (!n) throw new Error(`node '${id}' not in scene`);
  return n;
}

// ---------------------------------------------------------------------------
// Hydration into VizScene
// ---------------------------------------------------------------------------

describe('fromSpec — container hydration', () => {
  const grouped: VizSpec = {
    view,
    nodes: [
      { id: 'github', label: 'Github', type: 'group', x: 200, y: 200 },
      { id: 'gha', label: 'Actions', parent: 'github' },
    ],
    edges: [],
  };

  it('links children to their parent group via parentId', () => {
    expect(sceneNode(grouped, 'gha').parentId).toBe('github');
  });

  it('marks groups as containers with header + padding config', () => {
    const g = sceneNode(grouped, 'github');
    expect(g.container).toBeDefined();
    expect(g.container!.headerHeight).toBe(28);
    expect(g.container!.padding).toEqual({
      top: 24,
      right: 24,
      bottom: 24,
      left: 24,
    });
  });

  it('places the group label in the header strip (negative dy)', () => {
    const g = sceneNode(grouped, 'github');
    expect(g.label!.text).toBe('Github');
    expect(g.label!.dy).toBeLessThan(0);
  });

  it('renders zones behind everything with dashed faint styling', () => {
    const scene = fromSpec({
      view,
      nodes: [
        { id: 'browser', label: 'Browser', type: 'zone' },
        { id: 'm', x: 200, y: 200, zone: 'browser' },
      ],
    }).build();
    const zone = scene.nodes.find((n) => n.id === 'browser')!;
    expect(zone.zIndex).toBe(-10);
    expect(zone.style?.strokeDasharray).toBe('dashed');
    expect(zone.className).toContain('viz-zone');
    expect(zone.parentId).toBeUndefined();
  });

  it('applies port suffixes as fromPort/toPort on scene edges', () => {
    const scene = fromSpec({
      view,
      nodes: [
        { id: 'a', x: 100, y: 100 },
        { id: 'b', x: 400, y: 300 },
      ],
      edges: [{ from: 'a.e', to: 'b.n' }],
    }).build();
    expect(scene.edges[0]!.fromPort).toBe('right');
    expect(scene.edges[0]!.toPort).toBe('top');
  });

  it('applies kind tokens to scene edge styles', () => {
    const scene = fromSpec({
      view,
      nodes: [
        { id: 'a', x: 100, y: 100 },
        { id: 'b', x: 400, y: 100 },
      ],
      edges: [{ from: 'a', to: 'b', kind: 'async' }],
    }).build();
    const e = scene.edges[0]!;
    expect(e.style?.stroke).toBe('#7c3aed');
    expect(e.style?.strokeDasharray).toBe('dashed');
    expect(e.markerEnd).toBe('arrowOpen');
  });

  it('keeps flat specs rendering exactly as before', () => {
    const scene = fromSpec({
      view: { width: 900, height: 360 },
      nodes: [
        { id: 'a', label: 'A', x: 80, y: 180 },
        { id: 'b', label: 'B', x: 420, y: 180, shape: 'circle' },
      ],
      edges: [{ from: 'a', to: 'b', style: 'curved', animate: 'flow' }],
    }).build();

    expect(scene.nodes[0]).toMatchObject({
      id: 'a',
      pos: { x: 80, y: 180 },
      shape: { kind: 'rect', w: 120, h: 40 },
    });
    expect(scene.nodes[1]!.shape).toEqual({ kind: 'circle', r: 20 });
    const e = scene.edges[0]!;
    expect(e.routing).toBe('curved');
    expect(e.waypoints).toBeUndefined();
    expect(e.fromPort).toBeUndefined();
    expect(scene.overlays ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Interactive collapse/expand (FR-7)
// ---------------------------------------------------------------------------

describe('fromSpec — interactive collapse/expand', () => {
  const collapsible: VizSpec = {
    view,
    nodes: [
      {
        id: 'repo',
        label: 'Repo Root',
        type: 'group',
        collapsed: true,
        x: 300,
        y: 200,
      },
      { id: 'a', parent: 'repo' },
      { id: 'b', parent: 'repo' },
      { id: 'ext', x: 700, y: 200 },
    ],
    edges: [{ from: 'ext', to: 'a' }],
  };

  it('starts collapsed when the spec says so', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    fromSpec(collapsible).mount(container);

    expect(container.querySelector('[data-id="repo"]')).not.toBeNull();
    expect(container.querySelector('[data-id="a"]')).toBeNull();
    container.remove();
  });

  it('expands on click and collapses again on a second click', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    fromSpec(collapsible).mount(container);

    const click = () => {
      const el = container.querySelector('[data-id="repo"]');
      expect(el).not.toBeNull();
      el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    };

    click();
    expect(container.querySelector('[data-id="a"]')).not.toBeNull();
    expect(container.querySelector('[data-id="b"]')).not.toBeNull();

    click();
    expect(container.querySelector('[data-id="a"]')).toBeNull();
    container.remove();
  });

  it('shows a child-count badge on the collapsed summary node', () => {
    const scene = fromSpec(collapsible).build();
    const repo = scene.nodes.find((n) => n.id === 'repo')!;
    expect(repo.badges).toEqual([
      expect.objectContaining({ text: '2', position: 'top-right' }),
    ]);
  });
});

// ---------------------------------------------------------------------------
// Container-aware signals (FR-8)
// ---------------------------------------------------------------------------

describe('fromSpec — container-aware signals', () => {
  it('signals sample the routed polyline, not the straight line', () => {
    const scene = fromSpec({
      view,
      nodes: [
        { id: 'g', type: 'group', x: 200, y: 200 },
        { id: 'inner', parent: 'g' },
        { id: 'outer', x: 600, y: 400 },
      ],
      edges: [{ from: 'inner', to: 'outer' }],
    }).build();

    const nodesById = new Map(scene.nodes.map((n) => [n.id, n] as const));
    const edge = scene.edges[0]!;
    expect(edge.waypoints).toBeDefined();

    const geometry = resolveEdgeGeometryFromData(edge, nodesById)!;
    // The path passes through the boundary stub waypoint.
    expect(geometry.d).toContain(`${edge.waypoints![0]!.x}`);

    // Sampling along the edge stays on the orthogonal route: at some point
    // the dot must sit exactly on the wall's x coordinate.
    const samples = Array.from({ length: 21 }, (_, i) =>
      sampleEdgePathFromData(edge, nodesById, i / 20)
    );
    const wallX = edge.waypoints![0]!.x;
    expect(samples.some((p) => p !== null && Math.abs(p.x - wallX) < 1)).toBe(
      true
    );
  });

  it('chains can reference groups (edges terminate on the group boundary)', () => {
    const scene = fromSpec({
      view,
      nodes: [
        { id: 'g', type: 'group', x: 200, y: 200 },
        { id: 'child', parent: 'g' },
        { id: 'svc', x: 600, y: 200 },
      ],
      edges: [{ from: 'svc', to: 'g' }],
      autoSignals: [{ id: 'sig', chain: ['svc', 'g'] }],
    }).build();

    const nodesById = new Map(scene.nodes.map((n) => [n.id, n] as const));
    const start = sampleEdgePathFromData(scene.edges[0]!, nodesById, 0)!;
    const end = sampleEdgePathFromData(scene.edges[0]!, nodesById, 1)!;
    const g = nodesById.get('g')!;
    const gShape = g.shape as { kind: 'rect'; w: number; h: number };
    // The dot lands on the group boundary, not its centre.
    expect(Math.abs(end.x - g.pos.x)).toBeGreaterThanOrEqual(gShape.w / 2 - 1);
    expect(start.x).toBeGreaterThan(end.x);
  });
});

// ---------------------------------------------------------------------------
// Group highlight expansion in steps (FR-8)
// ---------------------------------------------------------------------------

describe('createStepControllerFromSpec — group highlights', () => {
  it('highlighting a group keeps the frame and all descendants undimmed', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const ctrl = createStepControllerFromSpec(
      {
        view,
        nodes: [
          { id: 'g', type: 'group', x: 200, y: 200 },
          { id: 'child', parent: 'g' },
          { id: 'outsider', x: 700, y: 200 },
        ],
        steps: [{ label: 'Focus the group', highlight: ['g'] }],
      },
      container
    );

    const opacityOf = (id: string): string | null => {
      const el = container.querySelector(`[data-id="${id}"]`);
      expect(el, `element ${id}`).not.toBeNull();
      const shape = el!.firstElementChild as SVGElement | null;
      return shape?.getAttribute('opacity') ?? null;
    };

    // The group and its child stay at full opacity; the outsider is dimmed.
    expect(opacityOf('g')).toBeNull();
    expect(opacityOf('child')).toBeNull();
    expect(opacityOf('outsider')).toBe('0.3');

    ctrl.destroy();
    container.remove();
  });
});
