import { describe, expect, it } from 'vitest';

import { viz } from '../builder';
import { coreSignalOverlay } from './registry';

function buildSignalScene(includeStraightAlternative = false) {
  const builder = viz()
    .view(520, 200)
    .node('a', { at: { x: 120, y: 100 }, circle: { r: 18 } })
    .node('b', { at: { x: 400, y: 100 }, circle: { r: 18 } });

  builder.edge('a', 'b', 'curve').routing('curved').done();

  if (includeStraightAlternative) {
    builder.edge('a', 'b', 'straight').done();
  }

  return builder.build();
}

function renderSignalFromScene(
  includeStraightAlternative: boolean,
  params: {
    from: string;
    to: string;
    progress: number;
    magnitude?: number;
    followEdge?: boolean;
    edgeId?: string;
  }
) {
  const scene = buildSignalScene(includeStraightAlternative);
  const nodesById = new Map(scene.nodes.map((node) => [node.id, node]));
  const edgesById = new Map(scene.edges.map((edge) => [edge.id, edge]));

  return coreSignalOverlay.render({
    spec: { id: 'signal', params },
    nodesById,
    edgesById,
    scene,
  });
}

function extractTranslate(markup: string) {
  const match = markup.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
  if (!match) {
    throw new Error(
      `Expected signal markup to contain a translate(), got: ${markup}`
    );
  }

  return {
    x: Number(match[1]),
    y: Number(match[2]),
  };
}

describe('coreSignalOverlay', () => {
  it('follows the requested edge path when edgeId is provided', () => {
    const point = extractTranslate(
      renderSignalFromScene(true, {
        from: 'a',
        to: 'b',
        edgeId: 'curve',
        progress: 0.5,
      })
    );

    expect(point.x).toBeCloseTo(260, 1);
    expect(point.y).toBeGreaterThan(110);
  });

  it('follows the unique matching edge when followEdge is enabled', () => {
    const point = extractTranslate(
      renderSignalFromScene(false, {
        from: 'a',
        to: 'b',
        followEdge: true,
        progress: 0.5,
      })
    );

    expect(point.x).toBeCloseTo(260, 1);
    expect(point.y).toBeGreaterThan(110);
  });

  it('falls back to center interpolation when followEdge is ambiguous', () => {
    const point = extractTranslate(
      renderSignalFromScene(true, {
        from: 'a',
        to: 'b',
        followEdge: true,
        progress: 0.5,
      })
    );

    expect(point.x).toBeCloseTo(260, 5);
    expect(point.y).toBeCloseTo(100, 5);
  });

  it('falls back to center interpolation when edgeId does not resolve', () => {
    const point = extractTranslate(
      renderSignalFromScene(false, {
        from: 'a',
        to: 'b',
        edgeId: 'missing-edge',
        progress: 0.5,
      })
    );

    expect(point.x).toBeCloseTo(260, 5);
    expect(point.y).toBeCloseTo(100, 5);
  });
});
