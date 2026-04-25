import type { VizBuilder } from './builder';
import { viz } from './builder';
import type {
  EdgeSpec,
  NodeSpec,
  NodeSpecShape,
  StaticOverlaySpec,
  VizSpec,
} from './spec';

// ---------------------------------------------------------------------------
// Node translation helpers
// ---------------------------------------------------------------------------

/**
 * Default dimensions per shape kind, applied when `NodeSpec.width` /
 * `NodeSpec.height` are omitted.
 */
const NODE_DEFAULTS: Record<NodeSpecShape, { width: number; height: number }> =
  {
    rect: { width: 120, height: 40 },
    circle: { width: 40, height: 40 },
    cylinder: { width: 100, height: 50 },
    diamond: { width: 80, height: 60 },
    hexagon: { width: 80, height: 60 },
    ellipse: { width: 120, height: 40 },
    cloud: { width: 120, height: 40 },
    document: { width: 120, height: 40 },
    parallelogram: { width: 120, height: 40 },
    triangle: { width: 120, height: 40 },
    note: { width: 120, height: 40 },
  };

function applyNodeSpec(b: VizBuilder, n: NodeSpec): void {
  const shape = n.shape ?? 'rect';
  const defaults = NODE_DEFAULTS[shape];
  const w = n.width ?? defaults.width;
  const h = n.height ?? defaults.height;

  const nb = b.node(n.id).at(n.x, n.y);

  switch (shape) {
    case 'rect':
      nb.rect(w, h);
      break;
    case 'circle':
      // width is the diameter; derive radius
      nb.circle(w / 2);
      break;
    case 'cylinder':
      nb.cylinder(w, h);
      break;
    case 'diamond':
      nb.diamond(w, h);
      break;
    case 'hexagon':
      // hexagon takes a single radius — use half the shorter axis
      nb.hexagon(Math.min(w, h) / 2);
      break;
    case 'ellipse':
      nb.ellipse(w / 2, h / 2);
      break;
    case 'cloud':
      nb.cloud(w, h);
      break;
    case 'document':
      nb.document(w, h);
      break;
    case 'parallelogram':
      nb.parallelogram(w, h);
      break;
    case 'triangle':
      nb.triangle(w, h);
      break;
    case 'note':
      nb.note(w, h);
      break;
    default: {
      const _exhaustive: never = shape;
      void _exhaustive;
      // Safe fallback for runtime values not in the union
      nb.rect(w, h);
    }
  }

  if (n.label !== undefined) {
    const labelText = Array.isArray(n.label) ? n.label.join('\n') : n.label;
    nb.label(labelText);
  }

  if (n.fill !== undefined) nb.fill(n.fill);
  if (n.stroke !== undefined) {
    if (n.strokeWidth !== undefined) nb.stroke(n.stroke, n.strokeWidth);
    else nb.stroke(n.stroke);
  }
  if (n.opacity !== undefined) nb.opacity(n.opacity);
  if (n.dashed === true) nb.dashed();
  if (n.dotted === true) nb.dotted();
  if (n.class !== undefined) nb.class(n.class);
  if (n.tooltip !== undefined) {
    nb.tooltip(
      n.tooltip.sections !== undefined
        ? { title: n.tooltip.title, sections: n.tooltip.sections }
        : n.tooltip.title
    );
  }

  nb.done();
}

// ---------------------------------------------------------------------------
// Edge translation helpers
// ---------------------------------------------------------------------------

function applyEdgeSpec(b: VizBuilder, e: EdgeSpec): void {
  const eb = b.edge(e.from, e.to, e.id);

  if (e.label !== undefined) eb.label(e.label);

  if (e.style === 'curved') eb.curved();
  else if (e.style === 'orthogonal') eb.orthogonal();
  // 'straight' is the default — no call needed

  if (e.arrow !== undefined) eb.arrow(e.arrow);

  if (e.animate === 'flow') eb.animate('flow');

  if (e.stroke !== undefined) {
    if (e.strokeWidth !== undefined) eb.stroke(e.stroke, e.strokeWidth);
    else eb.stroke(e.stroke);
  }
  if (e.opacity !== undefined) eb.opacity(e.opacity);
  if (e.dashed === true) eb.dashed();
  if (e.dotted === true) eb.dotted();
  if (e.class !== undefined) eb.class(e.class);

  eb.done();
}

// ---------------------------------------------------------------------------
// Overlay translation helpers
// ---------------------------------------------------------------------------

function applyOverlaySpec(b: VizBuilder, o: StaticOverlaySpec): void {
  switch (o.type) {
    case 'rect': {
      if (o.nodeId !== undefined) {
        b.overlay(
          'rect',
          {
            nodeId: o.nodeId,
            offsetX: o.x,
            offsetY: o.y,
            w: o.width,
            h: o.height,
            rx: o.rx,
            fill: o.fill,
            stroke: o.stroke,
            strokeWidth: o.strokeWidth,
            opacity: o.opacity,
          },
          o.key
        );
      } else {
        b.overlay(
          'rect',
          {
            x: o.x ?? 0,
            y: o.y ?? 0,
            w: o.width,
            h: o.height,
            rx: o.rx,
            fill: o.fill,
            stroke: o.stroke,
            strokeWidth: o.strokeWidth,
            opacity: o.opacity,
          },
          o.key
        );
      }
      break;
    }
    case 'circle': {
      if (o.nodeId !== undefined) {
        b.overlay(
          'circle',
          {
            nodeId: o.nodeId,
            offsetX: o.x,
            offsetY: o.y,
            r: o.r,
            fill: o.fill,
            stroke: o.stroke,
            strokeWidth: o.strokeWidth,
            opacity: o.opacity,
          },
          o.key
        );
      } else {
        b.overlay(
          'circle',
          {
            x: o.x ?? 0,
            y: o.y ?? 0,
            r: o.r,
            fill: o.fill,
            stroke: o.stroke,
            strokeWidth: o.strokeWidth,
            opacity: o.opacity,
          },
          o.key
        );
      }
      break;
    }
    case 'text': {
      if (o.nodeId !== undefined) {
        b.overlay(
          'text',
          {
            nodeId: o.nodeId,
            offsetX: o.x,
            offsetY: o.y,
            text: o.text,
            fill: o.fill,
            fontSize: o.fontSize,
            fontWeight: o.fontWeight,
            textAnchor: o.textAnchor,
            opacity: o.opacity,
          },
          o.key
        );
      } else {
        b.overlay(
          'text',
          {
            x: o.x ?? 0,
            y: o.y ?? 0,
            text: o.text,
            fill: o.fill,
            fontSize: o.fontSize,
            fontWeight: o.fontWeight,
            textAnchor: o.textAnchor,
            opacity: o.opacity,
          },
          o.key
        );
      }
      break;
    }
    default: {
      const _exhaustive: never = o;
      void _exhaustive;
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Translate a plain `VizSpec` object into a fully hydrated `VizBuilder`.
 *
 * The returned builder is an ordinary `VizBuilder` — you can chain further
 * fluent calls, then call `.mount()` or `.build()` as normal.
 *
 * `autoSignals` and `steps` fields are stored via `builder.autoSignal()` and
 * are silently ignored at render time until the internal-animator /
 * step-controller features are activated.
 *
 * @example
 * ```ts
 * import { fromSpec } from 'vizcraft';
 *
 * const builder = fromSpec({
 *   view: { width: 900, height: 360 },
 *   nodes: [
 *     { id: 'client', label: 'Client', x: 80,  y: 180 },
 *     { id: 'lb',     label: 'LB',     x: 420, y: 180 },
 *   ],
 *   edges: [{ from: 'client', to: 'lb' }],
 * });
 *
 * builder.mount(document.getElementById('canvas')!);
 * ```
 */
export function fromSpec(spec: VizSpec): VizBuilder {
  const b = viz().view(spec.view.width, spec.view.height);

  for (const n of spec.nodes) {
    applyNodeSpec(b, n);
  }

  for (const e of spec.edges ?? []) {
    applyEdgeSpec(b, e);
  }

  for (const o of spec.overlays ?? []) {
    applyOverlaySpec(b, o);
  }

  for (const s of spec.autoSignals ?? []) {
    b.autoSignal(s);
  }

  return b;
}

// Re-export spec types so consumers can import them from a single entrypoint.
export type {
  AutoSignalSpec,
  EdgeAnimateSpec,
  ArrowModeSpec,
  EdgeSpec,
  EdgeStyleSpec,
  NodeSpec,
  NodeSpecShape,
  StaticOverlaySpec,
  VizSpec,
  VizStepSpec,
} from './spec';
