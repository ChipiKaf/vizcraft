/**
 * Edge ports & boundary-aware routing (FR-3).
 *
 * - Parses `nodeId.port` endpoint references (`n`/`e`/`s`/`w` side aliases
 *   plus named ports).
 * - Adds boundary stub waypoints so edges from nested nodes exit their
 *   containers through the wall instead of cutting diagonally across it.
 * - `routing: 'avoid'` runs a deterministic orthogonal A* that routes around
 *   node/container boxes.
 * - Separates parallel edges between the same node pair.
 */

import type { Box, Point } from './types';

// ---------------------------------------------------------------------------
// Port reference parsing
// ---------------------------------------------------------------------------

const SIDE_ALIASES: Record<string, string> = {
  n: 'top',
  north: 'top',
  top: 'top',
  e: 'right',
  east: 'right',
  right: 'right',
  s: 'bottom',
  south: 'bottom',
  bottom: 'bottom',
  w: 'left',
  west: 'left',
  left: 'left',
};

export interface EndpointRef {
  node: string;
  port?: string;
}

/**
 * Parse an edge endpoint reference that may carry a `.port` suffix.
 *
 * Resolution: if the full string is an existing node id, it is the node
 * (dots in node ids keep working). Otherwise the substring after the last
 * dot is the port: side aliases map to the built-in side ports, anything
 * else is a named port.
 */
export function parseEndpoint(
  ref: string,
  nodeIds: ReadonlySet<string>
): EndpointRef {
  if (nodeIds.has(ref)) return { node: ref };

  const idx = ref.lastIndexOf('.');
  if (idx <= 0) return { node: ref };

  const node = ref.slice(0, idx);
  const suffix = ref.slice(idx + 1);
  if (!nodeIds.has(node)) return { node: ref };

  return { node, port: SIDE_ALIASES[suffix.toLowerCase()] ?? suffix };
}

// ---------------------------------------------------------------------------
// Box helpers
// ---------------------------------------------------------------------------

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function toRect(b: Box, inflate = 0): Rect {
  return {
    left: b.x - b.width / 2 - inflate,
    right: b.x + b.width / 2 + inflate,
    top: b.y - b.height / 2 - inflate,
    bottom: b.y + b.height / 2 + inflate,
  };
}

type Side = 'top' | 'right' | 'bottom' | 'left';

/** Side of `box` facing the target point (dominant axis). */
export function facingSide(box: Box, target: Point): Side {
  const dx = target.x - box.x;
  const dy = target.y - box.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

function sidePoint(box: Box, side: Side, offset = 0): Point {
  switch (side) {
    case 'right':
      return { x: box.x + box.width / 2 + offset, y: box.y };
    case 'left':
      return { x: box.x - box.width / 2 - offset, y: box.y };
    case 'bottom':
      return { x: box.x, y: box.y + box.height / 2 + offset };
    case 'top':
      return { x: box.x, y: box.y - box.height / 2 - offset };
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ---------------------------------------------------------------------------
// Boundary stubs (clean container exits)
// ---------------------------------------------------------------------------

const WALL_CLEARANCE = 12;

/**
 * Waypoints that make an edge exit every container between `fromId` and the
 * lowest common ancestor through the container wall (and enter the target's
 * containers the same way).
 *
 * Returns an empty array when the edge does not cross any group boundary.
 */
export function computeBoundaryStubs(
  fromId: string,
  toId: string,
  boxes: ReadonlyMap<string, Box>,
  parentOf: ReadonlyMap<string, string>
): Point[] {
  const fromChain = exitChain(fromId, toId, parentOf);
  const toChain = exitChain(toId, fromId, parentOf);
  if (fromChain.length === 0 && toChain.length === 0) return [];

  const fromBox = boxes.get(fromId);
  const toBox = boxes.get(toId);
  if (!fromBox || !toBox) return [];

  const target: Point = { x: toBox.x, y: toBox.y };
  const source: Point = { x: fromBox.x, y: fromBox.y };

  // Exit the source's containers, innermost → outermost.
  const exitStubs: Point[] = [];
  let cursor: Point = source;
  for (const containerId of fromChain) {
    const box = boxes.get(containerId);
    if (!box) continue;
    exitStubs.push(wallPoint(box, cursor, target));
    cursor = exitStubs[exitStubs.length - 1]!;
  }

  // Enter the target's containers, computed innermost → outermost then
  // reversed so the edge pierces outer walls first.
  const entryStubs: Point[] = [];
  cursor = target;
  const reference = exitStubs[exitStubs.length - 1] ?? source;
  for (const containerId of toChain) {
    const box = boxes.get(containerId);
    if (!box) continue;
    entryStubs.push(wallPoint(box, cursor, reference));
    cursor = entryStubs[entryStubs.length - 1]!;
  }
  entryStubs.reverse();

  return [...exitStubs, ...entryStubs];
}

/** Ancestor groups of `id` that do NOT contain `other` (innermost first). */
function exitChain(
  id: string,
  other: string,
  parentOf: ReadonlyMap<string, string>
): string[] {
  const otherAncestors = new Set<string>();
  let cur = parentOf.get(other);
  while (cur !== undefined) {
    otherAncestors.add(cur);
    cur = parentOf.get(cur);
  }

  const chain: string[] = [];
  cur = parentOf.get(id);
  while (cur !== undefined) {
    if (otherAncestors.has(cur) || cur === other) break;
    chain.push(cur);
    cur = parentOf.get(cur);
  }
  return chain;
}

/** Point on the wall of `box` where a path from `from` heading to `to` exits. */
function wallPoint(box: Box, from: Point, to: Point): Point {
  const r = toRect(box);
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    const x = dx >= 0 ? r.right : r.left;
    return {
      x,
      y: clamp(from.y, r.top + WALL_CLEARANCE, r.bottom - WALL_CLEARANCE),
    };
  }
  const y = dy >= 0 ? r.bottom : r.top;
  return {
    x: clamp(from.x, r.left + WALL_CLEARANCE, r.right - WALL_CLEARANCE),
    y,
  };
}

// ---------------------------------------------------------------------------
// Obstacle-avoiding orthogonal routing (`routing: 'avoid'`)
// ---------------------------------------------------------------------------

const AVOID_MARGIN = 16;
const TURN_PENALTY = 40;

export interface AvoidInput {
  fromBox: Box;
  toBox: Box;
  /** Boxes to route around (source/target/ancestors already excluded). */
  obstacles: Box[];
}

/**
 * Deterministic orthogonal obstacle-avoiding route.
 *
 * Builds a sparse grid from obstacle bounds (inflated by a margin) and runs
 * A* with a turn penalty. Returns the polyline waypoints (including the
 * side stubs just outside the two nodes), or `null` when no route exists —
 * callers fall back to plain orthogonal routing.
 */
export function routeAvoid(input: AvoidInput): Point[] | null {
  const { fromBox, toBox } = input;

  const fromSide = facingSide(fromBox, { x: toBox.x, y: toBox.y });
  const toSide = facingSide(toBox, { x: fromBox.x, y: fromBox.y });
  const start = sidePoint(fromBox, fromSide, AVOID_MARGIN);
  const goal = sidePoint(toBox, toSide, AVOID_MARGIN);

  const rects = input.obstacles.map((b) => toRect(b, AVOID_MARGIN - 0.5));

  // Sparse grid coordinates from obstacle bounds + endpoints.
  const xsSet = new Set<number>([start.x, goal.x]);
  const ysSet = new Set<number>([start.y, goal.y]);
  for (const b of input.obstacles) {
    const r = toRect(b, AVOID_MARGIN);
    xsSet.add(r.left);
    xsSet.add(r.right);
    ysSet.add(r.top);
    ysSet.add(r.bottom);
  }
  const xs = [...xsSet].sort((a, b) => a - b);
  const ys = [...ysSet].sort((a, b) => a - b);

  const xi = new Map(xs.map((v, i) => [v, i] as const));
  const yi = new Map(ys.map((v, i) => [v, i] as const));

  const blocked = (a: Point, b: Point): boolean => {
    for (const r of rects) {
      if (a.x === b.x) {
        // Vertical segment.
        if (a.x <= r.left || a.x >= r.right) continue;
        const lo = Math.min(a.y, b.y);
        const hi = Math.max(a.y, b.y);
        if (hi > r.top && lo < r.bottom) return true;
      } else {
        // Horizontal segment.
        if (a.y <= r.top || a.y >= r.bottom) continue;
        const lo = Math.min(a.x, b.x);
        const hi = Math.max(a.x, b.x);
        if (hi > r.left && lo < r.right) return true;
      }
    }
    return false;
  };

  type State = {
    x: number;
    y: number;
    cost: number;
    turns: number;
    dir: number; // -1 none, 0 R, 1 D, 2 L, 3 U
    prev: State | null;
  };

  const startState: State = {
    x: start.x,
    y: start.y,
    cost: 0,
    turns: 0,
    dir: -1,
    prev: null,
  };

  const key = (x: number, y: number, dir: number): string =>
    `${xi.get(x)},${yi.get(y)},${dir}`;
  const best = new Map<string, number>();
  best.set(key(start.x, start.y, -1), 0);

  const open: State[] = [startState];
  const h = (x: number, y: number): number =>
    Math.abs(x - goal.x) + Math.abs(y - goal.y);

  // dx/dy index steps per direction: R, D, L, U.
  const DIRS: Array<[number, number, number]> = [
    [1, 0, 0],
    [0, 1, 1],
    [-1, 0, 2],
    [0, -1, 3],
  ];

  let found: State | null = null;
  let guard = 0;
  const GUARD_LIMIT = 50000;

  while (open.length > 0 && guard++ < GUARD_LIMIT) {
    // Deterministic pop: lowest f, then fewest turns, then y, then x.
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      const a = open[i]!;
      const b = open[bestIdx]!;
      const fa = a.cost + h(a.x, a.y);
      const fb = b.cost + h(b.x, b.y);
      if (
        fa < fb ||
        (fa === fb &&
          (a.turns < b.turns ||
            (a.turns === b.turns && (a.y < b.y || (a.y === b.y && a.x < b.x)))))
      ) {
        bestIdx = i;
      }
    }
    const cur = open.splice(bestIdx, 1)[0]!;

    if (cur.x === goal.x && cur.y === goal.y) {
      found = cur;
      break;
    }

    const cxi = xi.get(cur.x)!;
    const cyi = yi.get(cur.y)!;

    for (const [sx, sy, dir] of DIRS) {
      const nxi = cxi + sx;
      const nyi = cyi + sy;
      if (nxi < 0 || nxi >= xs.length || nyi < 0 || nyi >= ys.length) continue;
      const nx = xs[nxi]!;
      const ny = ys[nyi]!;
      if (blocked({ x: cur.x, y: cur.y }, { x: nx, y: ny })) continue;

      const turned = cur.dir !== -1 && cur.dir !== dir ? 1 : 0;
      const cost =
        cur.cost +
        Math.abs(nx - cur.x) +
        Math.abs(ny - cur.y) +
        turned * TURN_PENALTY;
      const k = key(nx, ny, dir);
      const prevBest = best.get(k);
      if (prevBest !== undefined && prevBest <= cost) continue;
      best.set(k, cost);
      open.push({
        x: nx,
        y: ny,
        cost,
        turns: cur.turns + turned,
        dir,
        prev: cur,
      });
    }
  }

  if (!found) return null;

  // Reconstruct and compress collinear runs.
  const raw: Point[] = [];
  for (let s: State | null = found; s; s = s.prev) {
    raw.unshift({ x: s.x, y: s.y });
  }
  const compressed: Point[] = [];
  for (let i = 0; i < raw.length; i++) {
    const prev = compressed[compressed.length - 1];
    const next = raw[i + 1];
    const cur = raw[i]!;
    if (
      prev &&
      next &&
      ((prev.x === cur.x && cur.x === next.x) ||
        (prev.y === cur.y && cur.y === next.y))
    ) {
      continue; // Collinear interior point.
    }
    compressed.push(cur);
  }

  return compressed;
}

// ---------------------------------------------------------------------------
// Parallel edge separation
// ---------------------------------------------------------------------------

const PARALLEL_ANGLE_STEP = 12;
const PARALLEL_OFFSET_STEP = 16;

export interface ParallelAdjustment {
  fromAngle?: number;
  toAngle?: number;
  waypoint?: Point;
}

/**
 * Compute separation adjustments for `count` parallel edges between the same
 * node pair. `index` is the edge's position (0-based, declaration order).
 *
 * Straight/curved edges fan out via perimeter angles; orthogonal edges get a
 * perpendicular mid waypoint so the elbows do not overlap.
 */
export function separateParallelEdge(
  fromBox: Box,
  toBox: Box,
  index: number,
  count: number,
  routing: 'straight' | 'curved' | 'orthogonal',
  reversed: boolean
): ParallelAdjustment {
  if (count < 2) return {};

  const spread = index - (count - 1) / 2;
  const dx = toBox.x - fromBox.x;
  const dy = toBox.y - fromBox.y;

  if (routing === 'orthogonal') {
    const mid: Point = {
      x: (fromBox.x + toBox.x) / 2,
      y: (fromBox.y + toBox.y) / 2,
    };
    if (Math.abs(dx) >= Math.abs(dy)) {
      return {
        waypoint: { x: mid.x, y: mid.y + spread * PARALLEL_OFFSET_STEP },
      };
    }
    return { waypoint: { x: mid.x + spread * PARALLEL_OFFSET_STEP, y: mid.y } };
  }

  const theta = (Math.atan2(dy, dx) * 180) / Math.PI;
  // Reversed edges (B→A in an A↔B pair) mirror the offset so the two
  // directions do not overlap.
  const delta = spread * PARALLEL_ANGLE_STEP * (reversed ? -1 : 1);
  return {
    fromAngle: theta + delta,
    toAngle: theta + 180 - delta,
  };
}

/**
 * Group edges by unordered endpoint pair. Returns for each edge its index
 * within the pair (declaration order) and the pair size.
 */
export function parallelGroups(
  edges: Array<{ from: string; to: string }>
): Array<{ index: number; count: number; reversed: boolean }> {
  const counts = new Map<string, number>();
  const keys: string[] = [];
  const reversedFlags: boolean[] = [];

  for (const e of edges) {
    const reversed = e.from > e.to;
    const key = reversed ? `${e.to} ${e.from}` : `${e.from} ${e.to}`;
    keys.push(key);
    reversedFlags.push(reversed);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const cursor = new Map<string, number>();
  return edges.map((_, i) => {
    const key = keys[i]!;
    const index = cursor.get(key) ?? 0;
    cursor.set(key, index + 1);
    return { index, count: counts.get(key) ?? 1, reversed: reversedFlags[i]! };
  });
}
