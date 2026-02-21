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
});
