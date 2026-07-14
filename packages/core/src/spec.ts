/**
 * Declarative spec types for `fromSpec`.
 *
 * These are the user-facing input types. They use plain JSON-serialisable
 * shapes and are intentionally separate from the internal `VizScene` /
 * `NodeShape` discriminated unions so that the spec remains schema-
 * validatable and LLM-generatable.
 */

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

/**
 * String-based shape selector for `NodeSpec`.
 *
 * Uses lowercase shape names rather than the internal discriminated-union
 * `NodeShape` (which carries geometry parameters inline). Shape geometry is
 * driven by `NodeSpec.width` / `NodeSpec.height` with per-shape defaults.
 */
export type NodeSpecShape =
  | 'rect'
  | 'circle'
  | 'diamond'
  | 'cylinder'
  | 'hexagon'
  | 'ellipse'
  | 'cloud'
  | 'document'
  | 'parallelogram'
  | 'triangle'
  | 'note';

/**
 * Structural role of a node.
 *
 * - `'node'`  — a regular leaf node (default).
 * - `'group'` — a container frame that **owns** children (via `parent` on the
 *   children). Auto-sizes to hug its children plus `padding` unless `width` /
 *   `height` are pinned. Groups nest recursively.
 * - `'zone'`  — a non-owning logical region (dashed/tinted). Encloses members
 *   visually without re-parenting them. Membership is explicit (`zone: <id>`
 *   on member nodes) or geometric (pinned bounds).
 * - `'note'`  — a sticky-note annotation. Can be anchored to a node via
 *   `anchor`, which also draws a dashed leader line.
 */
export type NodeTypeSpec = 'node' | 'group' | 'zone' | 'note';

/**
 * Where a container's label is rendered.
 *
 * - `'top'`      — centred inside a header strip (default for groups).
 * - `'top-left'` — left-aligned in the header strip / corner (default for zones).
 * - `'center'`   — centred in the shape (default for regular nodes).
 */
export type LabelPlacementSpec = 'top' | 'top-left' | 'center';

/**
 * Deterministic auto-layout engine for a scope (the view or a group).
 *
 * - `'layered'` — rank-based DAG layout following edge direction (à la dagre).
 * - `'grid'`    — rows × columns in declaration order.
 * - `'stack'`   — single row or column (see `direction`).
 * - `'manual'`  — today's behaviour: every node uses its own `x` / `y`.
 */
export type LayoutEngineSpec = 'layered' | 'grid' | 'stack' | 'manual';

/** Primary direction for auto-layout engines. `'TB'` = top→bottom, `'LR'` = left→right. */
export type LayoutDirectionSpec = 'TB' | 'LR';

/** A named connection port declared on a `NodeSpec` (offsets from node centre). */
export interface NodePortSpec {
  /** Port id, referenced from edges as `nodeId.portId`. */
  id: string;
  /** X offset from the node centre. */
  x: number;
  /** Y offset from the node centre. */
  y: number;
  /** Optional outgoing tangent angle in degrees (0 = right, 90 = down). */
  direction?: number;
}

export interface NodeSpec {
  /** Unique identifier for the node. Referenced by edges, overlays, and signals. */
  id: string;

  /** Display label. Pass an array of strings for a multi-line label. */
  label?: string | string[];

  /** Shape type. Defaults to `'rect'`. */
  shape?: NodeSpecShape;

  /**
   * Structural role: regular `'node'` (default), owning `'group'`,
   * non-owning `'zone'`, or annotation `'note'`.
   */
  type?: NodeTypeSpec;

  /**
   * Id of the parent group. Makes this node a child of that group: it is
   * positioned inside the group's content area and moves with the group.
   */
  parent?: string;

  /**
   * Absolute X position of the node centre in scene coordinates.
   *
   * Optional since auto-layout (FR-4): omit to let the scope's layout engine
   * place the node. Hand-placed coordinates always win over auto-layout.
   * For children of a group, pinned coordinates are relative to the group's
   * content origin (top-left, inside padding/header).
   */
  x?: number;

  /** Absolute Y position of the node centre. See `x` for auto-layout rules. */
  y?: number;

  /**
   * Width in scene units.
   * For `'circle'` this is treated as diameter; the radius is derived
   * automatically. Shape-specific defaults apply when omitted.
   */
  width?: number;

  /**
   * Height in scene units.
   * Ignored for `'circle'` and `'hexagon'` (single-axis shapes).
   * Shape-specific defaults apply when omitted.
   */
  height?: number;

  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;

  /** Render the node border as a dashed stroke. */
  dashed?: boolean;

  /** Render the node border as a dotted stroke. */
  dotted?: boolean;

  /**
   * Border style shorthand (alternative to `dashed` / `dotted` booleans).
   * Useful for LLM-generated specs: `style: 'dashed'`.
   */
  style?: 'solid' | 'dashed' | 'dotted';

  /** Highlight ring colour. Draws a coloured border pulse around the node. */
  highlight?: string;

  /** CSS class added to the node's root SVG element. */
  class?: string;

  tooltip?: {
    title: string;
    sections?: Array<{ label: string; value: string }>;
  };

  // --- Containers (FR-1) ---

  /**
   * Inner padding for `'group'` / `'zone'` nodes, in scene units.
   * Default: 24.
   */
  padding?: number;

  /** Label placement. Defaults: `'top'` for groups, `'top-left'` for zones, `'center'` otherwise. */
  labelPlacement?: LabelPlacementSpec;

  // --- Auto-layout (FR-4, groups only) ---

  /**
   * Layout engine for this group's direct children.
   * Defaults to `'manual'` when every child is pinned, otherwise `'stack'`
   * (or `'layered'` when edges exist between the children).
   */
  layout?: LayoutEngineSpec;

  /** Primary direction for this group's layout engine. Default: `'TB'`. */
  direction?: LayoutDirectionSpec;

  /** Gap between siblings for this group's layout engine. Default: 24. */
  spacing?: number;

  // --- Zones (FR-2) ---

  /**
   * Explicit zone membership: id of a `type: 'zone'` node this node belongs
   * to. The zone auto-sizes to enclose all of its members.
   */
  zone?: string;

  // --- Semantic kinds (FR-5) ---

  /**
   * Semantic kind mapped to a built-in visual token (fill, stroke, shape).
   * Built-ins: `'service'`, `'datastore'`, `'external'`, `'queue'`, `'ui'`.
   * Extend or override via `VizSpec.theme.nodeKinds`.
   */
  kind?: string;

  // --- Notes (FR-6) ---

  /**
   * For `type: 'note'`: id of the node this note points at. The note is
   * placed beside the anchor (unless pinned) and a dashed leader line is drawn.
   */
  anchor?: string;

  // --- Ports (FR-3) ---

  /** Named connection ports (offsets from the node centre). */
  ports?: NodePortSpec[];

  // --- Collapse (FR-7, groups only) ---

  /**
   * Initial collapsed state for a `'group'`. A collapsed group renders as a
   * single summary node with a child-count badge; edges to hidden descendants
   * re-terminate on the group. Clicking the group toggles the state.
   */
  collapsed?: boolean;
}

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

export type EdgeStyleSpec = 'straight' | 'curved' | 'orthogonal';

export type EdgeAnimateSpec = 'flow' | false;

export type ArrowModeSpec = 'end' | 'start' | 'both' | false;

/**
 * Extra routing behaviour on top of the path style.
 *
 * - `'auto'`  — default: boundary-aware stubs are added when the edge crosses
 *   a group wall, nothing else.
 * - `'avoid'` — orthogonal obstacle avoidance: the edge routes **around**
 *   other nodes and containers instead of through them.
 */
export type EdgeRoutingSpec = 'auto' | 'avoid';

/** Marker names accepted by `EdgeKindToken`. Mirrors the core `EdgeMarkerType`. */
export type EdgeMarkerSpec =
  | 'none'
  | 'arrow'
  | 'arrowOpen'
  | 'diamond'
  | 'diamondOpen'
  | 'circle'
  | 'circleOpen'
  | 'square'
  | 'bar'
  | 'halfArrow';

export interface EdgeSpec {
  /**
   * Source node id. May carry a port suffix: `'node.e'` attaches to the
   * east/right side; `n` / `e` / `s` / `w` (and `top` / `right` / `bottom` /
   * `left`) map to the built-in side ports, any other suffix resolves to a
   * named port declared in `NodeSpec.ports`.
   */
  from: string;

  /** Target node id. Accepts the same `nodeId.port` syntax as `from`. */
  to: string;

  /**
   * Optional explicit id for later lookup or overlay anchoring.
   * Defaults to `'${from}-${to}'` when omitted.
   */
  id?: string;

  label?: string;

  /** Edge routing style. Default: `'straight'`. */
  style?: EdgeStyleSpec;

  /** Extra routing behaviour: `'auto'` (default) or `'avoid'` (route around obstacles). */
  routing?: EdgeRoutingSpec;

  /** Port id on the source node (alternative to the `'node.port'` suffix syntax). */
  fromPort?: string;

  /** Port id on the target node (alternative to the `'node.port'` suffix syntax). */
  toPort?: string;

  /**
   * Semantic kind mapped to a built-in visual token (colour, dash, marker).
   * Built-ins: `'sync'`, `'async'`, `'data'`, `'contains'`, `'contributes-to'`,
   * `'event'`. Extend or override via `VizSpec.theme.edgeKinds`.
   */
  kind?: string;

  /** Arrow head placement. Default: `'end'`. */
  arrow?: ArrowModeSpec;

  /** Apply a CSS flow animation (marching-ants stroke) to the edge. */
  animate?: EdgeAnimateSpec;

  stroke?: string;
  strokeWidth?: number;
  dashed?: boolean;
  dotted?: boolean;
  opacity?: number;

  /** CSS class added to the edge's root SVG element. */
  class?: string;
}

// ---------------------------------------------------------------------------
// Semantic kind tokens & theme (FR-5)
// ---------------------------------------------------------------------------

/** Visual token applied to edges of a given `kind`. */
export interface EdgeKindToken {
  stroke?: string;
  strokeWidth?: number;
  /** `'solid'`, `'dashed'`, `'dotted'`, `'dash-dot'`, or a raw SVG dasharray. */
  dash?: string;
  markerEnd?: EdgeMarkerSpec;
  markerStart?: EdgeMarkerSpec;
  /** Default animation for edges of this kind. */
  animate?: EdgeAnimateSpec;
  opacity?: number;
  /** Human-readable name shown in an auto legend. Defaults to the kind id. */
  legendLabel?: string;
}

/** Visual token applied to nodes of a given `kind`. */
export interface NodeKindToken {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /** `'solid'`, `'dashed'`, `'dotted'`, or a raw SVG dasharray. */
  dash?: string;
  shape?: NodeSpecShape;
  opacity?: number;
  /** Human-readable name shown in an auto legend. Defaults to the kind id. */
  legendLabel?: string;
}

/**
 * Diagram-level token overrides. Merged over the built-in palette so a
 * diagram is recolourable in one place. Unknown kind names define new kinds.
 */
export interface VizThemeSpec {
  edgeKinds?: Record<string, EdgeKindToken>;
  nodeKinds?: Record<string, NodeKindToken>;
}

// ---------------------------------------------------------------------------
// Legend (FR-6)
// ---------------------------------------------------------------------------

/** One manually-specified legend row. */
export interface LegendEntrySpec {
  /** Text shown next to the swatch. */
  label: string;
  /** Swatch colour. Defaults to the kind's token colour when `kind` is set. */
  swatch?: string;
  /** Kind id to pull the swatch style from. */
  kind?: string;
}

/** Corner of the view the legend is pinned to. */
export type LegendPositionSpec =
  | 'bottom-left'
  | 'bottom-right'
  | 'top-left'
  | 'top-right';

/**
 * Legend configuration.
 *
 * - `'auto'` — one row per node/edge `kind` actually used in the spec.
 * - `LegendEntrySpec[]` — explicit rows.
 * - object form — `entries` (or auto when omitted) plus a `position`.
 */
export type LegendSpec =
  | 'auto'
  | LegendEntrySpec[]
  | {
      entries?: LegendEntrySpec[];
      position?: LegendPositionSpec;
      title?: string;
    };

// ---------------------------------------------------------------------------
// Static overlays
// ---------------------------------------------------------------------------

/**
 * Shared positioning fields for all static overlay types.
 *
 * - When `nodeId` is present, `x`/`y` are treated as offsets from the node
 *   centre rather than absolute scene coordinates.
 * - When `nodeId` is absent, `x` and `y` are absolute scene coordinates.
 */
interface StaticOverlayPositionFields {
  key?: string;
  nodeId?: string;
  x?: number;
  y?: number;
  opacity?: number;
}

/**
 * Discriminated union of overlay shapes accepted by `fromSpec`.
 * Discriminated on the `type` field.
 */
export type StaticOverlaySpec =
  | (StaticOverlayPositionFields & {
      type: 'rect';
      /** Width of the rectangle in scene units. */
      width: number;
      /** Height of the rectangle in scene units. */
      height: number;
      rx?: number;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
    })
  | (StaticOverlayPositionFields & {
      type: 'circle';
      r: number;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
    })
  | (StaticOverlayPositionFields & {
      type: 'text';
      text: string;
      fill?: string;
      fontSize?: number;
      fontWeight?: string;
      textAnchor?: 'start' | 'middle' | 'end';
    });

// ---------------------------------------------------------------------------
// Auto-signals (shared with internal-signal-animation feature)
// ---------------------------------------------------------------------------

/**
 * Declarative self-animating signal spec.
 *
 * Used both in `VizSpec.autoSignals` and (when the internal animator is
 * available) in `VizBuilder.autoSignal()`. Ignored silently at build time
 * when the internal animator has not been initialised.
 */
export interface AutoSignalSpec {
  /** Unique id. Must be stable across re-renders to prevent flicker. */
  id: string;

  /**
   * Ordered list of node ids defining the travel path.
   * e.g. `['a', 'b', 'c']` means animate a→b then b→c.
   * Minimum 2 entries.
   */
  chain: string[];

  /** Duration for each individual hop in milliseconds. Default: 800. */
  durationPerHop?: number;

  /**
   * Alternative to `durationPerHop`: total time across all hops combined.
   * `durationPerHop` takes precedence when both are provided.
   */
  totalDuration?: number;

  /** Restart from the beginning after reaching the final node. Default: false. */
  loop?: boolean;

  /** Pause duration in ms before restarting when `loop: true`. Default: 0. */
  loopDelay?: number;

  /** Leave the signal dot parked at the final node after the animation completes. Default: false. */
  keepFinal?: boolean;

  color?: string;
  glowColor?: string;

  /** Visual scale of the signal dot, 0–1. Default: 1. */
  magnitude?: number;
}

// ---------------------------------------------------------------------------
// Step spec (stub — wired by step-controller feature)
// ---------------------------------------------------------------------------

/**
 * One step in a `VizSpec.steps` walkthrough.
 *
 * Only takes effect when the spec is mounted via a `StepController`
 * (see step-controller feature). Silently ignored otherwise.
 */
export interface VizStepSpec {
  /** Descriptive label shown by the step bar or consumed by `onStepChange`. */
  label: string;

  /** Node ids to visually highlight on this step. */
  highlight?: string[];

  /** Overlay specs added on top of the base scene for this step. */
  overlays?: StaticOverlaySpec[];

  /** Signals to animate when this step is activated. */
  signals?: AutoSignalSpec[];

  /**
   * When true, the controller automatically advances to the next step
   * after all non-looping signals complete. Default: false.
   */
  autoAdvance?: boolean;
}

// ---------------------------------------------------------------------------
// Top-level VizSpec
// ---------------------------------------------------------------------------

/**
 * Declarative, JSON-serialisable description of a VizCraft scene.
 *
 * Pass to `fromSpec(spec)` to get a fully hydrated `VizBuilder` that you
 * can chain, mount, or build as normal.
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
/** Viewport configuration for a spec. */
export interface ViewSpec {
  width: number;
  height: number;

  /** Title rendered in a fixed header band at the top of the view. */
  title?: string;

  /** Subtitle rendered below the title. */
  subtitle?: string;

  /**
   * Auto-layout engine for root-level nodes (FR-4).
   * Defaults to `'manual'` when every root node is pinned; otherwise
   * `'layered'` when edges exist, else `'grid'`.
   */
  layout?: LayoutEngineSpec;

  /** Primary direction for the root layout engine. Default: `'TB'`. */
  direction?: LayoutDirectionSpec;

  /** Gap between root-level nodes for auto-layout. Default: 60. */
  spacing?: number;
}

export interface VizSpec {
  /** Viewport dimensions and optional title/auto-layout configuration. */
  view: ViewSpec;

  /** Scene nodes. At least one node is strongly recommended. */
  nodes: NodeSpec[];

  /** Edges between nodes. */
  edges?: EdgeSpec[];

  /**
   * Static overlay shapes (rect / circle / text) rendered on top of the scene.
   * Position can be absolute or node-relative.
   */
  overlays?: StaticOverlaySpec[];

  /**
   * Self-animating signal declarations.
   *
   * Only takes effect when the spec is mounted via a controller that supports
   * the internal animator (see `VizBuilder.autoSignal` and
   * `internal-signal-animation` feature). Silently ignored otherwise.
   */
  autoSignals?: AutoSignalSpec[];

  /**
   * Step-through walkthrough declarations.
   *
   * Only takes effect when mounted via a `StepController` (see step-controller
   * feature). Silently ignored otherwise.
   */
  steps?: VizStepSpec[];

  /**
   * Semantic kind token overrides (FR-5). Merged over the built-in palette
   * so all colours are driven from one place.
   */
  theme?: VizThemeSpec;

  /**
   * Legend block (FR-6). `'auto'` derives one row per node/edge kind used
   * in the spec; pass explicit entries or an object for full control.
   */
  legend?: LegendSpec;

  /**
   * Focus mode (FR-7): id of a node or group. Everything not connected to it
   * (the node, its descendants/ancestors, and direct edge neighbours) is
   * dimmed so a reader can trace one path.
   */
  focus?: string;
}
