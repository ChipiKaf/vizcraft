/**
 * Declarative spec compiler.
 *
 * `compileSpec` turns a `VizSpec` — which may use groups, zones, notes,
 * auto-layout, ports, semantic kinds, legend/title, collapse and focus —
 * into fully resolved nodes/edges/overlays. Flat specs (absolute `x`/`y`,
 * none of the new fields) pass through unchanged, keeping `fromSpec`
 * backward compatible.
 *
 * The pipeline is fully deterministic: the same spec always compiles to the
 * same geometry.
 */

import type { NodeSpec, NodeSpecShape, VizSpec } from '../spec';
import type {
  Box,
  CompiledSpec,
  CompileOptions,
  Point,
  ResolvedEdge,
  ResolvedNode,
} from './types';
import { resolveTheme } from './kinds';
import { buildContainmentTree, nodeType } from './tree';
import { groupMeta, resolveGeometry, NODE_DEFAULTS } from './layout';
import {
  computeBoundaryStubs,
  parseEndpoint,
  parallelGroups,
  routeAvoid,
  separateParallelEdge,
} from './routing';
import { applyCollapse, computeFocusSet } from './collapse';
import {
  legendOverlays,
  placeNote,
  resolveZoneBox,
  titleOverlays,
  ZONE_DEFAULT_FILL,
  ZONE_DEFAULT_STROKE,
} from './annotations';

export type {
  Box,
  CompiledSpec,
  CompileOptions,
  Point,
  ResolvedEdge,
  ResolvedNode,
} from './types';
export { NODE_DEFAULTS } from './layout';
export { BUILTIN_EDGE_KINDS, BUILTIN_NODE_KINDS, resolveTheme } from './kinds';
export { parseEndpoint } from './routing';

// Visual defaults per structural type.
const GROUP_STYLE = {
  fill: 'rgba(148,163,184,0.08)',
  stroke: '#94a3b8',
  strokeWidth: 1.5,
};
const NOTE_STYLE = { fill: '#fef9c3', stroke: '#ca8a04', strokeWidth: 1.25 };
const FOCUS_DIM_OPACITY = 0.2;

const DIMMED_CLASS = 'viz-dimmed';

/**
 * Compile a declarative spec into resolved geometry and styles.
 *
 * @param spec The declarative spec.
 * @param opts Compile options (runtime collapse overrides).
 */
export function compileSpec(
  spec: VizSpec,
  opts?: CompileOptions
): CompiledSpec {
  const theme = resolveTheme(spec.theme);
  const allEdges = spec.edges ?? [];

  // ── Split zones and anchored notes out of the structural node set ───────
  const zones = spec.nodes.filter((n) => nodeType(n) === 'zone');
  const structural = spec.nodes.filter((n) => nodeType(n) !== 'zone');

  // Full containment tree over the raw spec — validates parents/cycles and
  // provides descendant maps for focus/highlight even under collapse.
  const rawTree = buildContainmentTree(structural);

  // ── Collapse (FR-7) ──────────────────────────────────────────────────────
  const collapse = applyCollapse(
    structural,
    allEdges,
    opts?.collapsedOverrides
  );
  const isCollapsedGroup = (n: NodeSpec): boolean =>
    collapse.collapsedGroups.has(n.id);

  // Notes anchored to a node are positioned beside it, not by the layout.
  const anchoredNoteIds = new Set(
    collapse.nodes
      .filter((n) => nodeType(n) === 'note' && n.anchor !== undefined)
      .map((n) => n.id)
  );
  const layoutNodes = collapse.nodes.filter((n) => !anchoredNoteIds.has(n.id));

  const shapeOf = (n: NodeSpec): NodeSpecShape => {
    if (n.shape) return n.shape;
    if (nodeType(n) === 'note') return 'note';
    if (n.kind !== undefined) {
      const tokenShape = theme.nodeKinds[n.kind]?.shape;
      if (tokenShape) return tokenShape;
    }
    return 'rect';
  };

  // ── Layout (FR-1/FR-4) ───────────────────────────────────────────────────
  const tree = buildContainmentTree(layoutNodes);
  const boxes = resolveGeometry({
    nodes: layoutNodes,
    edges: collapse.edges,
    tree,
    view: spec.view,
    shapeOf,
    isCollapsed: isCollapsedGroup,
  });

  // ── Anchored notes (FR-6) ────────────────────────────────────────────────
  for (const n of collapse.nodes) {
    if (!anchoredNoteIds.has(n.id)) continue;
    const defaults = NODE_DEFAULTS[shapeOf(n)];
    const size = {
      width: n.width ?? defaults.width,
      height: n.height ?? defaults.height,
    };
    const anchorBox = boxes.get(n.anchor!);
    if (!anchorBox) {
      console.warn(
        `VizCraft spec: note '${n.id}' anchors to unknown or hidden node '${n.anchor}'.`
      );
      boxes.set(n.id, {
        x: n.x ?? spec.view.width / 2,
        y: n.y ?? spec.view.height / 2,
        ...size,
      });
      continue;
    }
    boxes.set(n.id, placeNote(n, size, anchorBox, spec.view));
  }

  // ── Zones (FR-2) ─────────────────────────────────────────────────────────
  const zoneBoxes = new Map<string, Box>();
  for (const zone of zones) {
    const members = collapse.nodes
      .filter((n) => n.zone === zone.id)
      .map((n) => boxes.get(n.id))
      .filter((b): b is Box => b !== undefined);
    const box = resolveZoneBox(zone, members);
    if (!box) {
      console.warn(
        `VizCraft spec: zone '${zone.id}' has no members and no pinned bounds — skipping.`
      );
      continue;
    }
    zoneBoxes.set(zone.id, box);
  }

  // ── Resolved nodes ───────────────────────────────────────────────────────
  const resolvedNodes: ResolvedNode[] = [];

  for (const zone of zones) {
    const box = zoneBoxes.get(zone.id);
    if (!box) continue;
    resolvedNodes.push(resolveZoneNode(zone, box));
  }

  for (const n of collapse.nodes) {
    const box = boxes.get(n.id)!;
    resolvedNodes.push(
      resolveStructuralNode(n, box, {
        theme,
        shape: shapeOf(n),
        isCollapsed: isCollapsedGroup(n),
        hiddenChildCount: collapse.collapsedGroups.get(n.id),
        meta:
          nodeType(n) === 'group'
            ? groupMeta(n, { isCollapsed: isCollapsedGroup })
            : undefined,
      })
    );
  }

  // ── Edges (FR-3/FR-5) ────────────────────────────────────────────────────
  const nodeIds = new Set(resolvedNodes.map((n) => n.id));
  const boxOf = (id: string): Box | undefined =>
    boxes.get(id) ?? zoneBoxes.get(id);

  const parsedEdges = collapse.edges.map((e) => {
    const from = parseEndpoint(e.from, nodeIds);
    const to = parseEndpoint(e.to, nodeIds);
    return { e, from, to };
  });

  const parallel = parallelGroups(
    parsedEdges.map(({ from, to }) => ({ from: from.node, to: to.node }))
  );

  const resolvedEdges: ResolvedEdge[] = [];

  parsedEdges.forEach(({ e, from, to }, i) => {
    const kindToken =
      e.kind !== undefined ? theme.edgeKinds[e.kind] : undefined;
    if (e.kind !== undefined && !kindToken) {
      console.warn(
        `VizCraft spec: unknown edge kind '${e.kind}' on edge '${from.node}' → '${to.node}'. ` +
          'Define it in spec.theme.edgeKinds or use a built-in kind.'
      );
    }

    const fromPort = e.fromPort ?? from.port;
    const toPort = e.toPort ?? to.port;

    const fromBox = boxOf(from.node);
    const toBox = boxOf(to.node);

    let routing: 'straight' | 'curved' | 'orthogonal' = e.style ?? 'straight';
    let waypoints: Point[] | undefined;
    let fromAngle: number | undefined;
    let toAngle: number | undefined;

    if (fromBox && toBox) {
      if (e.routing === 'avoid') {
        const route = routeAvoid({
          fromBox,
          toBox,
          obstacles: obstaclesFor(
            from.node,
            to.node,
            resolvedNodes,
            tree.parentOf
          ),
        });
        if (route) {
          routing = 'straight'; // Exact polyline through rectilinear corners.
          waypoints = route;
        } else {
          routing = 'orthogonal';
        }
      } else {
        const stubs = computeBoundaryStubs(
          from.node,
          to.node,
          boxes,
          tree.parentOf
        );
        if (
          stubs.length > 0 &&
          e.style !== 'straight' &&
          e.style !== 'curved'
        ) {
          // Boundary-crossing edges default to a clean orthogonal exit.
          routing = 'orthogonal';
          waypoints = stubs;
        }
      }

      // Parallel edge separation (FR-3.4) — only for edges that have no
      // explicit attachment or computed route of their own.
      const { index, count, reversed } = parallel[i]!;
      if (
        count > 1 &&
        waypoints === undefined &&
        fromPort === undefined &&
        toPort === undefined
      ) {
        const adj = separateParallelEdge(
          fromBox,
          toBox,
          index,
          count,
          routing,
          reversed
        );
        fromAngle = adj.fromAngle;
        toAngle = adj.toAngle;
        if (adj.waypoint) waypoints = [adj.waypoint];
      }
    }

    resolvedEdges.push({
      id: e.id ?? `${from.node}->${to.node}`,
      spec: e,
      from: from.node,
      to: to.node,
      fromPort,
      toPort,
      routing,
      waypoints,
      fromAngle,
      toAngle,
      label: e.label,
      markerStart:
        e.arrow === 'start' || e.arrow === 'both'
          ? 'arrow'
          : kindToken?.markerStart,
      markerEnd:
        e.arrow === undefined
          ? kindToken?.markerEnd
          : e.arrow === false || e.arrow === 'start'
            ? 'none'
            : 'arrow',
      animate: e.animate ?? kindToken?.animate,
      stroke: e.stroke ?? kindToken?.stroke,
      strokeWidth: e.strokeWidth ?? kindToken?.strokeWidth,
      dash: resolveDash(e.dashed, e.dotted, undefined, kindToken?.dash),
      opacity: e.opacity ?? kindToken?.opacity,
      className: e.class,
    });
  });

  // ── Note leader lines (FR-6) ────────────────────────────────────────────
  for (const n of collapse.nodes) {
    if (!anchoredNoteIds.has(n.id) || !boxOf(n.anchor!)) continue;
    resolvedEdges.push({
      id: `${n.id}->leader`,
      spec: { from: n.id, to: n.anchor! },
      from: n.id,
      to: n.anchor!,
      routing: 'straight',
      markerEnd: 'none',
      stroke: NOTE_STYLE.stroke,
      strokeWidth: 1,
      dash: 'dotted',
      opacity: 0.7,
      className: 'viz-note-leader',
    });
  }

  // ── Focus (FR-7.3) ───────────────────────────────────────────────────────
  if (spec.focus !== undefined) {
    if (!nodeIds.has(spec.focus)) {
      console.warn(`VizCraft spec: focus target '${spec.focus}' not found.`);
    } else {
      const keep = computeFocusSet({
        focus: spec.focus,
        nodeIds: [...nodeIds],
        descendantsOf: rawTree.descendantsOf,
        parentOf: tree.parentOf,
        edges: resolvedEdges,
      });
      for (const n of resolvedNodes) {
        if (n.type === 'zone') continue;
        if (!keep.has(n.id)) {
          n.dimmed = true;
          n.opacity = Math.min(n.opacity ?? 1, FOCUS_DIM_OPACITY);
          n.className = appendClass(n.className, DIMMED_CLASS);
        }
      }
      for (const e of resolvedEdges) {
        if (!keep.has(e.from) || !keep.has(e.to)) {
          e.dimmed = true;
          e.opacity = Math.min(e.opacity ?? 1, FOCUS_DIM_OPACITY);
          e.className = appendClass(e.className, DIMMED_CLASS);
        }
      }
    }
  }

  // ── Overlays: title band + legend (FR-6) ─────────────────────────────────
  const overlays = [...(spec.overlays ?? []), ...titleOverlays(spec.view)];

  if (spec.legend !== undefined) {
    const usedEdgeKinds = uniqueInOrder(
      collapse.edges
        .map((e) => e.kind)
        .filter((k): k is string => k !== undefined)
    );
    const usedNodeKinds = uniqueInOrder(
      collapse.nodes
        .map((n) => n.kind)
        .filter((k): k is string => k !== undefined)
    );
    overlays.push(
      ...legendOverlays(
        spec.legend,
        spec.view,
        theme,
        usedEdgeKinds,
        usedNodeKinds
      )
    );
  }

  return {
    view: spec.view,
    nodes: resolvedNodes,
    edges: resolvedEdges,
    overlays,
    collapsibleGroupIds: collapse.collapsibleGroupIds,
    descendantsOf: rawTree.descendantsOf,
  };
}

// ---------------------------------------------------------------------------
// Node resolution helpers
// ---------------------------------------------------------------------------

function resolveZoneNode(zone: NodeSpec, box: Box): ResolvedNode {
  return {
    id: zone.id,
    type: 'zone',
    spec: zone,
    shape: zone.shape ?? 'rect',
    ...box,
    labelPlacement: zone.labelPlacement ?? 'top-left',
    headerHeight: 0,
    padding: zone.padding ?? 24,
    fill: zone.fill ?? ZONE_DEFAULT_FILL,
    stroke: zone.stroke ?? ZONE_DEFAULT_STROKE,
    strokeWidth: zone.strokeWidth ?? 1.25,
    dash: resolveDash(zone.dashed, zone.dotted, zone.style, 'dashed'),
    opacity: zone.opacity,
    className: appendClass(zone.class, 'viz-zone'),
    zIndex: -10,
  };
}

function resolveStructuralNode(
  n: NodeSpec,
  box: Box,
  ctx: {
    theme: ReturnType<typeof resolveTheme>;
    shape: NodeSpecShape;
    isCollapsed: boolean;
    hiddenChildCount: number | undefined;
    meta?: { padding: number; headerHeight: number };
  }
): ResolvedNode {
  const type = nodeType(n);
  const kindToken =
    n.kind !== undefined ? ctx.theme.nodeKinds[n.kind] : undefined;
  if (n.kind !== undefined && !kindToken) {
    console.warn(
      `VizCraft spec: unknown node kind '${n.kind}' on node '${n.id}'. ` +
        'Define it in spec.theme.nodeKinds or use a built-in kind.'
    );
  }

  const typeDefaults =
    type === 'group' ? GROUP_STYLE : type === 'note' ? NOTE_STYLE : undefined;

  return {
    id: n.id,
    type,
    spec: n,
    shape: ctx.shape,
    ...box,
    parent: n.parent,
    labelPlacement:
      n.labelPlacement ??
      (type === 'group' && !ctx.isCollapsed ? 'top' : 'center'),
    headerHeight: ctx.meta?.headerHeight ?? 0,
    padding: ctx.meta?.padding ?? 0,
    collapsed: ctx.isCollapsed || undefined,
    hiddenChildCount: ctx.hiddenChildCount,
    fill: n.fill ?? kindToken?.fill ?? typeDefaults?.fill,
    stroke: n.stroke ?? kindToken?.stroke ?? typeDefaults?.stroke,
    strokeWidth:
      n.strokeWidth ?? kindToken?.strokeWidth ?? typeDefaults?.strokeWidth,
    dash: resolveDash(n.dashed, n.dotted, n.style, kindToken?.dash),
    opacity: n.opacity ?? kindToken?.opacity,
    className: appendClass(
      n.class,
      type === 'group'
        ? ctx.isCollapsed
          ? 'viz-group viz-group-collapsed'
          : 'viz-group'
        : type === 'note'
          ? 'viz-note'
          : undefined
    ),
    ports: n.ports,
  };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function resolveDash(
  dashed: boolean | undefined,
  dotted: boolean | undefined,
  styleShorthand: 'solid' | 'dashed' | 'dotted' | undefined,
  tokenDash: string | undefined
): string | undefined {
  if (dashed === true) return 'dashed';
  if (dotted === true) return 'dotted';
  if (styleShorthand !== undefined && styleShorthand !== 'solid') {
    return styleShorthand;
  }
  if (styleShorthand === 'solid') return undefined;
  if (tokenDash !== undefined && tokenDash !== 'solid') return tokenDash;
  return undefined;
}

function appendClass(
  existing: string | undefined,
  extra: string | undefined
): string | undefined {
  if (extra === undefined) return existing;
  return existing ? `${existing} ${extra}` : extra;
}

function uniqueInOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/**
 * Obstacles for avoid-routing: every visible structural node except the two
 * endpoints and any group that contains either endpoint.
 */
function obstaclesFor(
  fromId: string,
  toId: string,
  nodes: ResolvedNode[],
  parentOf: ReadonlyMap<string, string>
): Box[] {
  const excluded = new Set<string>([fromId, toId]);
  for (const id of [fromId, toId]) {
    let cur = parentOf.get(id);
    while (cur !== undefined) {
      excluded.add(cur);
      cur = parentOf.get(cur);
    }
  }
  return nodes
    .filter(
      (n) =>
        n.type !== 'zone' &&
        !excluded.has(n.id) &&
        // Children of excluded ancestor groups still block; only the frames
        // that contain an endpoint are passable.
        true
    )
    .map((n) => ({ x: n.x, y: n.y, width: n.width, height: n.height }));
}
