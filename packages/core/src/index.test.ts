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
});
