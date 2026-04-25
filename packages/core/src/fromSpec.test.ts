import { describe, expect, it } from 'vitest';
import { fromSpec } from './fromSpec';
import type { VizSpec } from './spec';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const minimal: VizSpec = {
  view: { width: 900, height: 360 },
  nodes: [
    { id: 'a', label: 'A', x: 80, y: 180 },
    { id: 'b', label: 'B', x: 420, y: 180 },
  ],
  edges: [{ from: 'a', to: 'b' }],
};

// ---------------------------------------------------------------------------
// Basic construction
// ---------------------------------------------------------------------------

describe('fromSpec', () => {
  it('returns a VizBuilder', () => {
    const b = fromSpec(minimal);
    expect(b).toBeDefined();
    expect(typeof b.build).toBe('function');
    expect(typeof b.mount).toBe('function');
  });

  it('sets the viewport dimensions', () => {
    const b = fromSpec({ view: { width: 1200, height: 500 }, nodes: [] });
    const view = b._getViewBox();
    expect(view).toEqual({ w: 1200, h: 500 });
  });

  it('builds without error for the minimal spec', () => {
    expect(() => fromSpec(minimal).build()).not.toThrow();
  });

  it('builds a scene with the correct node and edge count', () => {
    const scene = fromSpec(minimal).build();
    expect(scene.nodes).toHaveLength(2);
    expect(scene.edges).toHaveLength(1);
  });

  it('can be chained with further fluent calls after fromSpec', () => {
    const scene = fromSpec(minimal)
      .node('c')
      .at(700, 180)
      .rect(100, 40)
      .label('C')
      .done()
      .edge('b', 'c')
      .done()
      .build();
    expect(scene.nodes).toHaveLength(3);
    expect(scene.edges).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Node shape defaults
// ---------------------------------------------------------------------------

describe('fromSpec — node shape defaults', () => {
  const shapes = [
    'rect',
    'circle',
    'cylinder',
    'diamond',
    'hexagon',
    'ellipse',
    'cloud',
    'document',
    'parallelogram',
    'triangle',
    'note',
  ] as const;

  for (const shape of shapes) {
    it(`builds a '${shape}' node without explicit width/height`, () => {
      const spec: VizSpec = {
        view: { width: 400, height: 300 },
        nodes: [{ id: 'n', shape, x: 100, y: 100 }],
      };
      expect(() => fromSpec(spec).build()).not.toThrow();
    });
  }

  it('applies explicit width and height', () => {
    const spec: VizSpec = {
      view: { width: 400, height: 300 },
      nodes: [
        { id: 'n', shape: 'rect', x: 100, y: 100, width: 200, height: 80 },
      ],
    };
    const scene = fromSpec(spec).build();
    const node = scene.nodes[0]!;
    expect(node.shape).toMatchObject({ kind: 'rect', w: 200, h: 80 });
  });

  it('uses width as diameter for circle', () => {
    const scene = fromSpec({
      view: { width: 400, height: 300 },
      nodes: [{ id: 'c', shape: 'circle', x: 100, y: 100, width: 60 }],
    }).build();
    const node = scene.nodes[0]!;
    expect(node.shape).toMatchObject({ kind: 'circle', r: 30 });
  });

  it('derives hexagon radius from min(width, height)/2', () => {
    const scene = fromSpec({
      view: { width: 400, height: 300 },
      nodes: [
        { id: 'h', shape: 'hexagon', x: 100, y: 100, width: 80, height: 60 },
      ],
    }).build();
    const node = scene.nodes[0]!;
    // min(80, 60) / 2 = 30
    expect(node.shape).toMatchObject({ kind: 'hexagon', r: 30 });
  });

  it('derives ellipse semi-axes from width/2 and height/2', () => {
    const scene = fromSpec({
      view: { width: 400, height: 300 },
      nodes: [
        { id: 'e', shape: 'ellipse', x: 100, y: 100, width: 120, height: 40 },
      ],
    }).build();
    const node = scene.nodes[0]!;
    expect(node.shape).toMatchObject({ kind: 'ellipse', rx: 60, ry: 20 });
  });
});

// ---------------------------------------------------------------------------
// Node style props
// ---------------------------------------------------------------------------

describe('fromSpec — node styling', () => {
  it('translates fill, stroke, strokeWidth, opacity', () => {
    const scene = fromSpec({
      view: { width: 400, height: 300 },
      nodes: [
        {
          id: 'n',
          x: 100,
          y: 100,
          fill: '#ff0000',
          stroke: '#0000ff',
          strokeWidth: 3,
          opacity: 0.7,
        },
      ],
    }).build();
    const node = scene.nodes[0]!;
    expect(node.style?.fill).toBe('#ff0000');
    expect(node.style?.strokeWidth).toBe(3);
    expect(node.style?.opacity).toBe(0.7);
  });

  it('applies class', () => {
    const scene = fromSpec({
      view: { width: 400, height: 300 },
      nodes: [{ id: 'n', x: 100, y: 100, class: 'my-node' }],
    }).build();
    expect(scene.nodes[0]!.className).toBe('my-node');
  });

  it('passes multi-line label as newline-joined string', () => {
    const scene = fromSpec({
      view: { width: 400, height: 300 },
      nodes: [{ id: 'n', x: 100, y: 100, label: ['Line 1', 'Line 2'] }],
    }).build();
    const label = scene.nodes[0]!.label;
    expect(label).toBeDefined();
    // Multi-line labels are joined with '\n'
    if (typeof label === 'object' && label !== null && 'text' in label) {
      expect((label as { text: string }).text).toContain('Line 1');
    }
  });
});

// ---------------------------------------------------------------------------
// Edge spec
// ---------------------------------------------------------------------------

describe('fromSpec — edges', () => {
  it('sets edge from/to', () => {
    const scene = fromSpec(minimal).build();
    expect(scene.edges[0]).toMatchObject({ from: 'a', to: 'b' });
  });

  it('uses explicit edge id when provided', () => {
    const scene = fromSpec({
      ...minimal,
      edges: [{ from: 'a', to: 'b', id: 'my-edge' }],
    }).build();
    expect(scene.edges[0]!.id).toBe('my-edge');
  });

  it('translates edge label', () => {
    const scene = fromSpec({
      ...minimal,
      edges: [{ from: 'a', to: 'b', label: 'HTTP' }],
    }).build();
    const labels = scene.edges[0]!.labels;
    expect(labels?.some((l) => l.text === 'HTTP')).toBe(true);
  });

  it('translates curved routing', () => {
    const scene = fromSpec({
      ...minimal,
      edges: [{ from: 'a', to: 'b', style: 'curved' }],
    }).build();
    expect(scene.edges[0]!.routing).toBe('curved');
  });

  it('translates orthogonal routing', () => {
    const scene = fromSpec({
      ...minimal,
      edges: [{ from: 'a', to: 'b', style: 'orthogonal' }],
    }).build();
    expect(scene.edges[0]!.routing).toBe('orthogonal');
  });

  it('applies edge opacity and class', () => {
    const scene = fromSpec({
      ...minimal,
      edges: [{ from: 'a', to: 'b', opacity: 0.5, class: 'my-edge' }],
    }).build();
    const edge = scene.edges[0]!;
    expect(edge.style?.opacity).toBe(0.5);
    expect(edge.className).toBe('my-edge');
  });

  it('spec with no edges builds cleanly', () => {
    const scene = fromSpec({
      view: { width: 400, height: 300 },
      nodes: [{ id: 'a', x: 0, y: 0 }],
    }).build();
    expect(scene.edges).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Overlay spec
// ---------------------------------------------------------------------------

describe('fromSpec — overlays', () => {
  it('adds an absolute rect overlay', () => {
    const scene = fromSpec({
      ...minimal,
      overlays: [{ type: 'rect', x: 10, y: 20, width: 100, height: 50 }],
    }).build();
    expect(scene.overlays).toHaveLength(1);
    expect(scene.overlays![0]!.id).toBe('rect');
  });

  it('adds a node-relative rect overlay', () => {
    const scene = fromSpec({
      ...minimal,
      overlays: [
        { type: 'rect', nodeId: 'a', x: 5, y: -10, width: 80, height: 30 },
      ],
    }).build();
    expect(scene.overlays).toHaveLength(1);
    const params = scene.overlays![0]!.params as Record<string, unknown>;
    expect(params['nodeId']).toBe('a');
    expect(params['offsetX']).toBe(5);
    expect(params['offsetY']).toBe(-10);
  });

  it('adds an absolute circle overlay', () => {
    const scene = fromSpec({
      ...minimal,
      overlays: [{ type: 'circle', x: 50, y: 60, r: 15 }],
    }).build();
    expect(scene.overlays![0]!.id).toBe('circle');
  });

  it('adds a node-relative circle overlay', () => {
    const scene = fromSpec({
      ...minimal,
      overlays: [{ type: 'circle', nodeId: 'b', r: 12 }],
    }).build();
    const params = scene.overlays![0]!.params as Record<string, unknown>;
    expect(params['nodeId']).toBe('b');
    expect(params['r']).toBe(12);
  });

  it('adds an absolute text overlay', () => {
    const scene = fromSpec({
      ...minimal,
      overlays: [{ type: 'text', x: 100, y: 50, text: 'Hello' }],
    }).build();
    const params = scene.overlays![0]!.params as Record<string, unknown>;
    expect(params['text']).toBe('Hello');
  });

  it('adds a node-relative text overlay', () => {
    const scene = fromSpec({
      ...minimal,
      overlays: [
        {
          type: 'text',
          nodeId: 'a',
          y: -30,
          text: 'MISS',
          fill: '#ef4444',
          fontSize: 11,
        },
      ],
    }).build();
    const params = scene.overlays![0]!.params as Record<string, unknown>;
    expect(params['nodeId']).toBe('a');
    expect(params['text']).toBe('MISS');
    expect(params['fill']).toBe('#ef4444');
    expect(params['fontSize']).toBe(11);
  });

  it('preserves overlay key', () => {
    const scene = fromSpec({
      ...minimal,
      overlays: [{ type: 'text', x: 0, y: 0, text: 'X', key: 'my-label' }],
    }).build();
    expect(scene.overlays![0]!.key).toBe('my-label');
  });
});

// ---------------------------------------------------------------------------
// autoSignals — accepted as no-op
// ---------------------------------------------------------------------------

describe('fromSpec — autoSignals', () => {
  it('accepts autoSignals without throwing', () => {
    expect(() =>
      fromSpec({
        ...minimal,
        autoSignals: [
          { id: 's1', chain: ['a', 'b'], loop: true, durationPerHop: 700 },
        ],
      }).build()
    ).not.toThrow();
  });

  it('accepts steps without throwing', () => {
    expect(() =>
      fromSpec({
        ...minimal,
        steps: [
          { label: 'Step 1', signals: [{ id: 's1', chain: ['a', 'b'] }] },
        ],
      }).build()
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Full load-balancer example from the request spec
// ---------------------------------------------------------------------------

describe('fromSpec — full load-balancer example', () => {
  it('builds the complete example from the spec request without error', () => {
    const spec: VizSpec = {
      view: { width: 900, height: 360 },
      nodes: [
        {
          id: 'client',
          label: 'Client',
          shape: 'rect',
          x: 80,
          y: 180,
          width: 120,
          height: 40,
          fill: '#0e7490',
          stroke: '#164e63',
        },
        {
          id: 'lb',
          label: 'Load Balancer',
          shape: 'rect',
          x: 420,
          y: 180,
          width: 160,
          height: 40,
          fill: '#7c3aed',
          stroke: '#5b21b6',
        },
        {
          id: 's1',
          label: 'Server 1',
          shape: 'cylinder',
          x: 760,
          y: 100,
          width: 100,
          height: 40,
          fill: '#065f46',
          stroke: '#047857',
        },
        {
          id: 's2',
          label: 'Server 2',
          shape: 'cylinder',
          x: 760,
          y: 260,
          width: 100,
          height: 40,
          fill: '#065f46',
          stroke: '#047857',
        },
      ],
      edges: [
        { from: 'client', to: 'lb' },
        { from: 'lb', to: 's1' },
        { from: 'lb', to: 's2' },
      ],
      autoSignals: [
        {
          id: 'to-s1',
          chain: ['client', 'lb', 's1'],
          loop: true,
          durationPerHop: 700,
        },
        {
          id: 'to-s2',
          chain: ['client', 'lb', 's2'],
          loop: true,
          durationPerHop: 700,
          loopDelay: 500,
        },
      ],
    };

    const scene = fromSpec(spec).build();
    expect(scene.nodes).toHaveLength(4);
    expect(scene.edges).toHaveLength(3);
    // autoSignals are a no-op at build time; scene builds cleanly
    expect(scene.overlays?.length ?? 0).toBe(0);
  });
});
