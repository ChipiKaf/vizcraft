// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { viz } from './builder';

function getEdgeLineD(container: HTMLElement): string {
  const el = container.querySelector(
    '[data-viz-role="edge-line"]'
  ) as SVGPathElement | null;
  expect(el).toBeTruthy();
  return el?.getAttribute('d') ?? '';
}

describe('EdgePathResolver + edge.meta', () => {
  it('allows attaching arbitrary metadata to edges', () => {
    const b = viz()
      .view(200, 200)
      .node('a')
      .at(20, 20)
      .done()
      .node('b')
      .at(180, 180)
      .done()
      .edge('a', 'b')
      .meta({ customRouting: true, padding: 10 })
      .done();

    const scene = b.build();
    expect(scene.edges[0]?.meta).toEqual({ customRouting: true, padding: 10 });
  });

  it('overrides edge path `d` in svg() output', () => {
    const CUSTOM_D = 'M 0 0 L 10 10';

    const b = viz().view(200, 200);
    b.setEdgePathResolver((edge, scene, defaultResolver) => {
      if (edge.meta && (edge.meta as Record<string, unknown>).customRouting) {
        return CUSTOM_D;
      }
      return defaultResolver(edge, scene);
    });

    b.node('a').at(20, 20).done();
    b.node('b').at(180, 180).done();
    b.edge('a', 'b').meta({ customRouting: true }).done();

    const svg = b.svg();
    expect(svg).toContain(`d="${CUSTOM_D}"`);
  });

  it('applies during mount(), commit(), and patchRuntime()', () => {
    const CUSTOM_D = 'M 1 2 C 30 40 50 60 70 80';

    const b = viz().view(300, 200);
    b.setEdgePathResolver((edge, scene, defaultResolver) => {
      if (edge.meta && (edge.meta as Record<string, unknown>).customRouting) {
        return CUSTOM_D;
      }
      return defaultResolver(edge, scene);
    });

    b.node('a').at(40, 100).circle(16).done();
    b.node('b').at(260, 100).rect(50, 30, 8).done();
    b.edge('a', 'b').meta({ customRouting: true }).arrow().done();

    const container = document.createElement('div');
    b.mount(container);

    expect(getEdgeLineD(container)).toBe(CUSTOM_D);

    // patchRuntime should keep using the resolver
    b.updateNode('a', { runtime: { x: 60, y: 90 } });
    b.patchRuntime(container);
    expect(getEdgeLineD(container)).toBe(CUSTOM_D);

    // Clearing meta + commit should revert to default resolver output
    b.updateEdge('a->b', { meta: { customRouting: false } });
    b.commit(container);

    const after = getEdgeLineD(container);
    expect(after).not.toBe(CUSTOM_D);
    expect(after.length).toBeGreaterThan(0);
  });
});
