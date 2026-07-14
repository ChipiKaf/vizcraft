import type { VizBuilder } from './builder';
import { viz } from './builder';
import type { EdgeBuilder, NodeBuilder } from './builder';
import type { StaticOverlaySpec, VizSpec } from './spec';
import { compileSpec } from './compile';
import type { ResolvedEdge, ResolvedNode } from './compile';
import { GROUP_HEADER_HEIGHT } from './compile/layout';

// ---------------------------------------------------------------------------
// Node translation helpers
// ---------------------------------------------------------------------------

function applyShape(nb: NodeBuilder, n: ResolvedNode): void {
  const shape = n.shape;
  const w = n.width;
  const h = n.height;

  switch (shape) {
    case 'rect':
      if (n.type === 'group' || n.type === 'zone') nb.rect(w, h, 8);
      else nb.rect(w, h);
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
}

function applyLabel(nb: NodeBuilder, n: ResolvedNode): void {
  if (n.spec.label === undefined) return;
  const labelText = Array.isArray(n.spec.label)
    ? n.spec.label.join('\n')
    : n.spec.label;

  if (n.type === 'zone' || n.labelPlacement === 'top-left') {
    nb.label(labelText, {
      dx: -(n.width / 2) + 10,
      dy: -(n.height / 2) + 16,
      textAnchor: 'start',
      fontSize: 12,
      fontWeight: 600,
      fill: n.stroke,
    });
    return;
  }

  if (n.type === 'group' && !n.collapsed && n.labelPlacement === 'top') {
    const headerH = n.headerHeight || GROUP_HEADER_HEIGHT;
    nb.label(labelText, {
      dy: -(n.height / 2) + headerH / 2,
      fontSize: 13,
      fontWeight: 600,
    });
    return;
  }

  if (n.type === 'note') {
    // Wrap inside the sticky note (with breathing room for the fold).
    nb.label(labelText, { maxWidth: n.width - 24, fontSize: 12 });
    return;
  }

  nb.label(labelText);
}

function applyResolvedNode(b: VizBuilder, n: ResolvedNode): void {
  const nb = b.node(n.id).at(n.x, n.y);

  applyShape(nb, n);
  applyLabel(nb, n);

  if (n.fill !== undefined) nb.fill(n.fill);
  if (n.stroke !== undefined) {
    if (n.strokeWidth !== undefined) nb.stroke(n.stroke, n.strokeWidth);
    else nb.stroke(n.stroke);
  }
  if (n.opacity !== undefined) nb.opacity(n.opacity);
  if (n.dash === 'dashed') nb.dashed();
  else if (n.dash === 'dotted') nb.dotted();
  else if (n.dash !== undefined) nb.dash(n.dash);
  if (n.className !== undefined) nb.class(n.className);
  if (n.zIndex !== undefined) nb.zIndex(n.zIndex);

  if (n.parent !== undefined) nb.parent(n.parent);

  if (n.type === 'group' && !n.collapsed) {
    const p = n.padding;
    nb.container({
      padding: { top: p, right: p, bottom: p, left: p },
      headerHeight: n.headerHeight > 0 ? n.headerHeight : undefined,
      autoSize: false,
    });
  }

  if (n.collapsed && n.hiddenChildCount !== undefined) {
    nb.badge(String(n.hiddenChildCount), {
      position: 'top-right',
      background: n.stroke ?? '#94a3b8',
      fill: '#ffffff',
    });
  }

  for (const port of n.ports ?? []) {
    nb.port(port.id, { x: port.x, y: port.y }, port.direction);
  }

  if (n.spec.tooltip !== undefined) {
    nb.tooltip(
      n.spec.tooltip.sections !== undefined
        ? { title: n.spec.tooltip.title, sections: n.spec.tooltip.sections }
        : n.spec.tooltip.title
    );
  }

  nb.done();
}

// ---------------------------------------------------------------------------
// Edge translation helpers
// ---------------------------------------------------------------------------

function applyResolvedEdge(b: VizBuilder, e: ResolvedEdge): void {
  const eb: EdgeBuilder = b.edge(e.from, e.to, e.id);

  if (e.label !== undefined) eb.label(e.label);

  if (e.routing === 'curved') eb.curved();
  else if (e.routing === 'orthogonal') eb.orthogonal();
  // 'straight' is the default — no call needed

  for (const wp of e.waypoints ?? []) eb.via(wp.x, wp.y);

  if (e.fromPort !== undefined) eb.fromPort(e.fromPort);
  if (e.toPort !== undefined) eb.toPort(e.toPort);
  if (e.fromAngle !== undefined) eb.fromAngle(e.fromAngle);
  if (e.toAngle !== undefined) eb.toAngle(e.toAngle);

  // Explicit `arrow` wins (legacy behaviour); kind tokens fill the gap.
  if (e.spec.arrow !== undefined) {
    eb.arrow(e.spec.arrow);
  } else {
    if (e.markerEnd !== undefined) eb.markerEnd(e.markerEnd);
    if (e.markerStart !== undefined) eb.markerStart(e.markerStart);
  }

  if (e.animate === 'flow') eb.animate('flow');

  if (e.stroke !== undefined) {
    if (e.strokeWidth !== undefined) eb.stroke(e.stroke, e.strokeWidth);
    else eb.stroke(e.stroke);
  } else if (e.strokeWidth !== undefined) {
    eb.stroke('#111', e.strokeWidth);
  }
  if (e.opacity !== undefined) eb.opacity(e.opacity);
  if (e.dash === 'dashed') eb.dashed();
  else if (e.dash === 'dotted') eb.dotted();
  else if (e.dash !== undefined) eb.dash(e.dash);
  if (e.className !== undefined) eb.class(e.className);

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

/** Shared mutable state for interactive collapse/expand across rebuilds. */
interface SpecRuntimeState {
  collapsed: Map<string, boolean>;
}

function hydrateBuilder(spec: VizSpec, state: SpecRuntimeState): VizBuilder {
  const compiled = compileSpec(spec, { collapsedOverrides: state.collapsed });

  const b = viz().view(spec.view.width, spec.view.height);

  for (const n of compiled.nodes) {
    applyResolvedNode(b, n);
  }

  for (const e of compiled.edges) {
    applyResolvedEdge(b, e);
  }

  for (const o of compiled.overlays) {
    applyOverlaySpec(b, o);
  }

  for (const s of spec.autoSignals ?? []) {
    b.autoSignal(s);
  }

  // ── Interactive collapse/expand (FR-7) ──────────────────────────────────
  // Clicking a group toggles its collapsed state and re-mounts the scene
  // into the same container. State survives rebuilds via `state.collapsed`.
  if (compiled.collapsibleGroupIds.length > 0) {
    let mountedContainer: HTMLElement | null = null;
    b.on('mount', ({ container }) => {
      mountedContainer = container;
    });

    const collapsedNow = (id: string): boolean =>
      state.collapsed.get(id) ??
      spec.nodes.find((n) => n.id === id)?.collapsed ??
      false;

    for (const groupId of compiled.collapsibleGroupIds) {
      b.node(groupId)
        .onClick(() => {
          if (!mountedContainer) return;
          state.collapsed.set(groupId, !collapsedNow(groupId));
          const container = mountedContainer;
          b.destroy();
          container.innerHTML = '';
          hydrateBuilder(spec, state).mount(container);
        })
        .done();
    }
  }

  return b;
}

/**
 * Translate a plain `VizSpec` object into a fully hydrated `VizBuilder`.
 *
 * The returned builder is an ordinary `VizBuilder` — you can chain further
 * fluent calls, then call `.mount()` or `.build()` as normal.
 *
 * Specs may use the full declarative feature set: `type: 'group'` containers
 * with auto-sizing, `type: 'zone'` regions, `type: 'note'` annotations,
 * auto-layout (`view.layout` / omitted coordinates), edge ports
 * (`from: 'node.e'`), boundary-aware and obstacle-avoiding routing, semantic
 * `kind` tokens with a `theme`, `legend` / title, `collapsed` groups and
 * `focus`. Flat specs (absolute `x`/`y` everywhere, none of those fields)
 * compile to exactly the same scene as before.
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
  return hydrateBuilder(spec, { collapsed: new Map() });
}

/**
 * Compile a spec without hydrating a builder — exposes resolved geometry
 * (positions, sizes, routed waypoints) for tooling, tests, and editors.
 */
export { compileSpec } from './compile';
export type { CompiledSpec, ResolvedEdge, ResolvedNode } from './compile';

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
