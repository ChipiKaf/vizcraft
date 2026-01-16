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
    expect(spec.tweens[0].target).toBe('node:a');

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
    expect(scene.edges[0].animations?.[0].id).toBe('flow');
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

    const [nodeSpec, edgeSpec] = scene.animationSpecs ?? [];
    expect(nodeSpec.tweens[0].target).toBe('node:a');
    expect(edgeSpec.tweens[0].target).toBe('edge:a->b');
  });
});
