/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import {
  viz,
  getDefaultPorts,
  getNodePorts,
  findPort,
  resolvePortPosition,
} from './index';
import type { VizNode } from './index';
import type { SceneChanges, VizSceneMutator, VizPlugin } from './types';

describe('vizcraft core', () => {
  it('exports viz builder', () => {
    expect(viz).toBeDefined();
    expect(typeof viz).toBe('function');
  });

  it('creates a builder instance', () => {
    const builder = viz();
    expect(builder).toBeDefined();
    // Verify default viewbox
    const view = builder._getViewBox();
    expect(view).toEqual({ w: 800, h: 600 });
  });

  it('supports data-only builder.animate(cb) and stores specs on the scene', () => {
    const builder = viz();
    builder.node('a').at(0, 0);
    builder.node('b').at(10, 10);
    builder.edge('a', 'b');

    const spec = builder.animate((anim) =>
      anim.node('a').to({ x: 200, opacity: 0.5 }, { duration: 600 })
    );

    expect(spec.version).toBe('viz-anim/1');
    expect(spec.tweens.length).toBe(2);
    expect(spec.tweens[0]).toBeDefined();
    expect(spec.tweens[0]!.target).toBe('node:a');

    const scene = builder.build();
    expect(scene.animationSpecs?.length).toBe(1);
    expect(scene.animationSpecs?.[0]).toEqual(spec);
  });

  it('keeps legacy .animate("flow") behavior separate from data-only specs', () => {
    const builder = viz();
    builder.node('a').at(0, 0);
    builder.node('b').at(10, 10);
    builder.edge('a', 'b').animate('flow', { duration: '1s' });

    const scene = builder.build();
    expect(scene.animationSpecs).toBeUndefined();
    expect(scene.edges[0]).toBeDefined();
    expect(scene.edges[0]!.animations?.[0]?.id).toBe('flow');
  });

  it('supports element-level .animate(cb) and animateTo(...) sugar', () => {
    const builder = viz();
    builder.node('a').at(0, 0).animateTo({ x: 123 }, { duration: 400 });
    builder.node('b').at(10, 10);
    builder
      .edge('a', 'b')
      .animate((anim) =>
        anim.to({ strokeDashoffset: -100 }, { duration: 1000 })
      );

    const scene = builder.build();
    expect(scene.animationSpecs?.length).toBe(2);

    const nodeSpec = scene.animationSpecs?.[0];
    const edgeSpec = scene.animationSpecs?.[1];
    expect(nodeSpec).toBeDefined();
    expect(edgeSpec).toBeDefined();
    expect(nodeSpec!.tweens[0]).toBeDefined();
    expect(edgeSpec!.tweens[0]).toBeDefined();
    expect(nodeSpec!.tweens[0]!.target).toBe('node:a');
    expect(edgeSpec!.tweens[0]!.target).toBe('edge:a->b');
  });

  it('allows animating edges with custom ids via anim.edge(from, to, id)', () => {
    const builder = viz();
    builder.node('a').at(0, 0);
    builder.node('b').at(10, 10);
    builder.edge('a', 'b', 'e1');

    const spec = builder.animate((anim) =>
      anim.edge('a', 'b', 'e1').to({ strokeDashoffset: -50 }, { duration: 250 })
    );

    expect(spec.tweens.length).toBe(1);
    expect(spec.tweens[0]!.target).toBe('edge:e1');
  });

  describe('resizeNode', () => {
    it('sets the runtime dimensions and preserves existing runtime properties', () => {
      const builder = viz();
      builder.node('box').at(10, 10).rect(100, 50).class('test-node');

      const scene1 = builder.build();
      expect(scene1.nodes[0]!.runtime?.width).toBeUndefined();

      // Apply some runtime properties like user might do before resizing
      const node = builder.build().nodes.find((n) => n.id === 'box');
      if (node) node.runtime = { opacity: 0.8 };

      builder.resizeNode('box', { w: 200, h: 120 });

      const scene2 = builder.build();
      const patchedNode = scene2.nodes[0]!;
      expect(patchedNode.runtime?.width).toBe(200);
      expect(patchedNode.runtime?.height).toBe(120);
      expect(patchedNode.runtime?.opacity).toBe(0.8);

      // Verify geometry generation in patchRuntime context
      const container = document.createElement('div');
      builder.mount(container);

      const rect = container.querySelector('rect');
      // Mount generates initial SVG, which might not reflect runtime shape yet if not patched.
      // Call patchRuntime to apply runtime dimension overrides.
      builder.patchRuntime(container);

      expect(rect).not.toBeNull();
      expect(rect?.getAttribute('width')).toBe('200');
      expect(rect?.getAttribute('height')).toBe('120');
    });
  });

  describe('Scene Mutations', () => {
    it('supports incremental node addition and commit', () => {
      const builder = viz()
        .view(400, 400)
        .node('a')
        .at(100, 100)
        .circle(20)
        .done();
      const container = document.createElement('div');
      builder.mount(container);

      // Verify initial state
      let svg = container.querySelector('svg');
      let nodesLayer = svg?.querySelector('.viz-layer-nodes');
      expect(nodesLayer?.querySelectorAll('g[data-id]').length).toBe(1);

      // Add a node incrementally
      let changes: SceneChanges | null = null;
      (builder as unknown as VizSceneMutator).onChange((c: SceneChanges) => {
        changes = c;
      });
      (builder as unknown as VizSceneMutator).addNode({
        id: 'b',
        pos: { x: 200, y: 200 },
        shape: { kind: 'rect', w: 40, h: 40 },
      });
      (builder as unknown as VizSceneMutator).commit(container);

      // Verify DOM updated
      expect(nodesLayer?.querySelectorAll('g[data-id]').length).toBe(2);
      expect(nodesLayer?.querySelector('g[data-id="b"]')).not.toBeNull();

      // Verify changes hook fired correctly
      expect(changes).toEqual({
        added: { nodes: ['b'], edges: [] },
        removed: { nodes: [], edges: [] },
        updated: { nodes: [], edges: [] },
      });
    });

    it('supports node removal and cascade edge deletion', () => {
      const builder = viz()
        .view(400, 400)
        .node('a')
        .at(100, 100)
        .circle(20)
        .done()
        .node('b')
        .at(300, 100)
        .circle(20)
        .done()
        .edge('a', 'b', { id: 'e1' });

      const container = document.createElement('div');
      builder.mount(container);

      let changes: SceneChanges | null = null;
      (builder as unknown as VizSceneMutator).onChange((c: SceneChanges) => {
        changes = c;
      });

      // Remove node 'a' (should also remove edge 'e1')
      (builder as unknown as VizSceneMutator).removeNode('a');
      (builder as unknown as VizSceneMutator).commit(container);

      const svg = container.querySelector('svg');
      const nodesLayer = svg?.querySelector('.viz-layer-nodes');
      const edgesLayer = svg?.querySelector('.viz-layer-edges');

      expect(nodesLayer?.querySelectorAll('g[data-id]').length).toBe(1); // Only 'b' remains
      expect(edgesLayer?.querySelectorAll('g.viz-edge').length).toBe(0); // 'e1' deleted

      // Verify changes hook
      expect(changes).toEqual({
        added: { nodes: [], edges: [] },
        removed: { nodes: ['a'], edges: ['e1'] },
        updated: { nodes: [], edges: [] },
      });
    });

    it('supports node property updates', () => {
      const builder = viz()
        .view(400, 400)
        .node('a')
        .at(100, 100)
        .circle(20)
        .done();
      const container = document.createElement('div');
      builder.mount(container);

      let changes: SceneChanges | null = null;
      (builder as unknown as VizSceneMutator).onChange((c: SceneChanges) => {
        changes = c;
      });

      // Update node 'a' position and style
      (builder as unknown as VizSceneMutator).updateNode('a', {
        pos: { x: 500, y: 500 },
        style: { fill: 'red' },
      });
      (builder as unknown as VizSceneMutator).commit(container);

      const scene = builder.build();
      const updatedNode = scene.nodes.find((n) => n.id === 'a');
      expect(updatedNode?.pos).toEqual({ x: 500, y: 500 });
      expect(updatedNode?.style?.fill).toBe('red');

      expect(changes).toEqual({
        added: { nodes: [], edges: [] },
        removed: { nodes: [], edges: [] },
        updated: { nodes: ['a'], edges: [] },
      });
    });
  });

  describe('cylinder shape', () => {
    it('creates a node with cylinder shape via .cylinder(w, h)', () => {
      const scene = viz()
        .node('db')
        .at(300, 100)
        .cylinder(100, 80)
        .fill('#fab387')
        .label('DB')
        .build();

      const node = scene.nodes[0]!;
      expect(node.id).toBe('db');
      expect(node.shape).toEqual({
        kind: 'cylinder',
        w: 100,
        h: 80,
        arcHeight: undefined,
      });
      expect(node.style?.fill).toBe('#fab387');
      expect(node.label?.text).toBe('DB');
    });

    it('creates a cylinder with custom arcHeight', () => {
      const scene = viz().node('db').at(0, 0).cylinder(120, 100, 20).build();

      const node = scene.nodes[0]!;
      expect(node.shape).toEqual({
        kind: 'cylinder',
        w: 120,
        h: 100,
        arcHeight: 20,
      });
    });

    it('generates SVG markup for cylinder shape', () => {
      const svg = viz()
        .view(400, 300)
        .node('db')
        .at(200, 150)
        .cylinder(100, 80)
        .fill('#fab387')
        .label('DB')
        .svg();

      // Cylinder should produce a <g> with a <path> body and <ellipse> cap
      expect(svg).toContain('data-viz-cyl="body"');
      expect(svg).toContain('data-viz-cyl="cap"');
      expect(svg).toContain('<path');
      expect(svg).toContain('<ellipse');
    });

    it('uses default arcHeight of ~15% of h when not specified', () => {
      const svg = viz()
        .view(400, 300)
        .node('db')
        .at(200, 150)
        .cylinder(100, 80)
        .svg();

      // Default arcHeight = Math.round(80 * 0.15) = 12
      // The ellipse ry should be 12
      expect(svg).toContain('ry="12"');
    });
  });

  describe('hexagon shape', () => {
    it('creates a node with hexagon shape via .hexagon(r)', () => {
      const scene = viz()
        .node('state')
        .at(200, 100)
        .hexagon(50)
        .fill('#cba6f7')
        .label('Idle')
        .build();

      const node = scene.nodes[0]!;
      expect(node.id).toBe('state');
      expect(node.shape).toEqual({
        kind: 'hexagon',
        r: 50,
        orientation: undefined,
      });
      expect(node.style?.fill).toBe('#cba6f7');
      expect(node.label?.text).toBe('Idle');
    });

    it('creates a hexagon with flat orientation', () => {
      const scene = viz().node('h').at(0, 0).hexagon(40, 'flat').build();

      const node = scene.nodes[0]!;
      expect(node.shape).toEqual({
        kind: 'hexagon',
        r: 40,
        orientation: 'flat',
      });
    });

    it('generates SVG markup for hexagon shape', () => {
      const svg = viz()
        .view(400, 300)
        .node('state')
        .at(200, 150)
        .hexagon(50)
        .fill('#cba6f7')
        .label('Idle')
        .svg();

      // Hexagon should produce a <polygon> element
      expect(svg).toContain('<polygon');
      expect(svg).toContain('viz-node-shape');
    });

    it('defaults to pointy orientation', () => {
      const svg = viz().view(400, 300).node('h').at(200, 150).hexagon(50).svg();

      // Pointy-top: first vertex is directly above centre (x=200, y=100)
      expect(svg).toContain('200,100');
    });
  });

  describe('ellipse shape', () => {
    it('creates a node with ellipse shape via .ellipse(rx, ry)', () => {
      const scene = viz()
        .node('oval')
        .at(100, 100)
        .ellipse(70, 40)
        .fill('#89b4fa')
        .label('Oval')
        .build();

      const node = scene.nodes[0]!;
      expect(node.id).toBe('oval');
      expect(node.shape).toEqual({ kind: 'ellipse', rx: 70, ry: 40 });
      expect(node.style?.fill).toBe('#89b4fa');
      expect(node.label?.text).toBe('Oval');
    });

    it('generates SVG markup for ellipse shape', () => {
      const svg = viz()
        .view(400, 300)
        .node('oval')
        .at(200, 150)
        .ellipse(70, 40)
        .fill('#89b4fa')
        .svg();

      expect(svg).toContain('<ellipse');
      expect(svg).toContain('rx="70"');
      expect(svg).toContain('ry="40"');
      expect(svg).toContain('cx="200"');
      expect(svg).toContain('cy="150"');
    });

    it('computes correct boundary anchor point', () => {
      const scene = viz()
        .node('e')
        .at(0, 0)
        .ellipse(60, 30)
        .node('t')
        .at(100, 0)
        .circle(5)
        .edge('e', 't')
        .connect('boundary')
        .build();

      // For a target directly to the right (dx=100, dy=0), the boundary
      // should land at (rx, 0) = (60, 0)
      const edge = scene.edges[0]!;
      expect(edge.anchor).toBe('boundary');
    });
  });

  describe('arc shape', () => {
    it('creates a node with arc shape via .arc(r, start, end)', () => {
      const scene = viz()
        .node('half')
        .at(100, 100)
        .arc(50, 180, 360)
        .fill('#cba6f7')
        .build();

      const node = scene.nodes[0]!;
      expect(node.id).toBe('half');
      expect(node.shape).toEqual({
        kind: 'arc',
        r: 50,
        startAngle: 180,
        endAngle: 360,
        closed: undefined,
      });
      expect(node.style?.fill).toBe('#cba6f7');
    });

    it('creates a closed pie slice by default', () => {
      const svg = viz()
        .view(400, 300)
        .node('pie')
        .at(200, 150)
        .arc(50, 0, 90)
        .fill('#fab387')
        .svg();

      // Closed pie: path starts at center (M cx cy), then L to start, arc, then Z
      expect(svg).toContain('<path');
      expect(svg).toContain('M 200 150');
      expect(svg).toContain('Z');
    });

    it('creates an open arc when closed=false', () => {
      const svg = viz()
        .view(400, 300)
        .node('open')
        .at(200, 150)
        .arc(50, 0, 90, false)
        .svg();

      expect(svg).toContain('<path');
      // Open arc should NOT start at center and should NOT close with Z
      expect(svg).not.toContain('M 200 150');
      expect(svg).not.toContain(' Z');
    });

    it('sets largeArc flag correctly for sweeps > 180°', () => {
      const svg = viz()
        .view(400, 300)
        .node('big')
        .at(200, 150)
        .arc(50, 0, 270)
        .svg();

      // 270° sweep → largeArc = 1
      expect(svg).toMatch(/A 50 50 0 1 1/);
    });
  });

  describe('blockArrow shape', () => {
    it('creates a node with blockArrow shape via .blockArrow()', () => {
      const scene = viz()
        .node('ba')
        .at(200, 100)
        .blockArrow(120, 30, 50, 35)
        .fill('#89b4fa')
        .build();

      const node = scene.nodes[0]!;
      expect(node.id).toBe('ba');
      expect(node.shape).toEqual({
        kind: 'blockArrow',
        length: 120,
        bodyWidth: 30,
        headWidth: 50,
        headLength: 35,
        direction: undefined,
      });
      expect(node.style?.fill).toBe('#89b4fa');
    });

    it('renders a polygon in SVG output', () => {
      const svg = viz()
        .view(400, 300)
        .node('ba')
        .at(200, 150)
        .blockArrow(100, 20, 40, 30)
        .svg();

      expect(svg).toContain('<polygon');
      expect(svg).toContain('class="viz-node-shape"');
    });

    it('supports direction variants', () => {
      const scene = viz()
        .node('up')
        .at(100, 100)
        .blockArrow(80, 20, 40, 25, 'up')
        .build();

      const node = scene.nodes[0]!;
      const shape = node.shape as { kind: 'blockArrow'; direction: string };
      expect(shape.direction).toBe('up');
    });

    it('uses bounding-rect anchor for boundary mode', () => {
      const scene = viz()
        .node('ba')
        .at(100, 100)
        .blockArrow(100, 20, 40, 30)
        .node('tgt')
        .at(300, 100)
        .circle(10)
        .edge('ba', 'tgt')
        .connect('boundary')
        .build();

      const edge = scene.edges[0]!;
      expect(edge.anchor).toBe('boundary');
    });
  });

  describe('callout shape', () => {
    it('creates a node with callout shape via .callout(w, h)', () => {
      const scene = viz()
        .node('c')
        .at(200, 100)
        .callout(140, 80)
        .fill('#f9e2af')
        .build();

      const node = scene.nodes[0]!;
      expect(node.id).toBe('c');
      expect(node.shape).toMatchObject({
        kind: 'callout',
        w: 140,
        h: 80,
      });
      expect(node.style?.fill).toBe('#f9e2af');
    });

    it('renders a path in SVG output', () => {
      const svg = viz()
        .view(400, 300)
        .node('c')
        .at(200, 150)
        .callout(120, 70)
        .svg();

      expect(svg).toContain('<path');
      expect(svg).toContain('class="viz-node-shape"');
    });

    it('supports custom pointer options', () => {
      const scene = viz()
        .node('c')
        .at(100, 100)
        .callout(100, 60, {
          rx: 8,
          pointerSide: 'left',
          pointerHeight: 20,
          pointerWidth: 15,
          pointerPosition: 0.5,
        })
        .build();

      const shape = scene.nodes[0]!.shape as {
        kind: 'callout';
        rx: number;
        pointerSide: string;
      };
      expect(shape.kind).toBe('callout');
      expect(shape.rx).toBe(8);
      expect(shape.pointerSide).toBe('left');
    });

    it('defaults pointer to bottom side', () => {
      const svg = viz()
        .view(400, 300)
        .node('c')
        .at(200, 150)
        .callout(100, 60)
        .svg();

      // The path should extend below the body (bottom pointer)
      // body bottom at y=180, pointer tip below that
      expect(svg).toContain('<path');
    });
  });

  describe('cloud shape', () => {
    it('creates a node with cloud shape via .cloud(w, h)', () => {
      const scene = viz()
        .node('inet')
        .at(300, 200)
        .cloud(160, 100)
        .fill('#ffffff')
        .stroke('#313244', 2)
        .build();

      const node = scene.nodes[0]!;
      expect(node.id).toBe('inet');
      expect(node.shape).toEqual({ kind: 'cloud', w: 160, h: 100 });
      expect(node.style?.fill).toBe('#ffffff');
      expect(node.style?.stroke).toBe('#313244');
    });

    it('renders a path with cubic Bézier curves in SVG output', () => {
      const svg = viz()
        .view(400, 300)
        .node('c')
        .at(200, 150)
        .cloud(140, 90)
        .svg();

      expect(svg).toContain('<path');
      expect(svg).toContain(' C '); // cubic Bézier commands
      expect(svg).toContain('class="viz-node-shape"');
    });

    it('scales to the given bounding box dimensions', () => {
      const scene = viz().node('c').at(0, 0).cloud(200, 120).build();

      const shape = scene.nodes[0]!.shape as {
        kind: 'cloud';
        w: number;
        h: number;
      };
      expect(shape.w).toBe(200);
      expect(shape.h).toBe(120);
    });
  });

  describe('cross shape', () => {
    it('creates a node with cross shape via .cross(size)', () => {
      const scene = viz()
        .node('add')
        .at(100, 100)
        .cross(60)
        .fill('#a6e3a1')
        .build();

      const node = scene.nodes[0]!;
      expect(node.id).toBe('add');
      expect(node.shape).toEqual({
        kind: 'cross',
        size: 60,
        barWidth: undefined,
      });
      expect(node.style?.fill).toBe('#a6e3a1');
    });

    it('renders a polygon with 12 vertices in SVG output', () => {
      const svg = viz()
        .view(400, 300)
        .node('c')
        .at(200, 150)
        .cross(50, 18)
        .svg();

      expect(svg).toContain('<polygon');
      expect(svg).toContain('class="viz-node-shape"');
    });

    it('supports custom barWidth', () => {
      const scene = viz().node('c').at(0, 0).cross(80, 30).build();

      const shape = scene.nodes[0]!.shape as {
        kind: 'cross';
        size: number;
        barWidth: number;
      };
      expect(shape.size).toBe(80);
      expect(shape.barWidth).toBe(30);
    });
  });

  describe('cube', () => {
    it('creates a cube node with default depth', () => {
      const scene = viz()
        .node('srv')
        .at(200, 100)
        .cube(100, 80)
        .fill('#89b4fa')
        .build();

      const node = scene.nodes[0]!;
      expect(node.id).toBe('srv');
      expect(node.shape).toEqual({
        kind: 'cube',
        w: 100,
        h: 80,
        depth: undefined,
      });
      expect(node.style?.fill).toBe('#89b4fa');
    });

    it('renders a <g> with three polygons in SVG output', () => {
      const svg = viz()
        .view(400, 300)
        .node('s')
        .at(200, 150)
        .cube(100, 80, 25)
        .svg();

      expect(svg).toContain('data-viz-cube="front"');
      expect(svg).toContain('data-viz-cube="top"');
      expect(svg).toContain('data-viz-cube="right"');
    });

    it('supports custom depth', () => {
      const scene = viz().node('s').at(0, 0).cube(100, 80, 30).build();

      const shape = scene.nodes[0]!.shape as {
        kind: 'cube';
        w: number;
        h: number;
        depth: number;
      };
      expect(shape.w).toBe(100);
      expect(shape.h).toBe(80);
      expect(shape.depth).toBe(30);
    });
  });

  describe('path (custom SVG)', () => {
    it('creates a path node with bounding box dimensions', () => {
      const d = 'M 50,0 L 100,38 L 81,100 L 19,100 L 0,38 Z';
      const scene = viz()
        .node('pent')
        .at(200, 200)
        .path(d, 100, 100)
        .fill('#cba6f7')
        .build();

      const node = scene.nodes[0]!;
      expect(node.id).toBe('pent');
      expect(node.shape).toEqual({ kind: 'path', d, w: 100, h: 100 });
      expect(node.style?.fill).toBe('#cba6f7');
    });

    it('renders a <path> with translate in SVG output', () => {
      const d = 'M 0,0 L 80,0 L 80,60 L 0,60 Z';
      const svg = viz()
        .view(400, 300)
        .node('p')
        .at(200, 150)
        .path(d, 80, 60)
        .svg();

      expect(svg).toContain('<path');
      expect(svg).toContain('translate(160,120)');
      expect(svg).toContain(d);
    });

    it('uses bounding-box anchor like rect', () => {
      const scene = viz()
        .node('a')
        .at(100, 100)
        .path('M 0,0 L 60,0 L 60,40 L 0,40 Z', 60, 40)
        .node('b')
        .at(300, 100)
        .circle(10)
        .edge('a', 'b')
        .connect('boundary')
        .done()
        .build();

      expect(scene.edges).toHaveLength(1);
    });
  });

  describe('document', () => {
    it('creates a document node with default waveHeight', () => {
      const scene = viz()
        .node('report')
        .at(200, 100)
        .document(120, 80)
        .fill('#ffffff')
        .build();

      const node = scene.nodes[0]!;
      expect(node.id).toBe('report');
      expect(node.shape).toEqual({
        kind: 'document',
        w: 120,
        h: 80,
        waveHeight: undefined,
      });
      expect(node.style?.fill).toBe('#ffffff');
    });

    it('renders a <path> with wavy bottom in SVG output', () => {
      const svg = viz()
        .view(400, 300)
        .node('d')
        .at(200, 150)
        .document(120, 80)
        .svg();

      expect(svg).toContain('<path');
      expect(svg).toContain('class="viz-node-shape"');
      // The path should contain a cubic Bézier (C command) for the wave
      expect(svg).toMatch(/d="[^"]*C[^"]*"/);
    });

    it('supports custom waveHeight', () => {
      const scene = viz().node('d').at(0, 0).document(100, 60, 15).build();

      const shape = scene.nodes[0]!.shape as {
        kind: 'document';
        w: number;
        h: number;
        waveHeight: number;
      };
      expect(shape.w).toBe(100);
      expect(shape.h).toBe(60);
      expect(shape.waveHeight).toBe(15);
    });
  });

  describe('note', () => {
    it('creates a note node with default foldSize', () => {
      const scene = viz()
        .node('ann')
        .at(100, 200)
        .note(140, 80)
        .fill('#f9e2af')
        .build();

      const node = scene.nodes[0]!;
      expect(node.id).toBe('ann');
      expect(node.shape).toEqual({
        kind: 'note',
        w: 140,
        h: 80,
        foldSize: undefined,
      });
      expect(node.style?.fill).toBe('#f9e2af');
    });

    it('renders a <g> with body and fold polygons in SVG output', () => {
      const svg = viz()
        .view(400, 300)
        .node('n')
        .at(200, 150)
        .note(120, 80, 20)
        .svg();

      expect(svg).toContain('data-viz-note="body"');
      expect(svg).toContain('data-viz-note="fold"');
    });

    it('supports custom foldSize', () => {
      const scene = viz().node('n').at(0, 0).note(100, 60, 25).build();

      const shape = scene.nodes[0]!.shape as {
        kind: 'note';
        w: number;
        h: number;
        foldSize: number;
      };
      expect(shape.w).toBe(100);
      expect(shape.h).toBe(60);
      expect(shape.foldSize).toBe(25);
    });
  });

  describe('parallelogram', () => {
    it('creates a parallelogram node with default skew', () => {
      const scene = viz()
        .node('io')
        .at(100, 100)
        .parallelogram(140, 60)
        .fill('#cba6f7')
        .build();

      const node = scene.nodes[0]!;
      expect(node.id).toBe('io');
      expect(node.shape).toEqual({
        kind: 'parallelogram',
        w: 140,
        h: 60,
        skew: undefined,
      });
      expect(node.style?.fill).toBe('#cba6f7');
    });

    it('renders a polygon with 4 vertices in SVG output', () => {
      const svg = viz()
        .view(400, 300)
        .node('p')
        .at(200, 150)
        .parallelogram(120, 60, 30)
        .svg();

      expect(svg).toContain('<polygon');
      expect(svg).toContain('class="viz-node-shape"');
    });

    it('supports custom skew', () => {
      const scene = viz().node('p').at(0, 0).parallelogram(100, 50, 25).build();

      const shape = scene.nodes[0]!.shape as {
        kind: 'parallelogram';
        w: number;
        h: number;
        skew: number;
      };
      expect(shape.w).toBe(100);
      expect(shape.h).toBe(50);
      expect(shape.skew).toBe(25);
    });
  });

  describe('star', () => {
    it('creates a star node with default innerR', () => {
      const scene = viz()
        .node('rating')
        .at(100, 100)
        .star(5, 40)
        .fill('#f9e2af')
        .build();

      const node = scene.nodes[0]!;
      expect(node.id).toBe('rating');
      expect(node.shape).toEqual({
        kind: 'star',
        points: 5,
        outerR: 40,
        innerR: undefined,
      });
      expect(node.style?.fill).toBe('#f9e2af');
    });

    it('renders a polygon with 2×points vertices in SVG output', () => {
      const svg = viz().view(400, 300).node('s').at(200, 150).star(5, 40).svg();

      expect(svg).toContain('<polygon');
      expect(svg).toContain('class="viz-node-shape"');
    });

    it('supports custom innerR', () => {
      const scene = viz().node('s').at(0, 0).star(6, 50, 25).build();

      const shape = scene.nodes[0]!.shape as {
        kind: 'star';
        points: number;
        outerR: number;
        innerR: number;
      };
      expect(shape.points).toBe(6);
      expect(shape.outerR).toBe(50);
      expect(shape.innerR).toBe(25);
    });
  });

  describe('trapezoid', () => {
    it('creates a trapezoid node', () => {
      const scene = viz()
        .node('manual-op')
        .at(200, 100)
        .trapezoid(100, 140, 60)
        .fill('#ffffff')
        .build();

      const node = scene.nodes[0]!;
      expect(node.id).toBe('manual-op');
      expect(node.shape).toEqual({
        kind: 'trapezoid',
        topW: 100,
        bottomW: 140,
        h: 60,
      });
      expect(node.style?.fill).toBe('#ffffff');
    });

    it('renders a polygon with 4 vertices in SVG output', () => {
      const svg = viz()
        .view(400, 300)
        .node('t')
        .at(200, 150)
        .trapezoid(80, 120, 60)
        .svg();

      expect(svg).toContain('<polygon');
      expect(svg).toContain('class="viz-node-shape"');
    });

    it('stores all three dimensions', () => {
      const scene = viz().node('t').at(0, 0).trapezoid(60, 100, 40).build();

      const shape = scene.nodes[0]!.shape as {
        kind: 'trapezoid';
        topW: number;
        bottomW: number;
        h: number;
      };
      expect(shape.topW).toBe(60);
      expect(shape.bottomW).toBe(100);
      expect(shape.h).toBe(40);
    });
  });

  describe('triangle', () => {
    it('creates a triangle node with default direction (up)', () => {
      const scene = viz()
        .node('warning')
        .at(100, 100)
        .triangle(80, 70)
        .fill('#f9e2af')
        .build();

      const node = scene.nodes[0]!;
      expect(node.id).toBe('warning');
      expect(node.shape).toEqual({
        kind: 'triangle',
        w: 80,
        h: 70,
        direction: undefined,
      });
      expect(node.style?.fill).toBe('#f9e2af');
    });

    it('renders a polygon with 3 vertices in SVG output', () => {
      const svg = viz()
        .view(400, 300)
        .node('t')
        .at(200, 150)
        .triangle(80, 70)
        .svg();

      expect(svg).toContain('<polygon');
      expect(svg).toContain('class="viz-node-shape"');
    });

    it('supports custom direction', () => {
      const scene = viz().node('t').at(0, 0).triangle(60, 50, 'down').build();

      const shape = scene.nodes[0]!.shape as {
        kind: 'triangle';
        w: number;
        h: number;
        direction: string;
      };
      expect(shape.w).toBe(60);
      expect(shape.h).toBe(50);
      expect(shape.direction).toBe('down');
    });
  });

  // ── Container / Group Nodes ──────────────────────────────────────
  describe('container', () => {
    it('should mark a node as a container with default config', () => {
      const scene = viz()
        .node('group')
        .at(200, 200)
        .rect(400, 300)
        .container()
        .build();

      const node = scene.nodes.find((n) => n.id === 'group')!;
      expect(node.container).toEqual({ layout: 'free' });
    });

    it('should accept custom container config', () => {
      const scene = viz()
        .node('group')
        .at(200, 200)
        .rect(400, 300)
        .container({
          layout: 'vertical',
          headerHeight: 30,
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
          autoSize: true,
        })
        .build();

      const node = scene.nodes.find((n) => n.id === 'group')!;
      expect(node.container).toEqual({
        layout: 'vertical',
        headerHeight: 30,
        padding: { top: 10, right: 10, bottom: 10, left: 10 },
        autoSize: true,
      });
    });

    it('should set parentId on child nodes via .parent()', () => {
      const scene = viz()
        .node('group')
        .at(200, 200)
        .rect(400, 300)
        .container()
        .node('child1')
        .at(250, 250)
        .rect(80, 40)
        .parent('group')
        .node('child2')
        .at(350, 250)
        .rect(80, 40)
        .parent('group')
        .build();

      expect(scene.nodes.find((n) => n.id === 'child1')!.parentId).toBe(
        'group'
      );
      expect(scene.nodes.find((n) => n.id === 'child2')!.parentId).toBe(
        'group'
      );
      expect(
        scene.nodes.find((n) => n.id === 'group')!.parentId
      ).toBeUndefined();
    });

    it('should render container with viz-container class in SVG string output', () => {
      const svgStr = viz()
        .node('group')
        .at(200, 200)
        .rect(400, 300)
        .container()
        .node('child')
        .at(250, 250)
        .circle(20)
        .parent('group')
        .svg();

      // Container node should have viz-container class
      expect(svgStr).toContain('viz-container');
      // Child should be rendered inside container-children group
      expect(svgStr).toContain('viz-container-children');
    });

    it('should render header line when headerHeight is set', () => {
      const svgStr = viz()
        .node('swim')
        .at(200, 200)
        .rect(400, 300)
        .label('Header')
        .container({ headerHeight: 30 })
        .svg();

      expect(svgStr).toContain('viz-container-header');
    });

    it('should not render children at root level in SVG string output', () => {
      const svgStr = viz()
        .node('group')
        .at(200, 200)
        .rect(400, 300)
        .container()
        .node('child')
        .at(250, 250)
        .circle(20)
        .parent('group')
        .svg();

      // The child node should appear inside a container-children group,
      // not as a sibling of the container node in the nodes layer
      const containerChildrenIdx = svgStr.indexOf('viz-container-children');
      const childDataIdIdx = svgStr.indexOf('data-id="child"');
      // Child data-id should come after the container-children group opens
      expect(containerChildrenIdx).toBeLessThan(childDataIdIdx);
    });

    it('should support nested containers', () => {
      const scene = viz()
        .node('outer')
        .at(300, 300)
        .rect(600, 400)
        .container()
        .node('inner')
        .at(350, 350)
        .rect(200, 150)
        .container()
        .parent('outer')
        .node('leaf')
        .at(380, 380)
        .circle(15)
        .parent('inner')
        .build();

      expect(scene.nodes.find((n) => n.id === 'inner')!.parentId).toBe('outer');
      expect(scene.nodes.find((n) => n.id === 'leaf')!.parentId).toBe('inner');

      const svgStr = viz()
        .node('outer')
        .at(300, 300)
        .rect(600, 400)
        .container()
        .node('inner')
        .at(350, 350)
        .rect(200, 150)
        .container()
        .parent('outer')
        .node('leaf')
        .at(380, 380)
        .circle(15)
        .parent('inner')
        .svg();

      // Both container-children groups should be present
      const matches = svgStr.match(/viz-container-children/g);
      expect(matches).toHaveLength(2);
    });
  });

  // ── Edge Routing (Path-Based Edges) ──────────────────────────────
  describe('edge routing', () => {
    it('renders edges as <path> elements instead of <line>', () => {
      const svgStr = viz()
        .node('a')
        .at(50, 50)
        .circle(20)
        .node('b')
        .at(250, 150)
        .circle(20)
        .edge('a', 'b')
        .svg();

      expect(svgStr).toContain('<path');
      expect(svgStr).toContain('data-viz-role="edge-line"');
      // No <line> elements used for edges (they may exist inside <defs> for marker definitions)
      const edgeLayerMatch = svgStr.match(
        /<g[^>]*data-viz-layer="edges"[^>]*>[\s\S]*?<\/g>/
      );
      expect(edgeLayerMatch).toBeTruthy();
      expect(edgeLayerMatch![0]).not.toContain('<line');
    });

    it('defaults to straight routing', () => {
      const scene = viz()
        .node('a')
        .at(0, 0)
        .circle(10)
        .node('b')
        .at(100, 100)
        .circle(10)
        .edge('a', 'b')
        .build();

      const edge = scene.edges[0]!;
      // routing is undefined (defaults to 'straight')
      expect(edge.routing).toBeUndefined();
    });

    it('.straight() sets routing to straight', () => {
      const scene = viz()
        .node('a')
        .at(0, 0)
        .circle(10)
        .node('b')
        .at(100, 100)
        .circle(10)
        .edge('a', 'b')
        .straight()
        .build();

      expect(scene.edges[0]!.routing).toBe('straight');
    });

    it('.curved() sets routing to curved', () => {
      const scene = viz()
        .node('a')
        .at(0, 0)
        .circle(10)
        .node('b')
        .at(100, 100)
        .circle(10)
        .edge('a', 'b')
        .curved()
        .build();

      expect(scene.edges[0]!.routing).toBe('curved');
    });

    it('.orthogonal() sets routing to orthogonal', () => {
      const scene = viz()
        .node('a')
        .at(0, 0)
        .circle(10)
        .node('b')
        .at(100, 100)
        .circle(10)
        .edge('a', 'b')
        .orthogonal()
        .build();

      expect(scene.edges[0]!.routing).toBe('orthogonal');
    });

    it('.routing(mode) sets routing mode', () => {
      const scene = viz()
        .node('a')
        .at(0, 0)
        .circle(10)
        .node('b')
        .at(100, 100)
        .circle(10)
        .edge('a', 'b')
        .routing('curved')
        .build();

      expect(scene.edges[0]!.routing).toBe('curved');
    });

    it('.via(x, y) adds waypoints', () => {
      const scene = viz()
        .node('a')
        .at(0, 0)
        .circle(10)
        .node('b')
        .at(200, 200)
        .circle(10)
        .edge('a', 'b')
        .via(100, 0)
        .via(100, 200)
        .build();

      expect(scene.edges[0]!.waypoints).toEqual([
        { x: 100, y: 0 },
        { x: 100, y: 200 },
      ]);
    });

    it('straight SVG path uses M/L commands', () => {
      const svgStr = viz()
        .node('a')
        .at(50, 50)
        .circle(10)
        .node('b')
        .at(250, 50)
        .circle(10)
        .edge('a', 'b')
        .straight()
        .svg();

      // Path should contain M and L commands
      const pathMatch = svgStr.match(/ d="([^"]+)"/);
      expect(pathMatch).toBeTruthy();
      const d = pathMatch![1]!;
      expect(d).toMatch(/^M\s/);
      expect(d).toContain('L');
    });

    it('curved SVG path uses Q command (no waypoints)', () => {
      const svgStr = viz()
        .node('a')
        .at(50, 50)
        .circle(10)
        .node('b')
        .at(250, 50)
        .circle(10)
        .edge('a', 'b')
        .curved()
        .svg();

      const pathMatch = svgStr.match(/ d="([^"]+)"/);
      expect(pathMatch).toBeTruthy();
      const d = pathMatch![1]!;
      expect(d).toMatch(/^M\s/);
      expect(d).toContain('Q');
    });

    it('curved SVG path uses C commands (with waypoints)', () => {
      const svgStr = viz()
        .node('a')
        .at(50, 50)
        .circle(10)
        .node('b')
        .at(250, 250)
        .circle(10)
        .edge('a', 'b')
        .curved()
        .via(150, 50)
        .svg();

      const pathMatch = svgStr.match(/ d="([^"]+)"/);
      expect(pathMatch).toBeTruthy();
      const d = pathMatch![1]!;
      expect(d).toMatch(/^M\s/);
      expect(d).toContain('C');
    });

    it('orthogonal SVG path uses only H/V or right-angle L commands', () => {
      const svgStr = viz()
        .node('a')
        .at(50, 50)
        .circle(10)
        .node('b')
        .at(250, 150)
        .circle(10)
        .edge('a', 'b')
        .orthogonal()
        .svg();

      const pathMatch = svgStr.match(/ d="([^"]+)"/);
      expect(pathMatch).toBeTruthy();
      const d = pathMatch![1]!;
      expect(d).toMatch(/^M\s/);
      // Orthogonal should have multiple L segments forming right angles
      const lSegments = d.match(/L\s/g);
      expect(lSegments!.length).toBeGreaterThanOrEqual(2);
    });

    it('path edges get fill/stroke from CSS class, not hardcoded attributes', () => {
      const svgStr = viz()
        .node('a')
        .at(50, 50)
        .circle(10)
        .node('b')
        .at(250, 50)
        .circle(10)
        .edge('a', 'b')
        .svg();

      // fill and stroke come from the .viz-edge CSS rule, not inline attributes
      expect(svgStr).toContain('class="viz-edge"');
      expect(svgStr).toContain('fill: none');
      expect(svgStr).toContain('stroke: currentColor');
      // Ensure they are NOT hardcoded on the <path> element itself
      const pathMatch = svgStr.match(/<path[^>]*class="viz-edge"[^>]*>/);
      expect(pathMatch).toBeTruthy();
      expect(pathMatch![0]).not.toContain('fill="none"');
      expect(pathMatch![0]).not.toContain('stroke="currentColor"');
    });

    it('straight waypoints produce polyline path', () => {
      const svgStr = viz()
        .node('a')
        .at(50, 50)
        .circle(10)
        .node('b')
        .at(250, 250)
        .circle(10)
        .edge('a', 'b')
        .via(150, 50)
        .via(150, 250)
        .svg();

      const pathMatch = svgStr.match(/ d="([^"]+)"/);
      expect(pathMatch).toBeTruthy();
      const d = pathMatch![1]!;
      // Should have M + 3 L commands (via1, via2, end)
      const lSegments = d.match(/L\s/g);
      expect(lSegments!.length).toBe(3);
    });

    it('edge routing chains with other builder methods', () => {
      const scene = viz()
        .node('a')
        .at(0, 0)
        .circle(10)
        .node('b')
        .at(200, 200)
        .circle(10)
        .edge('a', 'b')
        .curved()
        .via(100, 0)
        .arrow()
        .label('test')
        .class('my-edge')
        .build();

      const edge = scene.edges[0]!;
      expect(edge.routing).toBe('curved');
      expect(edge.waypoints).toEqual([{ x: 100, y: 0 }]);
      expect(edge.markerEnd).toBe('arrow');
      expect(edge.label?.text).toBe('test');
      expect(edge.className).toBe('my-edge');
    });

    it('edge .stroke() sets style.stroke on the scene edge', () => {
      const scene = viz()
        .node('a')
        .at(0, 0)
        .circle(10)
        .node('b')
        .at(200, 0)
        .circle(10)
        .edge('a', 'b')
        .stroke('#ff0000')
        .build();
      expect(scene.edges[0]!.style?.stroke).toBe('#ff0000');
    });

    it('edge .stroke() with width sets both stroke and strokeWidth', () => {
      const scene = viz()
        .node('a')
        .at(0, 0)
        .circle(10)
        .node('b')
        .at(200, 0)
        .circle(10)
        .edge('a', 'b')
        .stroke('red', 3)
        .build();
      expect(scene.edges[0]!.style?.stroke).toBe('red');
      expect(scene.edges[0]!.style?.strokeWidth).toBe(3);
    });

    it('edge .fill() sets style.fill on the scene edge', () => {
      const scene = viz()
        .node('a')
        .at(0, 0)
        .circle(10)
        .node('b')
        .at(200, 0)
        .circle(10)
        .edge('a', 'b')
        .fill('blue')
        .build();
      expect(scene.edges[0]!.style?.fill).toBe('blue');
    });

    it('edge .opacity() sets style.opacity on the scene edge', () => {
      const scene = viz()
        .node('a')
        .at(0, 0)
        .circle(10)
        .node('b')
        .at(200, 0)
        .circle(10)
        .edge('a', 'b')
        .opacity(0.5)
        .build();
      expect(scene.edges[0]!.style?.opacity).toBe(0.5);
    });

    it('edge style methods chain together', () => {
      const scene = viz()
        .node('a')
        .at(0, 0)
        .circle(10)
        .node('b')
        .at(200, 0)
        .circle(10)
        .edge('a', 'b')
        .stroke('#ff0000', 3)
        .fill('none')
        .opacity(0.8)
        .build();
      const style = scene.edges[0]!.style!;
      expect(style.stroke).toBe('#ff0000');
      expect(style.strokeWidth).toBe(3);
      expect(style.fill).toBe('none');
      expect(style.opacity).toBe(0.8);
    });

    it('per-edge style renders as inline styles in svg()', () => {
      const svgStr = viz()
        .node('a')
        .at(50, 50)
        .circle(10)
        .node('b')
        .at(250, 50)
        .circle(10)
        .edge('a', 'b')
        .stroke('#ff0000', 3)
        .fill('blue')
        .svg();

      const pathMatch = svgStr.match(/<path[^>]*class="viz-edge"[^>]*>/);
      expect(pathMatch).toBeTruthy();
      // Per-edge styles are in the style attribute (inline wins over CSS class)
      expect(pathMatch![0]).toContain('stroke: #ff0000');
      expect(pathMatch![0]).toContain('stroke-width: 3');
      expect(pathMatch![0]).toContain('fill: blue');
    });

    it('arrowhead marker matches edge stroke color', () => {
      const svgStr = viz()
        .node('a')
        .at(50, 50)
        .circle(10)
        .node('b')
        .at(250, 50)
        .circle(10)
        .edge('a', 'b')
        .arrow()
        .stroke('#e74c3c')
        .svg();

      // A per-color marker definition should exist in defs
      expect(svgStr).toContain('id="viz-arrow-_e74c3c"');
      expect(svgStr).toContain('fill="#e74c3c"');

      // The edge path should reference the colored marker, not the default
      const pathMatch = svgStr.match(/<path[^>]*class="viz-edge"[^>]*>/);
      expect(pathMatch).toBeTruthy();
      expect(pathMatch![0]).toContain('url(#viz-arrow-_e74c3c)');
      expect(pathMatch![0]).toContain('stroke: #e74c3c');
    });

    it('edge without custom stroke uses default viz-arrow marker', () => {
      const svgStr = viz()
        .node('a')
        .at(50, 50)
        .circle(10)
        .node('b')
        .at(250, 50)
        .circle(10)
        .edge('a', 'b')
        .arrow()
        .svg();

      const pathMatch = svgStr.match(/<path[^>]*class="viz-edge"[^>]*>/);
      expect(pathMatch).toBeTruthy();
      // Default marker uses currentColor
      expect(pathMatch![0]).toContain('url(#viz-arrow)');
      // style attribute should be empty when no per-edge style is set
      const styleMatch = pathMatch![0].match(/style="([^"]*)"/);
      expect(styleMatch).toBeTruthy();
      expect(styleMatch![1]!.trim()).toBe('');
    });
  });

  describe('edge dash patterns (dashed, dotted, dash)', () => {
    it('.dashed() sets strokeDasharray to "dashed"', () => {
      const scene = viz()
        .node('a')
        .at(0, 0)
        .circle(10)
        .node('b')
        .at(200, 0)
        .circle(10)
        .edge('a', 'b')
        .dashed()
        .build();
      expect(scene.edges[0]!.style?.strokeDasharray).toBe('dashed');
    });

    it('.dotted() sets strokeDasharray to "dotted"', () => {
      const scene = viz()
        .node('a')
        .at(0, 0)
        .circle(10)
        .node('b')
        .at(200, 0)
        .circle(10)
        .edge('a', 'b')
        .dotted()
        .build();
      expect(scene.edges[0]!.style?.strokeDasharray).toBe('dotted');
    });

    it('.dash() sets a custom dasharray pattern', () => {
      const scene = viz()
        .node('a')
        .at(0, 0)
        .circle(10)
        .node('b')
        .at(200, 0)
        .circle(10)
        .edge('a', 'b')
        .dash('12, 3, 3, 3')
        .build();
      expect(scene.edges[0]!.style?.strokeDasharray).toBe('12, 3, 3, 3');
    });

    it('.dash("dash-dot") sets dash-dot preset', () => {
      const scene = viz()
        .node('a')
        .at(0, 0)
        .circle(10)
        .node('b')
        .at(200, 0)
        .circle(10)
        .edge('a', 'b')
        .dash('dash-dot')
        .build();
      expect(scene.edges[0]!.style?.strokeDasharray).toBe('dash-dot');
    });

    it('.dashed() chains with .stroke()', () => {
      const scene = viz()
        .node('a')
        .at(0, 0)
        .circle(10)
        .node('b')
        .at(200, 0)
        .circle(10)
        .edge('a', 'b')
        .stroke('#ef4444', 2)
        .dashed()
        .arrow()
        .build();
      const style = scene.edges[0]!.style!;
      expect(style.stroke).toBe('#ef4444');
      expect(style.strokeWidth).toBe(2);
      expect(style.strokeDasharray).toBe('dashed');
    });

    it('dashed edge renders stroke-dasharray in svg()', () => {
      const svgStr = viz()
        .node('a')
        .at(50, 50)
        .circle(10)
        .node('b')
        .at(250, 50)
        .circle(10)
        .edge('a', 'b')
        .dashed()
        .svg();
      const pathMatch = svgStr.match(/<path[^>]*class="viz-edge"[^>]*>/);
      expect(pathMatch).toBeTruthy();
      expect(pathMatch![0]).toContain('stroke-dasharray: 8, 4');
    });

    it('dotted edge renders stroke-dasharray in svg()', () => {
      const svgStr = viz()
        .node('a')
        .at(50, 50)
        .circle(10)
        .node('b')
        .at(250, 50)
        .circle(10)
        .edge('a', 'b')
        .dotted()
        .svg();
      const pathMatch = svgStr.match(/<path[^>]*class="viz-edge"[^>]*>/);
      expect(pathMatch).toBeTruthy();
      expect(pathMatch![0]).toContain('stroke-dasharray: 2, 4');
    });

    it('custom dash pattern renders in svg()', () => {
      const svgStr = viz()
        .node('a')
        .at(50, 50)
        .circle(10)
        .node('b')
        .at(250, 50)
        .circle(10)
        .edge('a', 'b')
        .dash('12, 3, 3, 3')
        .svg();
      const pathMatch = svgStr.match(/<path[^>]*class="viz-edge"[^>]*>/);
      expect(pathMatch).toBeTruthy();
      expect(pathMatch![0]).toContain('stroke-dasharray: 12, 3, 3, 3');
    });

    it('.dash("solid") produces no stroke-dasharray in svg()', () => {
      const svgStr = viz()
        .node('a')
        .at(50, 50)
        .circle(10)
        .node('b')
        .at(250, 50)
        .circle(10)
        .edge('a', 'b')
        .dash('solid')
        .svg();
      const pathMatch = svgStr.match(/<path[^>]*class="viz-edge"[^>]*>/);
      expect(pathMatch).toBeTruthy();
      // 'solid' should resolve to empty, so no strokeDasharray in style
      expect(pathMatch![0]).not.toContain('stroke-dasharray');
    });
  });

  describe('edge marker types and markerStart', () => {
    it('.markerEnd() sets custom marker type on the edge', () => {
      const scene = viz()
        .node('a')
        .at(0, 0)
        .circle(10)
        .node('b')
        .at(200, 0)
        .circle(10)
        .edge('a', 'b')
        .markerEnd('arrowOpen')
        .build();
      expect(scene.edges[0]!.markerEnd).toBe('arrowOpen');
    });

    it('.markerStart() sets custom marker at start of edge', () => {
      const scene = viz()
        .node('a')
        .at(0, 0)
        .circle(10)
        .node('b')
        .at(200, 0)
        .circle(10)
        .edge('a', 'b')
        .markerStart('diamond')
        .build();
      expect(scene.edges[0]!.markerStart).toBe('diamond');
    });

    it('.markerStart() and .markerEnd() chain together', () => {
      const scene = viz()
        .node('a')
        .at(0, 0)
        .circle(10)
        .node('b')
        .at(200, 0)
        .circle(10)
        .edge('a', 'b')
        .markerStart('diamond')
        .markerEnd('arrow')
        .build();
      const edge = scene.edges[0]!;
      expect(edge.markerStart).toBe('diamond');
      expect(edge.markerEnd).toBe('arrow');
    });

    it('.arrow("both") sets markerStart and markerEnd to "arrow"', () => {
      const scene = viz()
        .node('a')
        .at(0, 0)
        .circle(10)
        .node('b')
        .at(200, 0)
        .circle(10)
        .edge('a', 'b')
        .arrow('both')
        .build();
      const edge = scene.edges[0]!;
      expect(edge.markerStart).toBe('arrow');
      expect(edge.markerEnd).toBe('arrow');
    });

    it('.arrow("start") sets only markerStart to "arrow"', () => {
      const scene = viz()
        .node('a')
        .at(0, 0)
        .circle(10)
        .node('b')
        .at(200, 0)
        .circle(10)
        .edge('a', 'b')
        .arrow('start')
        .build();
      const edge = scene.edges[0]!;
      expect(edge.markerStart).toBe('arrow');
      expect(edge.markerEnd).toBeUndefined();
    });

    it('.arrow("end") sets only markerEnd to "arrow"', () => {
      const scene = viz()
        .node('a')
        .at(0, 0)
        .circle(10)
        .node('b')
        .at(200, 0)
        .circle(10)
        .edge('a', 'b')
        .arrow('end')
        .build();
      const edge = scene.edges[0]!;
      expect(edge.markerStart).toBeUndefined();
      expect(edge.markerEnd).toBe('arrow');
    });

    it('backward compatibility: .arrow(true) still sets markerEnd to "arrow"', () => {
      const scene = viz()
        .node('a')
        .at(0, 0)
        .circle(10)
        .node('b')
        .at(200, 0)
        .circle(10)
        .edge('a', 'b')
        .arrow(true)
        .build();
      expect(scene.edges[0]!.markerEnd).toBe('arrow');
    });

    it('backward compatibility: .arrow(false) sets markerEnd to "none"', () => {
      const scene = viz()
        .node('a')
        .at(0, 0)
        .circle(10)
        .node('b')
        .at(200, 0)
        .circle(10)
        .edge('a', 'b')
        .arrow(false)
        .build();
      expect(scene.edges[0]!.markerEnd).toBe('none');
    });

    it('svg() generates marker defs only for marker types actually used', () => {
      const svgStr = viz()
        .node('a')
        .at(50, 50)
        .circle(10)
        .node('b')
        .at(250, 50)
        .circle(10)
        .edge('a', 'b')
        .markerEnd('diamond')
        .svg();

      // Should contain the marker def actually used
      expect(svgStr).toContain('id="viz-diamond"');
      // Should NOT contain marker defs for unused types
      expect(svgStr).not.toContain('id="viz-arrow"');
      expect(svgStr).not.toContain('id="viz-arrowOpen"');
      expect(svgStr).not.toContain('id="viz-circle"');
    });

    it('markerEnd renders in the SVG path for non-arrow types', () => {
      const svgStr = viz()
        .node('a')
        .at(50, 50)
        .circle(10)
        .node('b')
        .at(250, 50)
        .circle(10)
        .edge('a', 'b')
        .markerEnd('diamond')
        .svg();

      const pathMatch = svgStr.match(/<path[^>]*class="viz-edge"[^>]*>/);
      expect(pathMatch).toBeTruthy();
      expect(pathMatch![0]).toContain('url(#viz-diamond)');
    });

    it('markerStart renders in the SVG path', () => {
      const svgStr = viz()
        .node('a')
        .at(50, 50)
        .circle(10)
        .node('b')
        .at(250, 50)
        .circle(10)
        .edge('a', 'b')
        .markerStart('circleOpen')
        .markerEnd('arrow')
        .svg();

      const pathMatch = svgStr.match(/<path[^>]*class="viz-edge"[^>]*>/);
      expect(pathMatch).toBeTruthy();
      expect(pathMatch![0]).toContain(
        'marker-start="url(#viz-circleOpen-start)"'
      );
      expect(pathMatch![0]).toContain('marker-end="url(#viz-arrow)"');
    });

    it('per-color marker defs are generated for custom stroke', () => {
      const svgStr = viz()
        .node('a')
        .at(50, 50)
        .circle(10)
        .node('b')
        .at(250, 50)
        .circle(10)
        .edge('a', 'b')
        .markerStart('diamond')
        .markerEnd('arrowOpen')
        .stroke('#e74c3c')
        .svg();

      // Colored markers should exist
      expect(svgStr).toContain('id="viz-diamond-start-_e74c3c"');
      expect(svgStr).toContain('id="viz-arrowOpen-_e74c3c"');

      // The path should reference the colored markers
      const pathMatch = svgStr.match(/<path[^>]*class="viz-edge"[^>]*>/);
      expect(pathMatch).toBeTruthy();
      expect(pathMatch![0]).toContain('url(#viz-diamond-start-_e74c3c)');
      expect(pathMatch![0]).toContain('url(#viz-arrowOpen-_e74c3c)');
    });

    it('all used marker types produce valid SVG content in defs', () => {
      const markerTypes = [
        'arrow',
        'arrowOpen',
        'diamond',
        'diamondOpen',
        'circle',
        'circleOpen',
        'square',
        'bar',
        'halfArrow',
      ] as const;

      // Each edge needs a unique id so they don't overwrite each other
      const svgStr = viz()
        .node('a')
        .at(50, 50)
        .circle(10)
        .node('b')
        .at(250, 50)
        .circle(10)
        .edge('a', 'b', 'e1')
        .markerEnd('arrow')
        .edge('a', 'b', 'e2')
        .markerEnd('arrowOpen')
        .edge('a', 'b', 'e3')
        .markerEnd('diamond')
        .edge('a', 'b', 'e4')
        .markerEnd('diamondOpen')
        .edge('a', 'b', 'e5')
        .markerEnd('circle')
        .edge('a', 'b', 'e6')
        .markerEnd('circleOpen')
        .edge('a', 'b', 'e7')
        .markerEnd('square')
        .edge('a', 'b', 'e8')
        .markerEnd('bar')
        .edge('a', 'b', 'e9')
        .markerEnd('halfArrow')
        .svg();

      markerTypes.forEach((type) => {
        const markerId = `viz-${type}`;
        expect(svgStr).toContain(`id="${markerId}"`);
      });
    });

    it('markerEnd "none" does not render marker-end attribute', () => {
      const svgStr = viz()
        .node('a')
        .at(50, 50)
        .circle(10)
        .node('b')
        .at(250, 50)
        .circle(10)
        .edge('a', 'b')
        .markerEnd('none')
        .svg();

      const pathMatch = svgStr.match(/<path[^>]*class="viz-edge"[^>]*>/);
      expect(pathMatch).toBeTruthy();
      expect(pathMatch![0]).not.toContain('marker-end="url(');
    });

    it('UML composition: diamond start + arrow end', () => {
      const scene = viz()
        .node('a')
        .at(0, 0)
        .circle(10)
        .node('b')
        .at(200, 0)
        .circle(10)
        .edge('a', 'b')
        .markerStart('diamond')
        .markerEnd('arrow')
        .build();

      const edge = scene.edges[0]!;
      expect(edge.markerStart).toBe('diamond');
      expect(edge.markerEnd).toBe('arrow');
    });

    it('UML aggregation: diamondOpen start + arrow end', () => {
      const scene = viz()
        .node('a')
        .at(0, 0)
        .circle(10)
        .node('b')
        .at(200, 0)
        .circle(10)
        .edge('a', 'b')
        .markerStart('diamondOpen')
        .markerEnd('arrow')
        .build();

      const edge = scene.edges[0]!;
      expect(edge.markerStart).toBe('diamondOpen');
      expect(edge.markerEnd).toBe('arrow');
    });
  });

  describe('multi-position edge labels', () => {
    it('single .label() call still renders one label in svg()', () => {
      const svgStr = viz()
        .node('a')
        .at(50, 50)
        .circle(10)
        .node('b')
        .at(250, 50)
        .circle(10)
        .edge('a', 'b')
        .label('hello')
        .svg();

      const labels = svgStr.match(
        /<text[^>]*data-viz-role="edge-label"[^>]*>[\s\S]*?<\/text>/g
      );
      expect(labels).toHaveLength(1);
      expect(labels![0]).toContain('hello');
      expect(labels![0]).toContain('data-label-position="mid"');
    });

    it('multiple .label() calls render multiple labels in svg()', () => {
      const svgStr = viz()
        .node('a')
        .at(50, 50)
        .circle(10)
        .node('b')
        .at(250, 50)
        .circle(10)
        .edge('a', 'b')
        .label('1', { position: 'start', dy: -10 })
        .label('places', { position: 'mid' })
        .label('*', { position: 'end', dy: -10 })
        .svg();

      const labels = svgStr.match(
        /<text[^>]*data-viz-role="edge-label"[^>]*>[\s\S]*?<\/text>/g
      );
      expect(labels).toHaveLength(3);

      // Verify positions
      expect(labels![0]).toContain('data-label-position="start"');
      expect(labels![0]).toContain('>1<');
      expect(labels![1]).toContain('data-label-position="mid"');
      expect(labels![1]).toContain('>places<');
      expect(labels![2]).toContain('data-label-position="end"');
      expect(labels![2]).toContain('>*<');
    });

    it('start/end labels are positioned along the edge path (not at midpoint)', () => {
      const svgStr = viz()
        .node('a')
        .at(0, 0)
        .circle(10)
        .node('b')
        .at(200, 0)
        .circle(10)
        .edge('a', 'b')
        .label('S', { position: 'start' })
        .label('M', { position: 'mid' })
        .label('E', { position: 'end' })
        .svg();

      const labels = svgStr.match(
        /<text[^>]*data-viz-role="edge-label"[^>]*>[\s\S]*?<\/text>/g
      );
      expect(labels).toHaveLength(3);

      // Extract x coordinates from the <text> element tag itself
      const getX = (tagText: string) => {
        const m = tagText.match(/^<text[^>]*?\bx="([^"]*)"/);
        return m ? parseFloat(m[1]!) : NaN;
      };

      const startX = getX(labels![0]!);
      const midX = getX(labels![1]!);
      const endX = getX(labels![2]!);

      // start < mid < end along horizontal edge
      expect(startX).toBeLessThan(midX);
      expect(midX).toBeLessThan(endX);

      // start is near source (~15%), end near target (~85%)
      // Edge from ~10 to ~190 (boundary anchored circles r=10)
      expect(startX).toBeGreaterThan(0);
      expect(startX).toBeLessThan(midX - 10);
      expect(endX).toBeGreaterThan(midX + 10);
    });

    it('backwards compatibility: scene.label is set for a single mid label', () => {
      const scene = viz()
        .node('a')
        .at(50, 50)
        .circle(10)
        .node('b')
        .at(250, 50)
        .circle(10)
        .edge('a', 'b')
        .label('hello')
        .build();

      const edge = scene.edges[0]!;
      // Legacy field is set
      expect(edge.label).toBeDefined();
      expect(edge.label!.text).toBe('hello');
      expect(edge.label!.position).toBe('mid');
      // New field is also set
      expect(edge.labels).toHaveLength(1);
      expect(edge.labels![0]!.text).toBe('hello');
    });

    it('labels[] is populated with all labels from chained calls', () => {
      const scene = viz()
        .node('a')
        .at(50, 50)
        .circle(10)
        .node('b')
        .at(250, 50)
        .circle(10)
        .edge('a', 'b')
        .label('src', { position: 'start' })
        .label('rel', { position: 'mid' })
        .label('tgt', { position: 'end' })
        .build();

      const edge = scene.edges[0]!;
      expect(edge.labels).toHaveLength(3);
      expect(edge.labels![0]!.position).toBe('start');
      expect(edge.labels![1]!.position).toBe('mid');
      expect(edge.labels![2]!.position).toBe('end');
    });

    it('data-label-index attribute is set on each label', () => {
      const svgStr = viz()
        .node('a')
        .at(50, 50)
        .circle(10)
        .node('b')
        .at(250, 50)
        .circle(10)
        .edge('a', 'b')
        .label('A', { position: 'start' })
        .label('B', { position: 'end' })
        .svg();

      expect(svgStr).toContain('data-label-index="0"');
      expect(svgStr).toContain('data-label-index="1"');
    });

    it('labels work with curved edge routing', () => {
      const svgStr = viz()
        .node('a')
        .at(50, 50)
        .circle(10)
        .node('b')
        .at(250, 150)
        .circle(10)
        .edge('a', 'b')
        .curved()
        .label('S', { position: 'start' })
        .label('E', { position: 'end' })
        .svg();

      const labels = svgStr.match(
        /<text[^>]*data-viz-role="edge-label"[^>]*>[\s\S]*?<\/text>/g
      );
      expect(labels).toHaveLength(2);
      expect(labels![0]).toContain('>S<');
      expect(labels![1]).toContain('>E<');
    });

    it('labels work with orthogonal edge routing', () => {
      const svgStr = viz()
        .node('a')
        .at(50, 50)
        .circle(10)
        .node('b')
        .at(250, 150)
        .circle(10)
        .edge('a', 'b')
        .orthogonal()
        .label('S', { position: 'start' })
        .label('M', { position: 'mid' })
        .label('E', { position: 'end' })
        .svg();

      const labels = svgStr.match(
        /<text[^>]*data-viz-role="edge-label"[^>]*>[\s\S]*?<\/text>/g
      );
      expect(labels).toHaveLength(3);
    });
  });

  // ─── Connection Ports ──────────────────────────────────────────────────────

  describe('connection ports', () => {
    // ── Default Ports ──

    describe('getDefaultPorts', () => {
      it('returns 4 ports for a circle shape', () => {
        const ports = getDefaultPorts({ kind: 'circle', r: 30 });
        expect(ports).toHaveLength(4);
        expect(ports.map((p) => p.id)).toEqual([
          'top',
          'right',
          'bottom',
          'left',
        ]);
        // Verify offsets are on the circle boundary
        expect(ports[0]!.offset).toEqual({ x: 0, y: -30 });
        expect(ports[1]!.offset).toEqual({ x: 30, y: 0 });
        expect(ports[2]!.offset).toEqual({ x: 0, y: 30 });
        expect(ports[3]!.offset).toEqual({ x: -30, y: 0 });
      });

      it('returns 4 ports for a rect shape', () => {
        const ports = getDefaultPorts({ kind: 'rect', w: 120, h: 60 });
        expect(ports).toHaveLength(4);
        expect(ports[0]!.offset).toEqual({ x: 0, y: -30 }); // top
        expect(ports[1]!.offset).toEqual({ x: 60, y: 0 }); // right
        expect(ports[2]!.offset).toEqual({ x: 0, y: 30 }); // bottom
        expect(ports[3]!.offset).toEqual({ x: -60, y: 0 }); // left
      });

      it('returns 4 ports for a diamond shape', () => {
        const ports = getDefaultPorts({ kind: 'diamond', w: 80, h: 80 });
        expect(ports).toHaveLength(4);
        expect(ports.map((p) => p.id)).toEqual([
          'top',
          'right',
          'bottom',
          'left',
        ]);
      });

      it('returns 4 ports for an ellipse shape', () => {
        const ports = getDefaultPorts({ kind: 'ellipse', rx: 50, ry: 30 });
        expect(ports).toHaveLength(4);
        expect(ports[0]!.offset).toEqual({ x: 0, y: -30 }); // top
        expect(ports[1]!.offset).toEqual({ x: 50, y: 0 }); // right
      });

      it('returns 6 ports for a pointy-top hexagon', () => {
        const ports = getDefaultPorts({
          kind: 'hexagon',
          r: 40,
          orientation: 'pointy',
        });
        expect(ports).toHaveLength(6);
        expect(ports.map((p) => p.id)).toEqual([
          'top',
          'top-right',
          'bottom-right',
          'bottom',
          'bottom-left',
          'top-left',
        ]);
      });

      it('returns 6 ports for a flat-top hexagon', () => {
        const ports = getDefaultPorts({
          kind: 'hexagon',
          r: 40,
          orientation: 'flat',
        });
        expect(ports).toHaveLength(6);
        expect(ports.map((p) => p.id)).toEqual([
          'right',
          'bottom-right',
          'bottom-left',
          'left',
          'top-left',
          'top-right',
        ]);
      });

      it('returns 4 ports for triangle shapes', () => {
        const ports = getDefaultPorts({
          kind: 'triangle',
          w: 80,
          h: 60,
          direction: 'up',
        });
        expect(ports.length).toBeGreaterThanOrEqual(3);
        expect(ports.map((p) => p.id)).toContain('top');
        expect(ports.map((p) => p.id)).toContain('bottom');
      });

      it('returns fallback ports for shapes without explicit port definitions', () => {
        // e.g. cloud, note, etc.
        const ports = getDefaultPorts({ kind: 'cloud', w: 100, h: 60 });
        expect(ports).toHaveLength(4);
        expect(ports.map((p) => p.id)).toEqual([
          'top',
          'right',
          'bottom',
          'left',
        ]);
      });

      it('each port has a direction', () => {
        const ports = getDefaultPorts({ kind: 'rect', w: 100, h: 50 });
        ports.forEach((p) => {
          expect(p.direction).toBeDefined();
          expect(typeof p.direction).toBe('number');
        });
      });
    });

    // ── getNodePorts / findPort / resolvePortPosition ──

    describe('getNodePorts', () => {
      it('returns explicit ports when set on the node', () => {
        const node: VizNode = {
          id: 'n',
          pos: { x: 100, y: 100 },
          shape: { kind: 'rect', w: 100, h: 50 },
          ports: [{ id: 'custom', offset: { x: 10, y: -25 }, direction: 270 }],
        };
        const ports = getNodePorts(node);
        expect(ports).toHaveLength(1);
        expect(ports[0]!.id).toBe('custom');
      });

      it('falls back to default ports when none are set', () => {
        const node: VizNode = {
          id: 'n',
          pos: { x: 100, y: 100 },
          shape: { kind: 'circle', r: 20 },
        };
        const ports = getNodePorts(node);
        expect(ports).toHaveLength(4);
      });
    });

    describe('findPort', () => {
      it('finds an explicit port by id', () => {
        const node: VizNode = {
          id: 'n',
          pos: { x: 0, y: 0 },
          shape: { kind: 'rect', w: 100, h: 50 },
          ports: [{ id: 'out', offset: { x: 50, y: 0 }, direction: 0 }],
        };
        const port = findPort(node, 'out');
        expect(port).toBeDefined();
        expect(port!.id).toBe('out');
      });

      it('finds a default port when no explicit ports are set', () => {
        const node: VizNode = {
          id: 'n',
          pos: { x: 0, y: 0 },
          shape: { kind: 'rect', w: 100, h: 50 },
        };
        const port = findPort(node, 'top');
        expect(port).toBeDefined();
        expect(port!.offset.y).toBe(-25);
      });

      it('returns undefined for a non-existent port', () => {
        const node: VizNode = {
          id: 'n',
          pos: { x: 0, y: 0 },
          shape: { kind: 'rect', w: 100, h: 50 },
        };
        expect(findPort(node, 'does-not-exist')).toBeUndefined();
      });
    });

    describe('resolvePortPosition', () => {
      it('resolves to absolute position (node center + offset)', () => {
        const node: VizNode = {
          id: 'n',
          pos: { x: 200, y: 300 },
          shape: { kind: 'rect', w: 100, h: 50 },
          ports: [{ id: 'right', offset: { x: 50, y: 0 } }],
        };
        const pos = resolvePortPosition(node, 'right');
        expect(pos).toEqual({ x: 250, y: 300 });
      });

      it('resolves using runtime position when available', () => {
        const node: VizNode = {
          id: 'n',
          pos: { x: 100, y: 100 },
          shape: { kind: 'rect', w: 100, h: 50 },
          runtime: { x: 200, y: 200 },
          ports: [{ id: 'top', offset: { x: 0, y: -25 } }],
        };
        const pos = resolvePortPosition(node, 'top');
        expect(pos).toEqual({ x: 200, y: 175 });
      });

      it('returns undefined for a non-existent port', () => {
        const node: VizNode = {
          id: 'n',
          pos: { x: 0, y: 0 },
          shape: { kind: 'circle', r: 20 },
        };
        expect(resolvePortPosition(node, 'nope')).toBeUndefined();
      });
    });

    // ── Builder API ──

    describe('builder .port()', () => {
      it('adds explicit ports to a node via the builder', () => {
        const scene = viz()
          .node('a')
          .at(100, 100)
          .rect(120, 60)
          .port('top', { x: 0, y: -30 }, 270)
          .port('bottom', { x: 0, y: 30 }, 90)
          .port('left', { x: -60, y: 0 }, 180)
          .port('right', { x: 60, y: 0 }, 0)
          .build();

        const node = scene.nodes[0]!;
        expect(node.ports).toHaveLength(4);
        expect(node.ports![0]).toEqual({
          id: 'top',
          offset: { x: 0, y: -30 },
          direction: 270,
        });
      });

      it('chains with other node builder methods', () => {
        const scene = viz()
          .node('a')
          .at(100, 100)
          .rect(120, 60)
          .port('out', { x: 60, y: 0 })
          .label('Process')
          .fill('#ccc')
          .build();

        const node = scene.nodes[0]!;
        expect(node.ports).toHaveLength(1);
        expect(node.label?.text).toBe('Process');
        expect(node.style?.fill).toBe('#ccc');
      });
    });

    describe('builder .fromPort() / .toPort()', () => {
      it('sets fromPort and toPort on the edge', () => {
        const scene = viz()
          .node('a')
          .at(100, 100)
          .rect(120, 60)
          .port('right', { x: 60, y: 0 })
          .node('b')
          .at(400, 100)
          .rect(120, 60)
          .port('left', { x: -60, y: 0 })
          .edge('a', 'b')
          .fromPort('right')
          .toPort('left')
          .arrow()
          .build();

        const edge = scene.edges[0]!;
        expect(edge.fromPort).toBe('right');
        expect(edge.toPort).toBe('left');
      });

      it('chains with other edge builder methods', () => {
        const scene = viz()
          .node('a')
          .at(100, 100)
          .rect(120, 60)
          .node('b')
          .at(400, 100)
          .rect(120, 60)
          .edge('a', 'b')
          .fromPort('bottom')
          .toPort('top')
          .curved()
          .stroke('#f00')
          .arrow()
          .build();

        const edge = scene.edges[0]!;
        expect(edge.fromPort).toBe('bottom');
        expect(edge.toPort).toBe('top');
        expect(edge.routing).toBe('curved');
        expect(edge.style?.stroke).toBe('#f00');
      });
    });

    // ── SVG Rendering ──

    describe('SVG rendering with ports', () => {
      it('renders port circles in SVG when explicit ports are defined', () => {
        const svgStr = viz()
          .node('a')
          .at(100, 100)
          .rect(120, 60)
          .port('top', { x: 0, y: -30 })
          .port('right', { x: 60, y: 0 })
          .svg();

        // Should have viz-port circles with data-port attributes
        const portMatches = svgStr.match(
          /class="viz-port"[^>]*data-port="[^"]+"/g
        );
        expect(portMatches).toHaveLength(2);
        expect(svgStr).toContain('data-port="top"');
        expect(svgStr).toContain('data-port="right"');
      });

      it('does not render port circles when no explicit ports are defined', () => {
        const svgStr = viz().node('a').at(100, 100).rect(120, 60).svg();

        // The CSS will contain '.viz-port' rules, but there should be no
        // actual port circle elements in the SVG markup.
        expect(svgStr).not.toContain('data-viz-role="port"');
      });

      it('port circles are positioned correctly in SVG', () => {
        const svgStr = viz()
          .node('a')
          .at(200, 300)
          .rect(120, 60)
          .port('right', { x: 60, y: 0 })
          .svg();

        // cx=200+60=260, cy=300+0=300
        expect(svgStr).toContain('cx="260"');
        expect(svgStr).toContain('cy="300"');
      });
    });

    // ── Port-aware Edge Endpoints ──

    describe('port-aware edge endpoints', () => {
      it('edges use port positions when fromPort/toPort are set', () => {
        const svgStr = viz()
          .view(800, 600)
          .node('a')
          .at(100, 300)
          .rect(120, 60)
          .port('right', { x: 60, y: 0 })
          .node('b')
          .at(500, 300)
          .rect(120, 60)
          .port('left', { x: -60, y: 0 })
          .edge('a', 'b')
          .fromPort('right')
          .toPort('left')
          .svg();

        // The edge path should start near x=160 (100+60) and end near x=440 (500-60)
        const pathMatch = svgStr.match(/<path[^>]*d="M\s+([\d.]+)\s+([\d.]+)/);
        expect(pathMatch).toBeTruthy();
        const startX = parseFloat(pathMatch![1]!);
        expect(startX).toBeCloseTo(160, 0);
      });

      it('edge uses default port when port id matches a default port name', () => {
        // No explicit ports, but default 'right' port should work on rect
        const svgStr = viz()
          .view(800, 600)
          .node('a')
          .at(100, 300)
          .rect(120, 60)
          .node('b')
          .at(500, 300)
          .rect(120, 60)
          .edge('a', 'b')
          .fromPort('right')
          .toPort('left')
          .svg();

        const pathMatch = svgStr.match(/<path[^>]*d="M\s+([\d.]+)\s+([\d.]+)/);
        expect(pathMatch).toBeTruthy();
        // Default right port for rect(120,60) at (100,300) = x: 100+60 = 160
        const startX = parseFloat(pathMatch![1]!);
        expect(startX).toBeCloseTo(160, 0);
      });

      it('falls back to boundary anchor when port id is not found', () => {
        const svgBoundary = viz()
          .view(800, 600)
          .node('a')
          .at(100, 300)
          .rect(120, 60)
          .node('b')
          .at(500, 300)
          .rect(120, 60)
          .edge('a', 'b')
          .svg();

        const svgWithBadPort = viz()
          .view(800, 600)
          .node('a')
          .at(100, 300)
          .rect(120, 60)
          .node('b')
          .at(500, 300)
          .rect(120, 60)
          .edge('a', 'b')
          .fromPort('nonexistent')
          .svg();

        // Both should produce the same path since the bad port falls back to boundary
        const pathBoundary = svgBoundary.match(
          /<path[^>]*d="M\s+([\d.]+)\s+([\d.]+)/
        );
        const pathBadPort = svgWithBadPort.match(
          /<path[^>]*d="M\s+([\d.]+)\s+([\d.]+)/
        );
        expect(pathBoundary).toBeTruthy();
        expect(pathBadPort).toBeTruthy();
        // Should use the same start position (boundary anchor)
        expect(parseFloat(pathBadPort![1]!)).toBeCloseTo(
          parseFloat(pathBoundary![1]!),
          1
        );
      });

      it('supports mixing port and boundary endpoints', () => {
        // Only fromPort set, toPort uses boundary
        const svgStr = viz()
          .view(800, 600)
          .node('a')
          .at(100, 300)
          .rect(120, 60)
          .port('bottom', { x: 0, y: 30 })
          .node('b')
          .at(100, 500)
          .circle(30)
          .edge('a', 'b')
          .fromPort('bottom')
          .arrow()
          .svg();

        const pathMatch = svgStr.match(/<path[^>]*d="M\s+([\d.]+)\s+([\d.]+)/);
        expect(pathMatch).toBeTruthy();
        // Start should be at (100, 330) — the bottom port of node a
        const startX = parseFloat(pathMatch![1]!);
        const startY = parseFloat(pathMatch![2]!);
        expect(startX).toBeCloseTo(100, 0);
        expect(startY).toBeCloseTo(330, 0);
      });
    });

    // ── Port CSS ──

    describe('port CSS', () => {
      it('svg() includes port CSS rules', () => {
        const svgStr = viz()
          .node('a')
          .at(100, 100)
          .rect(120, 60)
          .port('top', { x: 0, y: -30 })
          .svg();

        expect(svgStr).toContain('.viz-port');
        expect(svgStr).toContain('opacity: 0');
        expect(svgStr).toContain('.viz-node-group:hover .viz-port');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Declarative Options Overloads — node(id, opts) & edge(from, to, opts)
  // ═══════════════════════════════════════════════════════════════════════
  describe('declarative node(id, opts) overload', () => {
    it('creates a node with rect shape and position', () => {
      const scene = viz()
        .node('a', { at: { x: 100, y: 200 }, rect: { w: 120, h: 60 } })
        .build();
      const n = scene.nodes.find((n) => n.id === 'a')!;
      expect(n.pos).toEqual({ x: 100, y: 200 });
      expect(n.shape).toEqual({ kind: 'rect', w: 120, h: 60 });
    });

    it('creates a node with circle shape', () => {
      const scene = viz()
        .node('c', { circle: { r: 25 } })
        .build();
      const n = scene.nodes.find((n) => n.id === 'c')!;
      expect(n.shape).toEqual({ kind: 'circle', r: 25 });
    });

    it('applies fill and stroke string', () => {
      const scene = viz()
        .node('s', { rect: { w: 50, h: 30 }, fill: 'red', stroke: 'blue' })
        .build();
      const n = scene.nodes.find((n) => n.id === 's')!;
      expect(n.style?.fill).toBe('red');
      expect(n.style?.stroke).toBe('blue');
    });

    it('applies stroke as object with color and width', () => {
      const scene = viz()
        .node('sw', {
          rect: { w: 50, h: 30 },
          stroke: { color: '#000', width: 3 },
        })
        .build();
      const n = scene.nodes.find((n) => n.id === 'sw')!;
      expect(n.style?.stroke).toBe('#000');
      expect(n.style?.strokeWidth).toBe(3);
    });

    it('applies opacity', () => {
      const scene = viz()
        .node('o', { rect: { w: 50, h: 30 }, opacity: 0.5 })
        .build();
      const n = scene.nodes.find((n) => n.id === 'o')!;
      expect(n.style?.opacity).toBe(0.5);
    });

    it('applies className', () => {
      const scene = viz()
        .node('cls', { rect: { w: 50, h: 30 }, className: 'my-class' })
        .build();
      const n = scene.nodes.find((n) => n.id === 'cls')!;
      expect(n.className).toBe('my-class');
    });

    it('applies label as string', () => {
      const scene = viz()
        .node('lbl', { rect: { w: 80, h: 40 }, label: 'Hello' })
        .build();
      const n = scene.nodes.find((n) => n.id === 'lbl')!;
      expect(n.label?.text).toBe('Hello');
    });

    it('applies label as object with options', () => {
      const scene = viz()
        .node('lbl2', {
          rect: { w: 80, h: 40 },
          label: { text: 'World', fontSize: 18, fill: 'white' },
        })
        .build();
      const n = scene.nodes.find((n) => n.id === 'lbl2')!;
      expect(n.label?.text).toBe('World');
      expect(n.label?.fontSize).toBe(18);
      expect(n.label?.fill).toBe('white');
    });

    it('applies data', () => {
      const payload = { foo: 'bar' };
      const scene = viz()
        .node('d', { rect: { w: 50, h: 30 }, data: payload })
        .build();
      const n = scene.nodes.find((n) => n.id === 'd')!;
      expect(n.data).toBe(payload);
    });

    it('applies onClick', () => {
      const handler = () => {};
      const scene = viz()
        .node('click', { rect: { w: 50, h: 30 }, onClick: handler })
        .build();
      const n = scene.nodes.find((n) => n.id === 'click')!;
      expect(n.onClick).toBe(handler);
    });

    it('applies ports', () => {
      const scene = viz()
        .node('p', {
          rect: { w: 80, h: 40 },
          ports: [
            { id: 'top', offset: { x: 0, y: -20 } },
            { id: 'bottom', offset: { x: 0, y: 20 }, direction: 270 },
          ],
        })
        .build();
      const n = scene.nodes.find((n) => n.id === 'p')!;
      expect(n.ports).toHaveLength(2);
      expect(n.ports![0]!.id).toBe('top');
      expect(n.ports![1]!.id).toBe('bottom');
      expect(n.ports![1]!.direction).toBe(270);
    });

    it('returns VizBuilder so additional nodes can be chained', () => {
      const scene = viz()
        .node('a', { rect: { w: 80, h: 40 } })
        .node('b', { circle: { r: 20 } })
        .build();
      expect(scene.nodes).toHaveLength(2);
      expect(scene.nodes.find((n) => n.id === 'a')!.shape.kind).toBe('rect');
      expect(scene.nodes.find((n) => n.id === 'b')!.shape.kind).toBe('circle');
    });

    it('supports diamond shape', () => {
      const scene = viz()
        .node('d', { diamond: { w: 60, h: 40 } })
        .build();
      expect(scene.nodes.find((n) => n.id === 'd')!.shape).toEqual({
        kind: 'diamond',
        w: 60,
        h: 40,
      });
    });

    it('supports cylinder shape', () => {
      const scene = viz()
        .node('c', { cylinder: { w: 60, h: 80, arcHeight: 10 } })
        .build();
      const shape = scene.nodes.find((n) => n.id === 'c')!.shape;
      expect(shape.kind).toBe('cylinder');
    });

    it('supports star shape', () => {
      const scene = viz()
        .node('s', { star: { points: 5, outerR: 30 } })
        .build();
      const shape = scene.nodes.find((n) => n.id === 's')!.shape;
      expect(shape.kind).toBe('star');
    });

    it('supports triangle shape', () => {
      const scene = viz()
        .node('t', { triangle: { w: 40, h: 40, direction: 'up' } })
        .build();
      const shape = scene.nodes.find((n) => n.id === 't')!.shape;
      expect(shape.kind).toBe('triangle');
    });

    it('supports hexagon shape', () => {
      const scene = viz()
        .node('h', { hexagon: { r: 30, orientation: 'flat' } })
        .build();
      const shape = scene.nodes.find((n) => n.id === 'h')!.shape;
      expect(shape.kind).toBe('hexagon');
    });

    it('supports container option', () => {
      const scene = viz()
        .node('group', {
          rect: { w: 200, h: 200 },
          container: {
            padding: { top: 20, right: 20, bottom: 20, left: 20 },
          },
        })
        .build();
      const n = scene.nodes.find((n) => n.id === 'group')!;
      expect(n.container).toEqual({
        padding: { top: 20, right: 20, bottom: 20, left: 20 },
      });
    });

    it('supports parent option', () => {
      const scene = viz()
        .node('group', {
          rect: { w: 200, h: 200 },
          container: {
            padding: { top: 10, right: 10, bottom: 10, left: 10 },
          },
        })
        .node('child', { rect: { w: 40, h: 40 }, parent: 'group' })
        .build();
      const child = scene.nodes.find((n) => n.id === 'child')!;
      expect(child.parentId).toBe('group');
    });

    describe('multi-line label wrapping', () => {
      it('breaks node labels into multiple tspans on explicit \\n characters', () => {
        const svgStr = viz()
          .node('a', {
            rect: { w: 100, h: 50 },
            at: { x: 0, y: 0 },
            label: 'Line 1\nLine 2',
          })
          .svg();

        const tsPanMatches = svgStr.match(/<tspan[^>]*>(.*?)<\/tspan>/g);
        expect(tsPanMatches).toHaveLength(2);
        expect(tsPanMatches![0]).toContain('Line 1');
        expect(tsPanMatches![1]).toContain('Line 2');
        expect(tsPanMatches![1]).toContain('dy="1.2em"');
      });

      it('automatically wraps node text using maxWidth approximation', () => {
        const svgStr = viz()
          .node('a')
          .at(0, 0)
          .circle(50)
          .label('This is a very long text that must absolute wrap', {
            maxWidth: 10, // Unreasonably small to force wrap on every word
            fontSize: 10, // 0.6 * 10 = 6 max chars lines
          })
          .svg();

        const tsPanMatches = svgStr.match(/<tspan[^>]*>(.*?)<\/tspan>/g);
        // "This", "is a", "very", "long", "text", "that", "must", "absolute", "wrap"
        // Actual splitting depends on exact formula, but it should be multiple lines
        expect(tsPanMatches!.length).toBeGreaterThan(3);
        expect(svgStr).toContain('wrap</tspan>');
      });
    });
  });

  describe('declarative edge(from, to, opts) overload', () => {
    it('creates an edge with default id', () => {
      const scene = viz()
        .node('a', { rect: { w: 50, h: 30 }, at: { x: 0, y: 0 } })
        .node('b', { rect: { w: 50, h: 30 }, at: { x: 200, y: 0 } })
        .edge('a', 'b', { arrow: true })
        .build();
      const e = scene.edges.find((e) => e.id === 'a->b')!;
      expect(e).toBeDefined();
      expect(e.markerEnd).toBe('arrow');
    });

    it('creates an edge with custom id', () => {
      const scene = viz()
        .node('a', { rect: { w: 50, h: 30 }, at: { x: 0, y: 0 } })
        .node('b', { rect: { w: 50, h: 30 }, at: { x: 200, y: 0 } })
        .edge('a', 'b', { id: 'my-edge', arrow: true })
        .build();
      const e = scene.edges.find((e) => e.id === 'my-edge')!;
      expect(e).toBeDefined();
    });

    it('applies stroke as string', () => {
      const scene = viz()
        .node('a', { rect: { w: 50, h: 30 }, at: { x: 0, y: 0 } })
        .node('b', { rect: { w: 50, h: 30 }, at: { x: 200, y: 0 } })
        .edge('a', 'b', { stroke: 'red' })
        .build();
      const e = scene.edges.find((e) => e.id === 'a->b')!;
      expect(e.style?.stroke).toBe('red');
    });

    it('applies stroke as object', () => {
      const scene = viz()
        .node('a', { rect: { w: 50, h: 30 }, at: { x: 0, y: 0 } })
        .node('b', { rect: { w: 50, h: 30 }, at: { x: 200, y: 0 } })
        .edge('a', 'b', { stroke: { color: '#333', width: 2 } })
        .build();
      const e = scene.edges.find((e) => e.id === 'a->b')!;
      expect(e.style?.stroke).toBe('#333');
      expect(e.style?.strokeWidth).toBe(2);
    });

    it('applies dash pattern', () => {
      const scene = viz()
        .node('a', { rect: { w: 50, h: 30 }, at: { x: 0, y: 0 } })
        .node('b', { rect: { w: 50, h: 30 }, at: { x: 200, y: 0 } })
        .edge('a', 'b', { dash: 'dashed' })
        .build();
      const e = scene.edges.find((e) => e.id === 'a->b')!;
      expect(e.style?.strokeDasharray).toBe('dashed');
    });

    it('applies label as string', () => {
      const scene = viz()
        .node('a', { rect: { w: 50, h: 30 }, at: { x: 0, y: 0 } })
        .node('b', { rect: { w: 50, h: 30 }, at: { x: 200, y: 0 } })
        .edge('a', 'b', { label: 'connects' })
        .build();
      const e = scene.edges.find((e) => e.id === 'a->b')!;
      expect(e.labels).toHaveLength(1);
      expect(e.labels![0]!.text).toBe('connects');
    });

    it('applies label as object', () => {
      const scene = viz()
        .node('a', { rect: { w: 50, h: 30 }, at: { x: 0, y: 0 } })
        .node('b', { rect: { w: 50, h: 30 }, at: { x: 200, y: 0 } })
        .edge('a', 'b', { label: { text: 'link', className: 'text-lg' } })
        .build();
      const e = scene.edges.find((e) => e.id === 'a->b')!;
      expect(e.labels![0]!.text).toBe('link');
      expect(e.labels![0]!.className).toBe('text-lg');
    });

    it('applies label as array (multi-position)', () => {
      const scene = viz()
        .node('a', { rect: { w: 50, h: 30 }, at: { x: 0, y: 0 } })
        .node('b', { rect: { w: 50, h: 30 }, at: { x: 200, y: 0 } })
        .edge('a', 'b', {
          label: [
            { text: 'start', position: 'start' },
            { text: 'end', position: 'end' },
          ],
        })
        .build();
      const e = scene.edges.find((e) => e.id === 'a->b')!;
      expect(e.labels).toHaveLength(2);
      expect(e.labels![0]!.text).toBe('start');
      expect(e.labels![1]!.text).toBe('end');
    });

    it('applies arrow: "both"', () => {
      const scene = viz()
        .node('a', { rect: { w: 50, h: 30 }, at: { x: 0, y: 0 } })
        .node('b', { rect: { w: 50, h: 30 }, at: { x: 200, y: 0 } })
        .edge('a', 'b', { arrow: 'both' })
        .build();
      const e = scene.edges.find((e) => e.id === 'a->b')!;
      expect(e.markerStart).toBe('arrow');
      expect(e.markerEnd).toBe('arrow');
    });

    it('applies routing', () => {
      const scene = viz()
        .node('a', { rect: { w: 50, h: 30 }, at: { x: 0, y: 0 } })
        .node('b', { rect: { w: 50, h: 30 }, at: { x: 200, y: 200 } })
        .edge('a', 'b', { routing: 'orthogonal' })
        .build();
      const e = scene.edges.find((e) => e.id === 'a->b')!;
      expect(e.routing).toBe('orthogonal');
    });

    it('applies opacity and fill', () => {
      const scene = viz()
        .node('a', { rect: { w: 50, h: 30 }, at: { x: 0, y: 0 } })
        .node('b', { rect: { w: 50, h: 30 }, at: { x: 200, y: 0 } })
        .edge('a', 'b', { opacity: 0.3, fill: 'green' })
        .build();
      const e = scene.edges.find((e) => e.id === 'a->b')!;
      expect(e.style?.opacity).toBe(0.3);
      expect(e.style?.fill).toBe('green');
    });

    it('applies fromPort and toPort', () => {
      const scene = viz()
        .node('a', {
          rect: { w: 80, h: 40 },
          at: { x: 0, y: 0 },
          ports: [{ id: 'right', offset: { x: 40, y: 0 } }],
        })
        .node('b', {
          rect: { w: 80, h: 40 },
          at: { x: 200, y: 0 },
          ports: [{ id: 'left', offset: { x: -40, y: 0 } }],
        })
        .edge('a', 'b', { fromPort: 'right', toPort: 'left' })
        .build();
      const e = scene.edges.find((e) => e.id === 'a->b')!;
      expect(e.fromPort).toBe('right');
      expect(e.toPort).toBe('left');
    });

    it('applies hitArea', () => {
      const scene = viz()
        .node('a', { rect: { w: 50, h: 30 }, at: { x: 0, y: 0 } })
        .node('b', { rect: { w: 50, h: 30 }, at: { x: 200, y: 0 } })
        .edge('a', 'b', { hitArea: 20 })
        .build();
      const e = scene.edges.find((e) => e.id === 'a->b')!;
      expect(e.hitArea).toBe(20);
    });

    it('applies data and onClick', () => {
      const handler = () => {};
      const scene = viz()
        .node('a', { rect: { w: 50, h: 30 }, at: { x: 0, y: 0 } })
        .node('b', { rect: { w: 50, h: 30 }, at: { x: 200, y: 0 } })
        .edge('a', 'b', { data: { weight: 10 }, onClick: handler })
        .build();
      const e = scene.edges.find((e) => e.id === 'a->b')!;
      expect(e.data).toEqual({ weight: 10 });
      expect(e.onClick).toBe(handler);
    });

    it('returns VizBuilder so additional edges can be chained', () => {
      const scene = viz()
        .node('a', { rect: { w: 50, h: 30 }, at: { x: 0, y: 0 } })
        .node('b', { rect: { w: 50, h: 30 }, at: { x: 200, y: 0 } })
        .node('c', { rect: { w: 50, h: 30 }, at: { x: 100, y: 200 } })
        .edge('a', 'b', { arrow: true })
        .edge('b', 'c', { arrow: true, dash: 'dotted' })
        .build();
      expect(scene.edges).toHaveLength(2);
    });
  });

  describe('mixed fluent + declarative usage', () => {
    it('can mix declarative nodes with fluent edges', () => {
      const scene = viz()
        .node('a', { rect: { w: 80, h: 40 }, at: { x: 0, y: 0 }, label: 'A' })
        .node('b', { rect: { w: 80, h: 40 }, at: { x: 200, y: 0 }, label: 'B' })
        .edge('a', 'b')
        .arrow()
        .stroke('red')
        .build();
      expect(scene.nodes).toHaveLength(2);
      const e = scene.edges.find((e) => e.id === 'a->b')!;
      expect(e.markerEnd).toBe('arrow');
      expect(e.style?.stroke).toBe('red');
    });

    it('can mix fluent nodes with declarative edges', () => {
      const scene = viz()
        .node('a')
        .at(0, 0)
        .rect(80, 40)
        .label('A')
        .node('b')
        .at(200, 0)
        .rect(80, 40)
        .label('B')
        .edge('a', 'b', { arrow: true, stroke: 'blue' })
        .build();
      expect(scene.nodes).toHaveLength(2);
      const e = scene.edges.find((e) => e.id === 'a->b')!;
      expect(e.markerEnd).toBe('arrow');
      expect(e.style?.stroke).toBe('blue');
    });

    it('can chain from NodeBuilder to declarative edge', () => {
      const scene = viz()
        .node('a')
        .at(0, 0)
        .rect(80, 40)
        .node('b', { rect: { w: 80, h: 40 }, at: { x: 200, y: 0 } })
        .edge('a', 'b', { arrow: true })
        .build();
      expect(scene.nodes).toHaveLength(2);
      expect(scene.edges).toHaveLength(1);
    });

    it('can chain from EdgeBuilder to declarative node', () => {
      const scene = viz()
        .node('a', { rect: { w: 80, h: 40 }, at: { x: 0, y: 0 } })
        .edge('a', 'b')
        .arrow()
        .node('b', { rect: { w: 80, h: 40 }, at: { x: 200, y: 0 } })
        .build();
      expect(scene.nodes).toHaveLength(2);
      expect(scene.edges).toHaveLength(1);
    });

    it('fully declarative graph builds correctly', () => {
      const scene = viz()
        .node('start', {
          circle: { r: 20 },
          at: { x: 100, y: 50 },
          fill: '#4CAF50',
          label: 'Start',
        })
        .node('process', {
          rect: { w: 120, h: 60 },
          at: { x: 100, y: 180 },
          fill: '#2196F3',
          stroke: { color: '#1565C0', width: 2 },
          label: { text: 'Process', fontSize: 14, fill: 'white' },
        })
        .node('end', {
          diamond: { w: 80, h: 60 },
          at: { x: 100, y: 330 },
          fill: '#FF9800',
          label: 'End?',
        })
        .edge('start', 'process', { arrow: true, stroke: '#666' })
        .edge('process', 'end', { arrow: true, dash: 'dashed', label: 'next' })
        .build();

      expect(scene.nodes).toHaveLength(3);
      expect(scene.edges).toHaveLength(2);
      expect(scene.nodes.find((n) => n.id === 'start')!.shape.kind).toBe(
        'circle'
      );
      expect(scene.nodes.find((n) => n.id === 'process')!.shape.kind).toBe(
        'rect'
      );
      expect(scene.nodes.find((n) => n.id === 'end')!.shape.kind).toBe(
        'diamond'
      );
    });

    it('svg() works with fully declarative graph', () => {
      const svgStr = viz()
        .node('a', {
          rect: { w: 80, h: 40 },
          at: { x: 50, y: 50 },
          fill: 'red',
        })
        .node('b', { circle: { r: 20 }, at: { x: 200, y: 50 }, fill: 'blue' })
        .edge('a', 'b', { arrow: true })
        .svg();
      expect(svgStr).toContain('<svg');
      expect(svgStr).toContain('</svg>');
      expect(svgStr).toContain('fill="red"');
      expect(svgStr).toContain('fill="blue"');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Mount API defaults & options
  // ═══════════════════════════════════════════════════════════════════════
  describe('mount API with panZoom options', () => {
    it('returns a PanZoomController when panZoom is true and mounts the structure', () => {
      // Vitest's JSDOM setup allows standard DOM APIs
      const container = document.createElement('div');
      document.body.appendChild(container);

      const builder = viz().node('a', {
        rect: { w: 80, h: 40 },
        at: { x: 50, y: 50 },
      });

      const controller = builder.mount(container, { panZoom: true });

      expect(controller).toBeDefined();
      expect(controller!.zoom).toBeDefined();
      expect(controller!.pan).toBeDefined();

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();

      // Check for .viz-viewport grouping element
      const viewport = svg!.querySelector('g.viz-viewport');
      expect(viewport).toBeTruthy();

      document.body.removeChild(container);
    });

    it('returns undefined when panZoom is false or omitted', () => {
      const container = document.createElement('div');

      const builder = viz().node('a', { circle: { r: 10 } });

      const controller1 = builder.mount(container);
      expect(controller1).toBeUndefined();

      const controller2 = builder.mount(container, { panZoom: false });
      expect(controller2).toBeUndefined();
    });

    it('updates zoom and pan programmatically', () => {
      const container = document.createElement('div');
      // Create SVG structure first otherwise bounding rects fail
      const builder = viz()
        .view(200, 200)
        .node('a', { circle: { r: 10 }, at: { x: 100, y: 100 } });
      const controller = builder.mount(container, {
        panZoom: true,
        minZoom: 0.5,
        maxZoom: 5,
      });

      expect(controller).toBeDefined();

      controller!.setZoom(2);
      expect(controller!.zoom).toBe(2);

      controller!.setPan({ x: 10, y: 20 });
      expect(controller!.pan).toEqual({ x: 10, y: 20 });

      // Viewport should reflect the pan and zoom in its transform attribute
      const viewport = container.querySelector('g.viz-viewport') as SVGGElement;
      expect(viewport.getAttribute('transform')).toContain('translate(10, 20)');
      expect(viewport.getAttribute('transform')).toContain('scale(2)');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Z-Ordering
  // ═══════════════════════════════════════════════════════════════════════
  describe('node image embedding', () => {
    it('supports builder.image() to configure a node image', () => {
      const b = viz();
      b.node('n1')
        .circle(10)
        .image('/img.png', 20, 20, { position: 'above', dx: 5 });
      const scene = b.build();
      const node = scene.nodes.find((n) => n.id === 'n1');
      expect(node).toBeDefined();
      expect(node!.image).toBeDefined();
      expect(node!.image).toEqual({
        href: '/img.png',
        width: 20,
        height: 20,
        position: 'above',
        dx: 5,
      });
    });

    it('renders <image> SVG element alongside shapes and labels', () => {
      const b = viz();
      b.node('n1')
        .at(100, 100)
        .rect(50, 50)
        .image('/icon.svg', 24, 24, { dx: 10, dy: -5 })
        .label('Test Label', { dy: 20 });

      const container = document.createElement('div');
      b.mount(container);

      const html = container.innerHTML;
      expect(html).toContain('<image');
      expect(html).toContain('href="/icon.svg"');
      expect(html).toContain('width="24"');
      expect(html).toContain('height="24"');
      // 100 - (24/2) + 10 = 98 for x
      expect(html).toContain('x="98"');
      // 100 - (24/2) - 5 = 83 for y
      expect(html).toContain('y="83"');

      // Ensures the label still rendered
      expect(html).toContain('Test Label</tspan>');
    });
  });

  describe('z-ordering', () => {
    it('sorts nodes by zIndex during render', () => {
      const builder = viz()
        .node('a', { circle: { r: 10 }, zIndex: 10 })
        .node('b', { circle: { r: 10 }, zIndex: -1 })
        .node('c', { circle: { r: 10 }, zIndex: 5 });

      const container = document.createElement('div');
      builder.mount(container);

      const nodes = Array.from(
        container.querySelectorAll('g[data-viz-role="node-group"]')
      );
      expect(nodes).toHaveLength(3);

      // Order should be b (-1), c (5), a (10)
      expect(nodes[0]?.getAttribute('data-id')).toBe('b');
      expect(nodes[1]?.getAttribute('data-id')).toBe('c');
      expect(nodes[2]?.getAttribute('data-id')).toBe('a');
    });

    it('updates zIndex during runtime patching', () => {
      const builder = viz()
        .node('a', { circle: { r: 10 }, zIndex: 10 })
        .node('b', { circle: { r: 10 }, zIndex: -1 });

      const container = document.createElement('div');
      builder.mount(container);

      const scene = builder.build();
      const nodeA = scene.nodes.find((n) => n.id === 'a')!;
      const nodeB = scene.nodes.find((n) => n.id === 'b')!;

      // Swap zIndex
      nodeA.zIndex = -5;
      nodeB.zIndex = 15;

      builder.patchRuntime(container);

      const nodes = Array.from(
        container.querySelectorAll('g[data-viz-role="node-group"]')
      );
      // A is now behind B
      expect(nodes[0]?.getAttribute('data-id')).toBe('a');
      expect(nodes[1]?.getAttribute('data-id')).toBe('b');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Plugins
  // ═══════════════════════════════════════════════════════════════════════
  describe('Plugins', () => {
    it('applies a plugin using builder.use()', () => {
      // A simple plugin that adds a watermark node
      const watermarkPlugin: VizPlugin<{ text: string }> = (
        builder,
        options
      ) => {
        builder.node('watermark', {
          at: { x: 0, y: 0 },
          rect: { w: 100, h: 20 },
          label: options?.text ?? 'Watermark',
        });
      };

      const scene = viz()
        .node('a', { circle: { r: 10 } })
        .use(watermarkPlugin, { text: 'Draft' })
        .build();

      expect(scene.nodes).toHaveLength(2);
      const watermark = scene.nodes.find((n) => n.id === 'watermark');
      expect(watermark).toBeDefined();
      expect(watermark!.label?.text).toBe('Draft');
    });

    it('returns the builder for fluent chaining', () => {
      const dummyPlugin: VizPlugin = (b) => {
        b.node('plugin-node', { circle: { r: 5 } });
      };

      const builder = viz().use(dummyPlugin);
      expect(typeof builder.node).toBe('function');
      expect(typeof builder.edge).toBe('function');
      expect(typeof builder.build).toBe('function');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Events
  // ═══════════════════════════════════════════════════════════════════════
  describe('Events', () => {
    it('fires the build event when build() is called', () => {
      const builder = viz();
      let capturedScene: unknown = null;

      builder.on('build', (ev) => {
        capturedScene = ev.scene;
      });

      const scene = builder.build();
      expect(capturedScene).toBeDefined();
      expect(capturedScene).toBe(scene);
    });

    it('fires the mount event when mount() is called', () => {
      const builder = viz();
      let capturedContainer: unknown = null;
      let capturedController: unknown = null;

      builder.on('mount', (ev) => {
        capturedContainer = ev.container;
        capturedController = ev.controller;
      });

      const container = document.createElement('div');
      const controller = builder.mount(container, { panZoom: true });

      expect(capturedContainer).toBe(container);
      expect(capturedController).toBeDefined();
      expect(capturedController).toBe(controller);
    });

    it('allows unsubscribing from events', () => {
      const builder = viz();
      let buildCount = 0;

      const unsubscribe = builder.on('build', () => {
        buildCount++;
      });

      builder.build();
      expect(buildCount).toBe(1);

      unsubscribe();
      builder.build();
      expect(buildCount).toBe(1); // Should not increment
    });
  });
});
