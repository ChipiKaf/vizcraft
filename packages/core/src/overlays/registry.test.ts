// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { viz } from '../builder';
import type { VizScene } from '../types';
import {
  coreCircleOverlay,
  coreGroupOverlay,
  coreRectOverlay,
  coreSignalOverlay,
  coreTextOverlay,
  type SignalOverlayParams,
} from './registry';

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

function buildSignalChainScene() {
  const builder = viz()
    .view(640, 260)
    .node('producer', { at: { x: 80, y: 140 }, circle: { r: 18 } })
    .node('dispatcher', { at: { x: 220, y: 140 }, circle: { r: 18 } })
    .node('adapter', { at: { x: 360, y: 140 }, circle: { r: 18 } })
    .node('broker', { at: { x: 500, y: 140 }, circle: { r: 18 } });

  builder
    .edge('producer', 'dispatcher', 'producer-dispatcher')
    .routing('curved')
    .via(150, 220)
    .done();
  builder.edge('dispatcher', 'adapter', 'dispatcher-adapter').done();
  builder
    .edge('adapter', 'broker', 'adapter-broker')
    .routing('curved')
    .via(430, 60)
    .done();

  return builder.build();
}

function buildAnchoredOverlayScene() {
  return viz()
    .view(520, 240)
    .node('anchor', { at: { x: 180, y: 120 }, rect: { w: 120, h: 72, rx: 16 } })
    .node('peer', { at: { x: 360, y: 120 }, circle: { r: 18 } })
    .build();
}

function createOverlayContext(scene: VizScene) {
  return {
    nodesById: new Map(scene.nodes.map((node) => [node.id, node])),
    edgesById: new Map(scene.edges.map((edge) => [edge.id, edge])),
    scene,
  };
}

function renderSignal(scene: VizScene, params: SignalOverlayParams) {
  const nodesById = new Map(scene.nodes.map((node) => [node.id, node]));
  const edgesById = new Map(scene.edges.map((edge) => [edge.id, edge]));

  return coreSignalOverlay.render({
    spec: { id: 'signal', params },
    nodesById,
    edgesById,
    scene,
  });
}

function renderSignalFromScene(
  includeStraightAlternative: boolean,
  params: SignalOverlayParams
) {
  return renderSignal(buildSignalScene(includeStraightAlternative), params);
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

function extractNumericAttribute(markup: string, attribute: string) {
  const match = markup.match(new RegExp(`${attribute}="([\\-\\d.]+)"`));
  if (!match) {
    throw new Error(
      `Expected overlay markup to contain ${attribute}, got: ${markup}`
    );
  }

  return Number(match[1]);
}

describe('primitive overlay node anchors', () => {
  it('anchors circles to a node center with offsets', () => {
    const scene = buildAnchoredOverlayScene();
    const markup = coreCircleOverlay.render({
      spec: {
        id: 'circle',
        params: { nodeId: 'anchor', offsetX: 8, offsetY: -4, r: 6 },
      },
      ...createOverlayContext(scene),
    });

    expect(extractNumericAttribute(markup, 'cx')).toBeCloseTo(188, 5);
    expect(extractNumericAttribute(markup, 'cy')).toBeCloseTo(116, 5);
  });

  it('centers node-anchored rects on the resolved node position', () => {
    const scene = buildAnchoredOverlayScene();
    const markup = coreRectOverlay.render({
      spec: {
        id: 'rect',
        params: { nodeId: 'anchor', offsetX: 10, offsetY: -6, w: 40, h: 20 },
      },
      ...createOverlayContext(scene),
    });

    expect(extractNumericAttribute(markup, 'x')).toBeCloseTo(170, 5);
    expect(extractNumericAttribute(markup, 'y')).toBeCloseTo(104, 5);
  });

  it('updates node-anchored text when the node runtime position changes', () => {
    const scene = buildAnchoredOverlayScene();
    const ctx = createOverlayContext(scene);
    const container = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'g'
    ) as SVGGElement;

    coreTextOverlay.update?.(
      {
        spec: {
          id: 'text',
          params: { nodeId: 'anchor', offsetY: 26, text: '12 persisted' },
        },
        ...ctx,
      },
      container
    );

    let textEl = container.querySelector('text');
    expect(textEl?.getAttribute('x')).toBe('180');
    expect(textEl?.getAttribute('y')).toBe('146');

    const anchorNode = scene.nodes.find((node) => node.id === 'anchor');
    if (!anchorNode) {
      throw new Error('Expected anchor node to exist');
    }

    anchorNode.runtime = { x: 260, y: 96 };

    coreTextOverlay.update?.(
      {
        spec: {
          id: 'text',
          params: { nodeId: 'anchor', offsetY: 26, text: '12 persisted' },
        },
        ...ctx,
      },
      container
    );

    textEl = container.querySelector('text');
    expect(textEl?.getAttribute('x')).toBe('260');
    expect(textEl?.getAttribute('y')).toBe('122');
  });

  it('anchors groups to a node center before applying local offsets', () => {
    const scene = buildAnchoredOverlayScene();
    const markup = coreGroupOverlay.render({
      spec: {
        id: 'group',
        params: {
          nodeId: 'anchor',
          offsetX: 12,
          offsetY: -18,
          x: 4,
          y: 6,
          children: [],
        },
      },
      ...createOverlayContext(scene),
    });

    const point = extractTranslate(markup);
    expect(point.x).toBeCloseTo(196, 5);
    expect(point.y).toBeCloseTo(108, 5);
  });

  it('skips node-anchored primitive overlays when the node is missing', () => {
    const scene = buildAnchoredOverlayScene();
    const markup = coreCircleOverlay.render({
      spec: {
        id: 'circle',
        params: { nodeId: 'missing-node', r: 6 },
      },
      ...createOverlayContext(scene),
    });

    expect(markup).toBe('');
  });
});

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

  it('parks at the destination node once a resting signal arrives', () => {
    const point = extractTranslate(
      renderSignalFromScene(false, {
        from: 'a',
        to: 'b',
        followEdge: true,
        progress: 1,
        resting: true,
      })
    );

    expect(point.x).toBeCloseTo(400, 5);
    expect(point.y).toBeCloseTo(100, 5);
  });

  it('applies parked offsets relative to the parked node center', () => {
    const point = extractTranslate(
      renderSignalFromScene(false, {
        from: 'a',
        to: 'b',
        edgeId: 'curve',
        progress: 1,
        parkAt: 'b',
        parkOffsetX: 8,
        parkOffsetY: -4,
      })
    );

    expect(point.x).toBeCloseTo(408, 5);
    expect(point.y).toBeCloseTo(96, 5);
  });

  it('keeps a resting signal in motion until it arrives', () => {
    const point = extractTranslate(
      renderSignalFromScene(false, {
        from: 'a',
        to: 'b',
        edgeId: 'curve',
        progress: 0.5,
        resting: true,
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

  it('uses floor(progress) to resolve the active chain hop', () => {
    const point = extractTranslate(
      renderSignal(buildSignalChainScene(), {
        chain: [
          { from: 'producer', to: 'dispatcher', edgeId: 'producer-dispatcher' },
          { from: 'dispatcher', to: 'adapter' },
          { from: 'adapter', to: 'broker', edgeId: 'adapter-broker' },
        ],
        progress: 1.25,
        magnitude: 0.7,
      })
    );

    expect(point.x).toBeCloseTo(255, 5);
    expect(point.y).toBeCloseTo(140, 5);
  });

  it('follows hop-specific edge paths inside a signal chain', () => {
    const point = extractTranslate(
      renderSignal(buildSignalChainScene(), {
        chain: [
          { from: 'producer', to: 'dispatcher', edgeId: 'producer-dispatcher' },
          { from: 'dispatcher', to: 'adapter' },
          { from: 'adapter', to: 'broker', edgeId: 'adapter-broker' },
        ],
        progress: 0.5,
      })
    );

    expect(point.x).toBeCloseTo(150, 1);
    expect(point.y).toBeGreaterThan(150);
  });

  it('parks a completed signal chain at the final node automatically', () => {
    const point = extractTranslate(
      renderSignal(buildSignalChainScene(), {
        chain: [
          { from: 'producer', to: 'dispatcher', edgeId: 'producer-dispatcher' },
          { from: 'dispatcher', to: 'adapter' },
          { from: 'adapter', to: 'broker', edgeId: 'adapter-broker' },
        ],
        progress: 3.4,
      })
    );

    expect(point.x).toBeCloseTo(500, 5);
    expect(point.y).toBeCloseTo(140, 5);
  });

  it('applies parked overrides after a signal chain completes', () => {
    const point = extractTranslate(
      renderSignal(buildSignalChainScene(), {
        chain: [
          { from: 'producer', to: 'dispatcher', edgeId: 'producer-dispatcher' },
          { from: 'dispatcher', to: 'adapter' },
          { from: 'adapter', to: 'broker', edgeId: 'adapter-broker' },
        ],
        progress: 3,
        parkAt: 'adapter',
        parkOffsetX: 6,
        parkOffsetY: -4,
      })
    );

    expect(point.x).toBeCloseTo(366, 5);
    expect(point.y).toBeCloseTo(136, 5);
  });
});
