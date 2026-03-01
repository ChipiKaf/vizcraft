export type Vec2 = { x: number; y: number };

import type { AnimationSpec } from './anim/spec';
import type { VizBuilder } from './builder';

export type NodeShape =
  | { kind: 'circle'; r: number }
  | { kind: 'rect'; w: number; h: number; rx?: number }
  | { kind: 'diamond'; w: number; h: number }
  | { kind: 'cylinder'; w: number; h: number; arcHeight?: number }
  | { kind: 'hexagon'; r: number; orientation?: 'pointy' | 'flat' }
  | { kind: 'ellipse'; rx: number; ry: number }
  | {
      kind: 'arc';
      r: number;
      startAngle: number;
      endAngle: number;
      closed?: boolean;
    }
  | {
      kind: 'blockArrow';
      length: number;
      bodyWidth: number;
      headWidth: number;
      headLength: number;
      direction?: 'right' | 'left' | 'up' | 'down';
    }
  | {
      kind: 'callout';
      w: number;
      h: number;
      rx?: number;
      pointerSide?: 'bottom' | 'top' | 'left' | 'right';
      pointerHeight?: number;
      pointerWidth?: number;
      pointerPosition?: number;
    }
  | { kind: 'cloud'; w: number; h: number }
  | { kind: 'cross'; size: number; barWidth?: number }
  | { kind: 'cube'; w: number; h: number; depth?: number }
  | { kind: 'path'; d: string; w: number; h: number }
  | { kind: 'document'; w: number; h: number; waveHeight?: number }
  | { kind: 'note'; w: number; h: number; foldSize?: number }
  | { kind: 'parallelogram'; w: number; h: number; skew?: number }
  | { kind: 'star'; points: number; outerR: number; innerR?: number }
  | { kind: 'trapezoid'; topW: number; bottomW: number; h: number }
  | {
      kind: 'triangle';
      w: number;
      h: number;
      direction?: 'up' | 'down' | 'left' | 'right';
    }
  | {
      kind: 'image';
      href: string;
      w: number;
      h: number;
      preserveAspectRatio?: string;
    }
  | {
      kind: 'icon';
      id: string;
      size: number;
      color?: string;
      w: number;
      h: number;
    }
  | {
      kind: 'svg';
      content: string;
      w: number;
      h: number;
    };

export type NodeMediaPosition = 'center' | 'above' | 'below' | 'left' | 'right';

export interface VizNodeImage {
  href: string;
  width: number;
  height: number;
  dx?: number;
  dy?: number;
  position?: NodeMediaPosition;
  preserveAspectRatio?: string;
}

export interface VizNodeIcon {
  id: string;
  size: number;
  color?: string;
  dx?: number;
  dy?: number;
  position?: NodeMediaPosition;
}

export interface VizNodeSvgContent {
  content: string;
  width: number;
  height: number;
  dx?: number;
  dy?: number;
  position?: NodeMediaPosition;
}

export type RichTextToken =
  | {
      kind: 'span';
      text: string;
      /** Render span in bold. */
      bold?: boolean;
      /** Render span in italics. */
      italic?: boolean;
      /** Underline the span. */
      underline?: boolean;
      /** Render span in a monospace font-family. */
      code?: boolean;
      /** Optional link target. Rendered as an SVG <a> wrapper. */
      href?: string;
      /** Span-level style overrides (optional). */
      fill?: string;
      fontSize?: number | string;
      fontWeight?: number | string;
      fontFamily?: string;
      /** Baseline shift for sub/superscript. */
      baselineShift?: 'sub' | 'super';
      className?: string;
    }
  | { kind: 'newline' };

/**
 * Rich label content, rendered as an SVG <text> with nested <tspan> elements.
 *
 * Note: Rich labels currently support explicit newlines via `{ kind: 'newline' }`.
 * Automatic `maxWidth` word-wrapping is only supported for plain string labels.
 */
export type RichText = {
  kind: 'rich';
  tokens: RichTextToken[];
};

export type NodeLabel = {
  text: string;
  /** Optional rich content. When set, this is rendered instead of `text`. */
  rich?: RichText;
  dx?: number;
  dy?: number;
  className?: string;
  fill?: string;
  fontSize?: number | string;
  fontWeight?: number | string;
  textAnchor?: 'start' | 'middle' | 'end';
  dominantBaseline?: string;
  /** Maximum width for text wrapping (in px). If set, text wraps within this width. */
  maxWidth?: number;
  /** Line height multiplier (default: 1.2) */
  lineHeight?: number;
  /** Vertical alignment within the bounding box */
  verticalAlign?: 'top' | 'middle' | 'bottom';
  /** Text overflow behavior */
  overflow?: 'visible' | 'ellipsis' | 'clip';
};

export type AnimationDuration = `${number}s`;

export interface AnimationConfig {
  duration?: AnimationDuration;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

// Generic animation specification (request)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface VizAnimSpec<T = any> {
  id: string; // e.g. "flow"
  params?: T;
  when?: boolean; // Condition gate
}

export type VizRuntimeNodeProps = Partial<{
  x: number;
  y: number;
  opacity: number;
  scale: number;
  rotation: number;
  width: number;
  height: number;
  radius: number;
}>;

export type VizRuntimeEdgeProps = Partial<{
  strokeDashoffset: number;
  opacity: number;
}>;

export interface SvgExportOptions {
  /**
   * When true, include current runtime overrides (`node.runtime` / `edge.runtime`) in the exported SVG.
   * This is useful for frame-by-frame animated export.
   */
  includeRuntime?: boolean;
}

export interface ContainerConfig {
  /** Layout direction for children (default 'free') */
  layout?: 'free' | 'vertical' | 'horizontal';
  /** Padding inside the container */
  padding?: { top: number; right: number; bottom: number; left: number };
  /** Whether the container auto-resizes to fit children */
  autoSize?: boolean;
  /** Header height for swimlane-style headers */
  headerHeight?: number;
}

/**
 * A named connection port (anchor point) on a node.
 *
 * Ports let edges connect to specific positions on a shape rather than
 * the generic boundary intersection.
 */
export interface NodePort {
  /** Unique port id within the node (e.g. `'top'`, `'left'`, `'out-1'`). */
  id: string;
  /**
   * Position **relative to the node center** (absolute pixel offset).
   *
   * For example, on a 120×60 rect centered at the node's `pos`:
   * - top port: `{ x: 0, y: -30 }`
   * - right port: `{ x: 60, y: 0 }`
   */
  offset: Vec2;
  /**
   * Optional direction hint for edge routing (outgoing tangent angle in **degrees**).
   *
   * - `0` = right
   * - `90` = down
   * - `180` = left
   * - `270` = up
   */
  direction?: number;
}

export interface SceneChanges {
  added: {
    nodes: string[];
    edges: string[];
  };
  removed: {
    nodes: string[];
    edges: string[];
  };
  updated: {
    nodes: string[];
    edges: string[];
  };
}

export interface VizSceneMutator {
  addNode(node: VizNode): void;
  removeNode(id: string): void;
  updateNode(id: string, patch: Partial<VizNode>): void;

  addEdge(edge: VizEdge): void;
  removeEdge(id: string): void;
  updateEdge(id: string, patch: Partial<VizEdge>): void;

  onChange(cb: (changes: SceneChanges) => void): () => void;
  commit(container: HTMLElement): void;
}

export interface VizNode {
  id: string;
  pos: Vec2;
  shape: NodeShape;
  label?: NodeLabel;
  /** Optional embedded image rendered alongside the node shape. */
  image?: VizNodeImage;
  /** Optional embedded icon rendered alongside the node shape. */
  icon?: VizNodeIcon;
  /** Optional embedded inline SVG content rendered alongside the node shape. */
  svgContent?: VizNodeSvgContent;
  runtime?: VizRuntimeNodeProps;
  style?: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    opacity?: number;
    /**
     * SVG `stroke-dasharray` value.
     * Use the presets `'dashed'` (`8,4`), `'dotted'` (`2,4`), `'dash-dot'` (`8,4,2,4`),
     * or pass any valid SVG dasharray string (e.g. `'12, 3, 3, 3'`).
     * `'solid'` (or omitting the property) renders a continuous stroke.
     */
    strokeDasharray?: 'solid' | 'dashed' | 'dotted' | 'dash-dot' | string;
  };
  className?: string; // e.g. "active", "input-layer"
  data?: unknown; // User payload
  onClick?: (id: string, node: VizNode) => void;
  animations?: VizAnimSpec[];
  /** Explicit render order. Higher values render on top. Default: 0. */
  zIndex?: number;

  /**
   * Named connection ports on this node.
   *
   * When an edge references a port via `fromPort` / `toPort`, the endpoint
   * is resolved to `node.pos + port.offset` instead of the generic
   * boundary intersection.
   *
   * If omitted, default ports for the node's shape are available automatically
   * (see `getDefaultPorts`). Explicit ports override defaults entirely.
   */
  ports?: NodePort[];

  /** If set, this node is a child of the node with this id. */
  parentId?: string;
  /** Container-specific configuration (only on parent nodes). */
  container?: ContainerConfig;
}

export interface EdgeLabel {
  text: string;
  /** Optional rich content. When set, this is rendered instead of `text`. */
  rich?: RichText;
  position: 'start' | 'mid' | 'end'; // Simplified for now
  className?: string;
  dx?: number;
  dy?: number;
  /** Maximum width for text wrapping (in px). If set, text wraps within this width. */
  maxWidth?: number;
  /** Line height multiplier (default: 1.2) */
  lineHeight?: number;
  /** Vertical alignment within the bounding box */
  verticalAlign?: 'top' | 'middle' | 'bottom';
  /** Text overflow behavior */
  overflow?: 'visible' | 'ellipsis' | 'clip';
}

/** Edge routing algorithm. */
export type EdgeRouting = 'straight' | 'curved' | 'orthogonal';

/**
 * Edge marker/arrowhead types.
 *
 * - `'none'`: No marker
 * - `'arrow'`: Filled triangle (default arrowhead)
 * - `'arrowOpen'`: Open/unfilled triangle (V shape)
 * - `'diamond'`: Filled diamond (UML composition)
 * - `'diamondOpen'`: Open diamond (UML aggregation)
 * - `'circle'`: Filled circle
 * - `'circleOpen'`: Open circle
 * - `'square'`: Filled square
 * - `'bar'`: Perpendicular line (T shape, for cardinality)
 * - `'halfArrow'`: Single-sided arrow (one wing)
 */
export type EdgeMarkerType =
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

export interface VizEdge {
  id: string;
  from: string;
  to: string;
  /** Arbitrary consumer-defined metadata associated with the edge. */
  meta?: Record<string, unknown>;
  /** @deprecated Use `labels` for multi-position support. Kept for backwards compatibility. */
  label?: EdgeLabel;
  /** Multiple labels at different positions along the edge. */
  labels?: EdgeLabel[];
  runtime?: VizRuntimeEdgeProps;
  /** Marker at the target (end) of the edge. */
  markerEnd?: EdgeMarkerType;
  /** Marker at the source (start) of the edge. */
  markerStart?: EdgeMarkerType;
  /** Port id on the source node. When set, the edge starts at the port's position instead of the boundary. */
  fromPort?: string;
  /** Port id on the target node. When set, the edge ends at the port's position instead of the boundary. */
  toPort?: string;
  /** For self-loops: which side the loop exits from. Default: 'top'. */
  loopSide?: 'top' | 'right' | 'bottom' | 'left';
  /** For self-loops: how far the loop extends from the shape. Default: 30. */
  loopSize?: number;
  anchor?: 'center' | 'boundary';
  /** Per-edge visual styling. Overrides the CSS defaults when set. */
  style?: {
    stroke?: string;
    strokeWidth?: number;
    fill?: string;
    opacity?: number;
    /**
     * SVG `stroke-dasharray` value.
     * Use the presets `'dashed'` (`8,4`), `'dotted'` (`2,4`), `'dash-dot'` (`8,4,2,4`),
     * or pass any valid SVG dasharray string (e.g. `'12, 3, 3, 3'`).
     * `'solid'` (or omitting the property) renders a continuous stroke.
     */
    strokeDasharray?: 'solid' | 'dashed' | 'dotted' | 'dash-dot' | string;
  };
  className?: string;
  hitArea?: number; // width in px
  data?: unknown;
  onClick?: (id: string, edge: VizEdge) => void;
  animations?: VizAnimSpec[];
  /** Routing algorithm for the edge path (default: 'straight'). */
  routing?: EdgeRouting;
  /** User-defined intermediate waypoints the edge must pass through. */
  waypoints?: Vec2[];
}

// ---------------------------------------------------------------------------
// Declarative options overloads
// ---------------------------------------------------------------------------

/**
 * Options object for `viz().node(id, opts)`.
 * Configures a node in a single declarative call instead of method chaining.
 */
export interface NodeOptions {
  /** Position (`{ x, y }`). */
  at?: { x: number; y: number };
  /** Grid cell (alternative to `at`). */
  cell?: { col: number; row: number; align?: 'center' | 'start' | 'end' };

  // --- Shape (pick exactly one) ---
  circle?: { r: number };
  rect?: { w: number; h: number; rx?: number };
  diamond?: { w: number; h: number };
  cylinder?: { w: number; h: number; arcHeight?: number };
  hexagon?: { r: number; orientation?: 'pointy' | 'flat' };
  ellipse?: { rx: number; ry: number };
  arc?: {
    r: number;
    startAngle: number;
    endAngle: number;
    closed?: boolean;
  };
  blockArrow?: {
    length: number;
    bodyWidth: number;
    headWidth: number;
    headLength: number;
    direction?: 'right' | 'left' | 'up' | 'down';
  };
  callout?: {
    w: number;
    h: number;
    rx?: number;
    pointerSide?: 'bottom' | 'top' | 'left' | 'right';
    pointerHeight?: number;
    pointerWidth?: number;
    pointerPosition?: number;
  };
  cloud?: { w: number; h: number };
  cross?: { size: number; barWidth?: number };
  cube?: { w: number; h: number; depth?: number };
  path?: { d: string; w: number; h: number };
  document?: { w: number; h: number; waveHeight?: number };
  note?: { w: number; h: number; foldSize?: number };
  parallelogram?: { w: number; h: number; skew?: number };
  star?: { points: number; outerR: number; innerR?: number };
  trapezoid?: { topW: number; bottomW: number; h: number };
  triangle?: {
    w: number;
    h: number;
    direction?: 'up' | 'down' | 'left' | 'right';
  };

  // --- Embedded Media ---
  image?: {
    href: string;
    w: number;
    h: number;
    dx?: number;
    dy?: number;
    position?: NodeMediaPosition;
    preserveAspectRatio?: string;
  };
  icon?: {
    id: string;
    size: number;
    color?: string;
    dx?: number;
    dy?: number;
    position?: NodeMediaPosition;
  };
  svgContent?: {
    content: string;
    w: number;
    h: number;
    dx?: number;
    dy?: number;
    position?: NodeMediaPosition;
  };

  // --- Styling ---
  fill?: string;
  /** Stroke color, or `{ color, width }`. */
  stroke?: string | { color: string; width?: number };
  opacity?: number;
  /** Dash pattern preset or custom SVG dasharray string. */
  dash?: 'solid' | 'dashed' | 'dotted' | 'dash-dot' | string;
  /** Explicit render order. Higher values render on top. Default: 0. */
  zIndex?: number;
  className?: string;

  // --- Label & Embedded Image ---
  /** Plain string or full label options. */
  label?:
    | string
    | ({ text: string } & Partial<Omit<NodeLabel, 'text'>>)
    | ({ rich: RichText; text?: string } & Partial<
        Omit<NodeLabel, 'text' | 'rich'>
      >);

  // --- Extras ---
  data?: unknown;
  onClick?: (id: string, node: VizNode) => void;

  // --- Ports ---
  ports?: Array<{
    id: string;
    offset: { x: number; y: number };
    direction?: number;
  }>;

  // --- Containment ---
  container?: ContainerConfig;
  parent?: string;
}

/**
 * Options object for `viz().edge(from, to, opts)`.
 * Configures an edge in a single declarative call instead of method chaining.
 */
export interface EdgeOptions {
  /** Custom edge id (defaults to `"from->to"`). */
  id?: string;

  // --- Routing ---
  routing?: EdgeRouting;
  waypoints?: Vec2[];

  // --- Markers ---
  /** Convenience for arrow markers. `true` = markerEnd arrow, `'both'` = both ends. */
  arrow?: boolean | 'both' | 'start' | 'end';
  markerStart?: EdgeMarkerType;
  markerEnd?: EdgeMarkerType;

  // --- Self-Loops ---
  loopSide?: 'top' | 'right' | 'bottom' | 'left';
  loopSize?: number;

  // --- Style ---
  /** Stroke color, or `{ color, width }`. */
  stroke?: string | { color: string; width?: number };
  fill?: string;
  opacity?: number;
  /** Dash pattern preset or custom SVG dasharray string. */
  dash?: 'solid' | 'dashed' | 'dotted' | 'dash-dot' | string;
  className?: string;

  // --- Anchor ---
  anchor?: 'center' | 'boundary';

  // --- Ports ---
  fromPort?: string;
  toPort?: string;

  // --- Labels ---
  /** Single label string, a label object, or an array of multi-position labels. */
  label?:
    | string
    | ({ text: string } & Partial<Omit<EdgeLabel, 'text'>>)
    | ({ rich: RichText; text?: string } & Partial<
        Omit<EdgeLabel, 'text' | 'rich'>
      >)
    | Array<
        | ({ text: string } & Partial<Omit<EdgeLabel, 'text'>>)
        | ({ rich: RichText; text?: string } & Partial<
            Omit<EdgeLabel, 'text' | 'rich'>
          >)
      >;

  // --- Hit area ---
  hitArea?: number;

  // --- Extras ---
  /** Arbitrary consumer-defined metadata associated with the edge. */
  meta?: Record<string, unknown>;
  data?: unknown;
  onClick?: (id: string, edge: VizEdge) => void;
}

/**
 * Hook to override how an edge's SVG path `d` string is computed.
 *
 * Called during `mount()`/`commit()` DOM reconciliation and during `patchRuntime()`.
 *
 * The resolver receives:
 * - the edge being rendered
 * - the full scene (for obstacle-aware routing, etc.)
 * - a `defaultResolver` that preserves VizCraft's built-in routing
 */
export type EdgePathResolver = (
  edge: VizEdge,
  scene: VizScene,
  defaultResolver: (edge: VizEdge, scene: VizScene) => string
) => string;

/**
 * Overlay kind -> params mapping.
 *
 * This interface is intentionally empty in core and is meant to be augmented by:
 * - core overlays (in this repo)
 * - downstream libraries/apps (via TS module augmentation)
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface OverlayKindRegistry {}

/** Internal runtime flag used to mark overlays as needing a DOM update. */
export const OVERLAY_RUNTIME_DIRTY = Symbol('vizcraft.overlay.runtimeDirty');

/** String overlay ids that are known/typed via `OverlayKindRegistry`. */
export type KnownOverlayId = Extract<keyof OverlayKindRegistry, string>;

/** Any overlay id (typed known ids + arbitrary custom ids). */
export type OverlayId = KnownOverlayId | (string & {});

/**
 * Params type for a given overlay id.
 * - Known ids resolve to their registered params type.
 * - Unknown/custom ids fall back to `unknown` (escape hatch).
 */
export type OverlayParams<K extends string> = K extends KnownOverlayId
  ? OverlayKindRegistry[K]
  : unknown;

/** A type-safe overlay spec keyed by overlay id. */
export type TypedVizOverlaySpec<K extends OverlayId = OverlayId> = {
  id: K;
  key?: string;
  params: OverlayParams<K>;
  className?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VizOverlaySpec<T = any> = {
  id: string; // overlay kind, e.g. "signal"
  key?: string; // stable key (optional)
  params: T; // overlay data
  className?: string; // e.g. "viz-signal-red"
};

export interface VizGridConfig {
  cols: number;
  rows: number;
  padding: { x: number; y: number };
}

export type VizScene = {
  viewBox: { w: number; h: number };
  grid?: VizGridConfig;
  nodes: VizNode[];
  edges: VizEdge[];
  overlays?: VizOverlaySpec[];

  /**
   * Portable, data-only animation specs (independent of CSS/registry animations).
   * Generated by the fluent AnimationBuilder API.
   */
  animationSpecs?: AnimationSpec[];
};

export interface PanZoomOptions {
  /** Enable pan & zoom (default: false) */
  panZoom?: boolean;
  /** Minimum zoom level (default: 0.1) */
  minZoom?: number;
  /** Maximum zoom level (default: 5) */
  maxZoom?: number;
  /** Initial zoom level ('fit' or number, default: 'fit') */
  initialZoom?: 'fit' | number;
  /** Whether scroll wheel zooms (default: true) */
  zoomOnWheel?: boolean;
  /** Whether drag on empty space pans (default: true) */
  panOnDrag?: boolean;
}

export interface PanZoomController {
  /** Current zoom level (1 = 100%) */
  zoom: number;
  /** Current pan offset */
  pan: Vec2;

  /** Set zoom level programmatically */
  setZoom(level: number, center?: Vec2): void;
  /** Set pan offset programmatically */
  setPan(offset: Vec2): void;
  /** Fit the scene content to the viewport */
  fitToContent(padding?: number): void;
  /** Zoom and center on a specific node */
  zoomToNode(nodeId: string, padding?: number): void;
  /** Reset pan and zoom to initial state */
  reset(): void;

  /** Listen for viewport changes */
  onChange(cb: (state: { zoom: number; pan: Vec2 }) => void): () => void;

  /** Cleanup event listeners */
  destroy(): void;
}

/**
 * A VizCraft plugin is a function that receives the VizBuilder instance
 * and optional configuration options. It can mutate the scene, add nodes/edges,
 * or attach custom behavior.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VizPlugin<Options = any> = (
  builder: VizBuilder,
  options?: Options
) => void;

/**
 * Event fired when a VizScene is built.
 */
export type VizBuildEvent = {
  scene: VizScene;
};

/**
 * Event fired when a VizScene is mounted to the DOM.
 */
export type VizMountEvent = {
  container: HTMLElement;
  controller?: PanZoomController;
};

/**
 * Map of all events emitted by VizBuilder.
 */
export interface VizEventMap {
  build: VizBuildEvent;
  mount: VizMountEvent;
}

/**
 * Input graph structure for layout algorithms.
 */
export interface LayoutGraph {
  nodes: VizNode[];
  edges: VizEdge[];
}

/**
 * Result of a layout algorithm, mapping node IDs to their computed positions.
 * A layout algorithm may optionally return edge routing paths.
 */
export interface LayoutResult {
  nodes: Record<string, { x: number; y: number }>;
  edges?: Record<string, { waypoints?: Vec2[] }>;
}

/**
 * A layout algorithm computes positions for nodes in a graph.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LayoutAlgorithm<Options = any> = (
  graph: LayoutGraph,
  options?: Options
) => LayoutResult;
