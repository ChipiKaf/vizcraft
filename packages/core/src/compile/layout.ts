/**
 * Auto-layout (FR-4) and group auto-sizing (FR-1).
 *
 * Two passes over the containment tree:
 *
 * 1. **Bottom-up sizing** — leaves take explicit `width`/`height` or shape
 *    defaults; groups run their children through a layout engine and hug the
 *    resulting extent plus padding and a header strip.
 * 2. **Top-down placement** — the root scope places root nodes in view
 *    coordinates, then every group translates its children into place.
 *
 * All engines are deterministic: same spec in → same positions out.
 * Hand-pinned coordinates always win over engine output.
 */

import type {
  EdgeSpec,
  LayoutDirectionSpec,
  LayoutEngineSpec,
  NodeSpec,
  NodeSpecShape,
  ViewSpec,
} from '../spec';
import type { Box, Point } from './types';
import type { ContainmentTree } from './tree';
import { ancestorChain, nodeType } from './tree';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Default dimensions per shape kind (shared with `fromSpec`). */
export const NODE_DEFAULTS: Record<
  NodeSpecShape,
  { width: number; height: number }
> = {
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
  note: { width: 140, height: 70 },
};

export const GROUP_DEFAULT_PADDING = 24;
export const GROUP_HEADER_HEIGHT = 28;
export const COLLAPSED_GROUP_SIZE = { width: 160, height: 48 };
export const EMPTY_GROUP_SIZE = { width: 160, height: 100 };
export const ROOT_DEFAULT_SPACING = 60;
export const GROUP_DEFAULT_SPACING = 24;
export const VIEW_MARGIN = 40;
/** Vertical space reserved for the title band when `view.title` is set. */
export const TITLE_BAND_HEIGHT = 64;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GeometryInput {
  /** All non-zone nodes, in declaration order. */
  nodes: NodeSpec[];
  edges: EdgeSpec[];
  tree: ContainmentTree;
  view: ViewSpec;
  /** Effective shape per node (kind tokens can change the shape). */
  shapeOf: (n: NodeSpec) => NodeSpecShape;
  /** True when the node renders as a collapsed group summary. */
  isCollapsed: (n: NodeSpec) => boolean;
}

/**
 * Resolve absolute centre positions and sizes for every node.
 * Returns boxes keyed by node id (centre-based).
 */
export function resolveGeometry(input: GeometryInput): Map<string, Box> {
  const { tree, view } = input;

  const sizes = computeSizes(input);
  const boxes = new Map<string, Box>();

  // ── Root scope ──────────────────────────────────────────────────────────
  const rootScope = layoutScope(input, tree.roots, sizes, {
    engine: effectiveEngine(
      view.layout,
      tree.roots,
      liftedEdges(input, tree.roots),
      'root'
    ),
    direction: view.direction ?? 'TB',
    spacing: view.spacing ?? ROOT_DEFAULT_SPACING,
  });

  // Pinned roots use absolute coordinates; engine-laid roots are centred as a
  // block inside the content area (below the title band when present).
  const unpinned = tree.roots.filter((n) => !isPinned(n));
  const titleOffset = view.title ? TITLE_BAND_HEIGHT : 0;

  let blockOrigin: Point = { x: VIEW_MARGIN, y: titleOffset + VIEW_MARGIN };
  if (unpinned.length > 0) {
    const bbox = bboxOf(unpinned.map((n) => localBoxOf(n, rootScope, sizes)));
    const availW = view.width - 2 * VIEW_MARGIN;
    const availH = view.height - titleOffset - 2 * VIEW_MARGIN;
    blockOrigin = {
      x: VIEW_MARGIN + Math.max(0, (availW - bbox.w) / 2) - bbox.minX,
      y:
        titleOffset +
        VIEW_MARGIN +
        Math.max(0, (availH - bbox.h) / 2) -
        bbox.minY,
    };
  }

  for (const n of tree.roots) {
    const size = sizes.get(n.id)!;
    if (isPinned(n)) {
      boxes.set(n.id, { x: n.x!, y: n.y!, ...size });
    } else {
      const local = rootScope.get(n.id)!;
      boxes.set(n.id, {
        x: blockOrigin.x + local.x + size.width / 2,
        y: blockOrigin.y + local.y + size.height / 2,
        ...size,
      });
    }
  }

  // ── Recurse into groups (top-down) ──────────────────────────────────────
  const placeChildren = (group: NodeSpec): void => {
    const children = tree.childrenOf.get(group.id) ?? [];
    if (children.length === 0) return;

    const groupBox = boxes.get(group.id)!;
    const meta = groupMeta(group, input);
    const scope = layoutScope(input, children, sizes, {
      engine: effectiveEngine(
        group.layout,
        children,
        liftedEdges(input, children),
        'group'
      ),
      direction: group.direction ?? 'TB',
      spacing: group.spacing ?? GROUP_DEFAULT_SPACING,
    });

    // The group hugs the children's bbox; map local space into the content box.
    const bbox = bboxOf(children.map((n) => localBoxOf(n, scope, sizes)));
    const contentOrigin: Point = {
      x: groupBox.x - groupBox.width / 2 + meta.padding,
      y: groupBox.y - groupBox.height / 2 + meta.padding + meta.headerHeight,
    };

    for (const child of children) {
      const size = sizes.get(child.id)!;
      const local = localBoxOf(child, scope, sizes);
      boxes.set(child.id, {
        x: contentOrigin.x + (local.x - bbox.minX) + size.width / 2,
        y: contentOrigin.y + (local.y - bbox.minY) + size.height / 2,
        ...size,
      });
      if (nodeType(child) === 'group') placeChildren(child);
    }
  };

  for (const n of tree.roots) {
    if (nodeType(n) === 'group') placeChildren(n);
  }

  return boxes;
}

/** Resolved header/padding metadata for a group. */
export function groupMeta(
  n: NodeSpec,
  input: Pick<GeometryInput, 'isCollapsed'>
): { padding: number; headerHeight: number } {
  if (input.isCollapsed(n)) return { padding: 0, headerHeight: 0 };
  const placement = n.labelPlacement ?? 'top';
  const hasHeader = n.label !== undefined && placement !== 'center';
  return {
    padding: n.padding ?? GROUP_DEFAULT_PADDING,
    headerHeight: hasHeader ? GROUP_HEADER_HEIGHT : 0,
  };
}

// ---------------------------------------------------------------------------
// Sizing (bottom-up)
// ---------------------------------------------------------------------------

function computeSizes(
  input: GeometryInput
): Map<string, { width: number; height: number }> {
  const { tree } = input;
  const sizes = new Map<string, { width: number; height: number }>();

  const sizeOf = (n: NodeSpec): { width: number; height: number } => {
    const cached = sizes.get(n.id);
    if (cached) return cached;

    let size: { width: number; height: number };

    if (nodeType(n) === 'group') {
      size = groupSize(n);
    } else {
      const defaults = NODE_DEFAULTS[input.shapeOf(n)];
      size = {
        width: n.width ?? defaults.width,
        height: n.height ?? defaults.height,
      };
    }

    sizes.set(n.id, size);
    return size;
  };

  const groupSize = (n: NodeSpec): { width: number; height: number } => {
    if (input.isCollapsed(n)) {
      return {
        width: n.width ?? COLLAPSED_GROUP_SIZE.width,
        height: n.height ?? COLLAPSED_GROUP_SIZE.height,
      };
    }

    const children = tree.childrenOf.get(n.id) ?? [];
    if (children.length === 0) {
      return {
        width: n.width ?? EMPTY_GROUP_SIZE.width,
        height: n.height ?? EMPTY_GROUP_SIZE.height,
      };
    }

    for (const child of children) sizeOf(child);

    const scope = layoutScope(input, children, sizes, {
      engine: effectiveEngine(
        n.layout,
        children,
        liftedEdges(input, children),
        'group'
      ),
      direction: n.direction ?? 'TB',
      spacing: n.spacing ?? GROUP_DEFAULT_SPACING,
    });

    const bbox = bboxOf(children.map((c) => localBoxOf(c, scope, sizes)));
    const meta = groupMeta(n, input);

    // Reserve enough header width for the label text (rough estimate).
    const labelText = Array.isArray(n.label) ? n.label.join(' ') : n.label;
    const labelMinWidth = labelText ? labelText.length * 7.5 + 32 : 0;

    return {
      width: n.width ?? Math.max(bbox.w + 2 * meta.padding, labelMinWidth, 80),
      height: n.height ?? bbox.h + 2 * meta.padding + meta.headerHeight,
    };
  };

  // Post-order traversal is implicit: groupSize recurses into children first.
  for (const n of input.nodes) sizeOf(n);

  return sizes;
}

// ---------------------------------------------------------------------------
// Scope layout engines
// ---------------------------------------------------------------------------

interface ScopeOptions {
  engine: LayoutEngineSpec;
  direction: LayoutDirectionSpec;
  spacing: number;
}

/** Local top-left positions per node id, in scope-local coordinates. */
type ScopePositions = Map<string, Point>;

function isPinned(n: NodeSpec): boolean {
  return n.x !== undefined && n.y !== undefined;
}

/** Top-left local box of a node, honouring pinned coordinates (centre-based). */
function localBoxOf(
  n: NodeSpec,
  scope: ScopePositions,
  sizes: Map<string, { width: number; height: number }>
): Box & { x: number; y: number } {
  const size = sizes.get(n.id)!;
  if (isPinned(n)) {
    return {
      x: n.x! - size.width / 2,
      y: n.y! - size.height / 2,
      ...size,
    };
  }
  const local = scope.get(n.id)!;
  return { x: local.x, y: local.y, ...size };
}

function bboxOf(boxes: Array<Box>): {
  minX: number;
  minY: number;
  w: number;
  h: number;
} {
  if (boxes.length === 0) return { minX: 0, minY: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { minX, minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Pick the effective engine for a scope.
 *
 * Explicit `layout` wins. Otherwise: all-pinned scopes stay `'manual'`
 * (backward compatible); scopes with edges between members use `'layered'`;
 * remaining scopes use `'stack'` inside groups and `'grid'` at the root.
 */
function effectiveEngine(
  explicit: LayoutEngineSpec | undefined,
  members: NodeSpec[],
  edges: Array<[string, string]>,
  scopeKind: 'root' | 'group'
): LayoutEngineSpec {
  if (explicit) return explicit;
  if (members.every(isPinned)) return 'manual';
  if (edges.length > 0) return 'layered';
  return scopeKind === 'group' ? 'stack' : 'grid';
}

/**
 * Lift spec edges into a scope: an edge between descendants of two different
 * scope members becomes a dependency between those members.
 */
function liftedEdges(
  input: Pick<GeometryInput, 'edges' | 'tree'>,
  members: NodeSpec[]
): Array<[string, string]> {
  const memberIds = new Set(members.map((m) => m.id));

  const repOf = (id: string): string | undefined => {
    if (memberIds.has(id)) return id;
    for (const anc of ancestorChain(id, input.tree.parentOf)) {
      if (memberIds.has(anc)) return anc;
    }
    return undefined;
  };

  const seen = new Set<string>();
  const out: Array<[string, string]> = [];
  for (const e of input.edges) {
    const from = repOf(stripPortRef(e.from));
    const to = repOf(stripPortRef(e.to));
    if (!from || !to || from === to) continue;
    const key = `${from} ${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([from, to]);
  }
  return out;
}

/** Remove a `.port` suffix from an edge endpoint reference (best effort). */
export function stripPortRef(ref: string): string {
  const idx = ref.lastIndexOf('.');
  return idx > 0 ? ref.slice(0, idx) : ref;
}

/** Run the scope's engine. Positions every member (pins are applied by callers). */
function layoutScope(
  input: GeometryInput,
  members: NodeSpec[],
  sizes: Map<string, { width: number; height: number }>,
  opts: ScopeOptions
): ScopePositions {
  const items = members.map((n) => ({ n, size: sizes.get(n.id)! }));

  switch (opts.engine) {
    case 'stack':
      return stackLayout(items, opts);
    case 'grid':
      return gridLayoutScope(items, opts);
    case 'layered':
      return layeredLayout(items, liftedEdges(input, members), opts);
    case 'manual':
      return manualLayout(items, opts);
  }
}

type Item = { n: NodeSpec; size: { width: number; height: number } };

/** Single row/column, cross-axis centred. */
function stackLayout(items: Item[], opts: ScopeOptions): ScopePositions {
  const out: ScopePositions = new Map();
  const vertical = opts.direction !== 'LR';

  const crossMax = Math.max(
    0,
    ...items.map(({ size }) => (vertical ? size.width : size.height))
  );

  let cursor = 0;
  for (const { n, size } of items) {
    if (vertical) {
      out.set(n.id, { x: (crossMax - size.width) / 2, y: cursor });
      cursor += size.height + opts.spacing;
    } else {
      out.set(n.id, { x: cursor, y: (crossMax - size.height) / 2 });
      cursor += size.width + opts.spacing;
    }
  }
  return out;
}

/** Rows × columns in declaration order; cells sized per row/column max. */
function gridLayoutScope(items: Item[], opts: ScopeOptions): ScopePositions {
  const out: ScopePositions = new Map();
  const n = items.length;
  if (n === 0) return out;

  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.ceil(n / cols);

  const colWidths = new Array<number>(cols).fill(0);
  const rowHeights = new Array<number>(rows).fill(0);
  items.forEach(({ size }, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    colWidths[c] = Math.max(colWidths[c]!, size.width);
    rowHeights[r] = Math.max(rowHeights[r]!, size.height);
  });

  const colX: number[] = [];
  let acc = 0;
  for (let c = 0; c < cols; c++) {
    colX.push(acc);
    acc += colWidths[c]! + opts.spacing;
  }
  const rowY: number[] = [];
  acc = 0;
  for (let r = 0; r < rows; r++) {
    rowY.push(acc);
    acc += rowHeights[r]! + opts.spacing;
  }

  items.forEach(({ n: node, size }, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    out.set(node.id, {
      x: colX[c]! + (colWidths[c]! - size.width) / 2,
      y: rowY[r]! + (rowHeights[r]! - size.height) / 2,
    });
  });
  return out;
}

/**
 * Deterministic layered (DAG) layout.
 *
 * Ranks via Kahn's algorithm with longest-path placement; cycle members are
 * appended after all acyclic nodes, in declaration order. Order within a
 * rank is declaration order.
 */
function layeredLayout(
  items: Item[],
  edges: Array<[string, string]>,
  opts: ScopeOptions
): ScopePositions {
  const out: ScopePositions = new Map();
  if (items.length === 0) return out;

  const ids = items.map(({ n }) => n.id);
  const index = new Map(ids.map((id, i) => [id, i] as const));

  // Adjacency + in-degree over scope members.
  const succ = new Map<string, string[]>(ids.map((id) => [id, []]));
  const inDeg = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const [from, to] of edges) {
    if (!index.has(from) || !index.has(to)) continue;
    succ.get(from)!.push(to);
    inDeg.set(to, (inDeg.get(to) ?? 0) + 1);
  }

  // Kahn longest-path ranking, declaration-order queue for determinism.
  const rank = new Map<string, number>();
  let queue = ids.filter((id) => (inDeg.get(id) ?? 0) === 0);
  queue.forEach((id) => rank.set(id, 0));
  const remaining = new Map(inDeg);
  while (queue.length > 0) {
    const next: string[] = [];
    for (const id of queue) {
      for (const s of succ.get(id) ?? []) {
        rank.set(s, Math.max(rank.get(s) ?? 0, (rank.get(id) ?? 0) + 1));
        const d = (remaining.get(s) ?? 0) - 1;
        remaining.set(s, d);
        if (d === 0) next.push(s);
      }
    }
    next.sort((a, b) => index.get(a)! - index.get(b)!);
    queue = next;
  }

  // Cycle fallback: unranked nodes go one rank past the deepest ranked node.
  const maxRank = Math.max(0, ...rank.values());
  for (const id of ids) {
    if (!rank.has(id)) rank.set(id, maxRank + 1);
  }

  // Bucket by rank, declaration order within rank.
  const rankCount = Math.max(...rank.values()) + 1;
  const buckets: Item[][] = Array.from({ length: rankCount }, () => []);
  for (const item of items) buckets[rank.get(item.n.id)!]!.push(item);

  const vertical = opts.direction === 'TB';

  // Primary axis: cumulative rank extents. Cross axis: per-rank stack,
  // centred against the largest rank block.
  const rankExtent = buckets.map((bucket) =>
    Math.max(
      0,
      ...bucket.map(({ size }) => (vertical ? size.height : size.width))
    )
  );
  const rankCross = buckets.map((bucket) => {
    const total = bucket.reduce(
      (sum, { size }) => sum + (vertical ? size.width : size.height),
      0
    );
    return total + Math.max(0, bucket.length - 1) * opts.spacing;
  });
  const maxCross = Math.max(0, ...rankCross);

  let primary = 0;
  buckets.forEach((bucket, r) => {
    let cross = (maxCross - rankCross[r]!) / 2;
    for (const { n, size } of bucket) {
      if (vertical) {
        // Rank axis = Y. Centre each node within the rank band.
        out.set(n.id, {
          x: cross,
          y: primary + (rankExtent[r]! - size.height) / 2,
        });
        cross += size.width + opts.spacing;
      } else {
        out.set(n.id, {
          x: primary + (rankExtent[r]! - size.width) / 2,
          y: cross,
        });
        cross += size.height + opts.spacing;
      }
    }
    primary += rankExtent[r]! + opts.spacing;
  });

  return out;
}

/**
 * Manual scope: pinned nodes keep their coordinates (applied by callers);
 * unpinned stragglers are laid out in a grid block below the pinned bbox so
 * they remain visible instead of stacking at the origin.
 */
function manualLayout(items: Item[], opts: ScopeOptions): ScopePositions {
  const out: ScopePositions = new Map();

  const pinned = items.filter(({ n }) => isPinned(n));
  const unpinned = items.filter(({ n }) => !isPinned(n));

  for (const { n, size } of pinned) {
    out.set(n.id, { x: n.x! - size.width / 2, y: n.y! - size.height / 2 });
  }

  if (unpinned.length === 0) return out;

  const pinnedBBox = bboxOf(
    pinned.map(({ n, size }) => ({
      x: n.x! - size.width / 2,
      y: n.y! - size.height / 2,
      ...size,
    }))
  );

  const grid = gridLayoutScope(unpinned, opts);
  const offsetY =
    pinned.length > 0 ? pinnedBBox.minY + pinnedBBox.h + opts.spacing : 0;
  const offsetX = pinned.length > 0 ? pinnedBBox.minX : 0;
  for (const [id, p] of grid) {
    out.set(id, { x: p.x + offsetX, y: p.y + offsetY });
  }
  return out;
}
