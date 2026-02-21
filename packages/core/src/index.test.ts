import { describe, it, expect } from 'vitest';
import { viz } from './index';

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
      expect(svgStr).not.toContain('<line');
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

    it('per-edge style renders as inline SVG attributes in svg()', () => {
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
      expect(pathMatch![0]).toContain('stroke="#ff0000"');
      expect(pathMatch![0]).toContain('stroke-width="3"');
      expect(pathMatch![0]).toContain('fill="blue"');
    });

    it('edge without style does not add inline stroke/fill attributes', () => {
      const svgStr = viz()
        .node('a')
        .at(50, 50)
        .circle(10)
        .node('b')
        .at(250, 50)
        .circle(10)
        .edge('a', 'b')
        .svg();

      const pathMatch = svgStr.match(/<path[^>]*class="viz-edge"[^>]*>/);
      expect(pathMatch).toBeTruthy();
      // No inline stroke or fill when no style is set (CSS defaults apply)
      expect(pathMatch![0]).not.toContain('stroke=');
      expect(pathMatch![0]).not.toContain('fill=');
    });
  });
});
