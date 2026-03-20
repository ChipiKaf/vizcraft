export type Vec2 = { x: number; y: number };

import type { AnimationSpec } from './animation/spec';
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

// ---------------------------------------------------------------------------
// Tooltip types
// ---------------------------------------------------------------------------

/** A single key/value section inside a structured tooltip. */
export interface TooltipSection {
  label: string;
  value: string;
}

/**
 * Tooltip content attached to a node or edge.
 *
 * - **string** — plain text tooltip.
 * - **object** — structured tooltip with optional title and labelled sections.
 */
export type TooltipContent =
  | string
  | {
      title?: string;
      sections: TooltipSection[];
    };

// ---------------------------------------------------------------------------
// Badge types
// ---------------------------------------------------------------------------

/** Corner position for a text badge on a node. */
export type BadgePosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

/** A small text badge indicator pinned to a corner of a node. */
export interface VizNodeBadge {
  /** 1–2 character text (icon / letter). */
  text: string;
  /** Corner to pin the badge to. */
  position: BadgePosition;
  /** Text color. */
  fill?: string;
  /** Optional pill background color. */
  background?: string;
  /** Font size in px (default 10). */
  fontSize?: number;
}

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
  fontFamily?: string;
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
 * A single compartment (section) inside a compartmented node.
 *
 * Used in UML-style class diagrams where a node is divided into
 * horizontal sections separated by divider lines (name, attributes, methods).
 */
export interface VizNodeCompartment {
  /** Unique compartment id within the node (e.g. `'name'`, `'attributes'`, `'methods'`). */
  id: string;
  /** Y offset from the node's top edge. Computed during build. */
  y: number;
  /** Height of this compartment in pixels. */
  height: number;
  /** Optional label rendered inside the compartment. */
  label?: NodeLabel;
  /**
   * Individual entries within this compartment.
   * When present, the compartment renders per-entry text lines
   * instead of a single label block.
   */
  entries?: CompartmentEntry[];
  /**
   * Click handler for this compartment.
   * Receives a context object with the node/compartment ids, current
   * collapsed state, and a `toggle()` helper for collapse animation.
   */
  onClick?: (ctx: CompartmentClickContext) => void;
}

/**
 * Context passed to a compartment's `onClick` handler.
 */
export interface CompartmentClickContext {
  /** Id of the node that owns this compartment. */
  nodeId: string;
  /** Id of the clicked compartment. */
  compartmentId: string;
  /** Current collapsed state of the node (`true` = collapsed). */
  collapsed: boolean;
  /**
   * Toggle the collapsed state of the parent node.
   * Optionally pass `{ animate: <ms> }` for a smooth height transition.
   */
  toggle: (opts?: { animate?: number }) => void;
}

/** A single entry (line) inside a compartment. */
export interface CompartmentEntry {
  /** Unique entry id within the compartment. */
  id: string;
  /** Y offset from the compartment's top edge. */
  y: number;
  /** Height of this entry's line region (includes padding). */
  height: number;
  /** Display text for this entry. */
  text: string;
  /** Resolved label used for rendering. */
  label?: NodeLabel;
  /** Click handler for this entry. */
  onClick?: () => void;
  /** Tooltip shown when hovering this entry. */
  tooltip?: TooltipContent;
  /** Custom CSS class(es) applied to the entry element. */
  className?: string;
  /** Vertical padding above this entry (px). */
  paddingTop?: number;
  /** Vertical padding below this entry (px). */
  paddingBottom?: number;
}

/** Per-entry styling options. */
export interface EntryStyle {
  fill?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: string;
  fontFamily?: string;
}

/** Options for `CompartmentBuilder.entry()`. */
export interface EntryOptions {
  onClick?: () => void;
  style?: Partial<EntryStyle>;
  tooltip?: TooltipContent;
  maxWidth?: number;
  overflow?: 'visible' | 'ellipsis' | 'clip';
  /** Vertical padding around the entry (px), or `{ top, bottom }`. */
  padding?: number | { top?: number; bottom?: number };
  /** Custom CSS class(es) applied to the entry element. */
  className?: string;
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
    /**
     * Drop shadow rendered behind the node shape via an SVG `<filter>`.
     *
     * - `dx` — horizontal offset (default `2`)
     * - `dy` — vertical offset (default `2`)
     * - `blur` — Gaussian blur radius / stdDeviation (default `4`)
     * - `color` — shadow color (default `'rgba(0,0,0,0.2)'`)
     */
    shadow?: {
      dx?: number;
      dy?: number;
      blur?: number;
      color?: string;
    };
    /** Render the node with a hand-drawn / sketchy appearance. */
    sketch?: boolean;
    /** Seed for deterministic sketch jitter (same seed → same wobble). */
    sketchSeed?: number;
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
  /**
   * Compartments divide the node into horizontal sections separated by
   * divider lines (UML-style class boxes).
   *
   * Each compartment has a computed `y` offset and `height`, and an optional
   * label. Empty compartments (no label) are omitted from rendering.
   */
  compartments?: VizNodeCompartment[];

  /**
   * When `true`, a compartmented node renders only its first compartment
   * (the header) and hides all others. All compartment data is preserved.
   *
   * A small collapse indicator is rendered so users can tell the node is
   * collapsible. Has no effect on nodes without compartments.
   */
  collapsed?: boolean;

  /**
   * Tooltip content shown on hover / focus.
   * Pass a plain string for simple text or a structured object with sections.
   */
  tooltip?: TooltipContent;

  /**
   * Small text badges pinned to corners of the node.
   * Each badge is a 1–2 character indicator with optional pill background.
   */
  badges?: VizNodeBadge[];
}

export interface EdgeLabel {
  text: string;
  /** Optional rich content. When set, this is rendered instead of `text`. */
  rich?: RichText;
  position: 'start' | 'mid' | 'end'; // Simplified for now
  className?: string;
  dx?: number;
  dy?: number;
  fill?: string;
  fontSize?: number | string;
  fontWeight?: number | string;
  fontFamily?: string;
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
  /** Source node id. Optional for dangling edges (use `fromAt` instead). */
  from?: string;
  /** Target node id. Optional for dangling edges (use `toAt` instead). */
  to?: string;
  /** Free-endpoint coordinate for the source end (when `from` is omitted). */
  fromAt?: Vec2;
  /** Free-endpoint coordinate for the target end (when `to` is omitted). */
  toAt?: Vec2;
  /** Angle (degrees) for the source perimeter anchor. 0 = right, 90 = down. */
  fromAngle?: number;
  /** Angle (degrees) for the target perimeter anchor. 0 = right, 90 = down. */
  toAngle?: number;
  /**
   * Auto-compute perimeter angles so the edge forms a straight line between nodes.
   * - `true`  — both ends
   * - `'from'` — source end only
   * - `'to'`  — target end only
   */
  straightLine?: boolean | 'from' | 'to';
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
    /** Render the edge with a hand-drawn / sketchy appearance. */
    sketch?: boolean;
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

  /**
   * Tooltip content shown on hover / focus.
   * Pass a plain string for simple text or a structured object with sections.
   */
  tooltip?: TooltipContent;
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
  /**
   * Drop shadow behind the node shape.
   * `true` for default shadow, or a config object `{ dx, dy, blur, color }`.
   */
  shadow?:
    | boolean
    | { dx?: number; dy?: number; blur?: number; color?: string };
  /**
   * Hand-drawn / sketchy rendering for this node.
   * `true` uses a default seed; pass `{ seed }` for deterministic jitter.
   */
  sketch?: boolean | { seed?: number };
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

  // --- Tooltip ---
  /** Tooltip shown on hover/focus. Plain string or structured `{ title?, sections }`. */
  tooltip?: TooltipContent;

  // --- Badges ---
  /** Text badges pinned to corners of the node. */
  badges?: Array<{
    text: string;
    position: BadgePosition;
    fill?: string;
    background?: string;
    fontSize?: number;
  }>;

  // --- Ports ---
  ports?: Array<{
    id: string;
    offset: { x: number; y: number };
    direction?: number;
  }>;

  // --- Containment ---
  container?: ContainerConfig;
  parent?: string;

  // --- Compartments ---
  /**
   * Compartmented node sections (UML-style class boxes).
   *
   * Each entry defines a compartment with an `id` and optional `label`.
   * Heights are auto-computed based on label content at build time.
   */
  compartments?: Array<{
    id: string;
    label?: string | ({ text: string } & Partial<Omit<NodeLabel, 'text'>>);
    /** Explicit height override for this compartment. */
    height?: number;
    /** Individual entries within this compartment. */
    entries?: Array<{
      id: string;
      text: string;
      onClick?: () => void;
      style?: Partial<EntryStyle>;
      tooltip?: TooltipContent;
      maxWidth?: number;
      overflow?: 'visible' | 'ellipsis' | 'clip';
      padding?: number | { top?: number; bottom?: number };
      className?: string;
    }>;
    /** Click handler for this compartment. */
    onClick?: (ctx: CompartmentClickContext) => void;
  }>;

  // --- Collapsed Mode ---
  /**
   * When `true`, renders only the first compartment (header) and hides
   * the rest. All compartment data is preserved for expand/collapse toggling.
   * Has no effect on nodes without compartments.
   */
  collapsed?: boolean;
}

/**
 * Options object for `viz().edge(from, to, opts)`.
 * Configures an edge in a single declarative call instead of method chaining.
 */
export interface EdgeOptions {
  /** Custom edge id (defaults to `"from->to"`). */
  id?: string;

  /** Source node id. Use with `danglingEdge()` to attach one end to a node. */
  from?: string;
  /** Target node id. Use with `danglingEdge()` to attach one end to a node. */
  to?: string;

  /** Free-endpoint coordinate for the source end (when `from` is omitted). */
  fromAt?: Vec2;
  /** Free-endpoint coordinate for the target end (when `to` is omitted). */
  toAt?: Vec2;

  /** Angle (degrees) for the source perimeter anchor. 0 = right, 90 = down. */
  fromAngle?: number;
  /** Angle (degrees) for the target perimeter anchor. 0 = right, 90 = down. */
  toAngle?: number;
  /**
   * Auto-compute perimeter angles so the edge forms a straight line between nodes.
   * - `true`  — both ends
   * - `'from'` — source end only
   * - `'to'`  — target end only
   */
  straightLine?: boolean | 'from' | 'to';

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
  /** Hand-drawn / sketchy rendering for this edge. */
  sketch?: boolean;
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

  // --- Tooltip ---
  /** Tooltip shown on hover/focus. Plain string or structured `{ title?, sections }`. */
  tooltip?: TooltipContent;
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

  /** Global sketch / hand-drawn rendering mode. Applies to all nodes and edges. */
  sketch?: { enabled?: boolean; seed?: number };
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
 * A synchronous layout algorithm that computes positions for nodes in a graph.
 *
 * Use this type for algorithms that return results immediately.
 * See also {@link LayoutAlgorithm} for algorithms that may be async.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SyncLayoutAlgorithm<Options = any> = (
  graph: LayoutGraph,
  options?: Options
) => LayoutResult;

/**
 * A layout algorithm that may be synchronous or asynchronous.
 *
 * Use with {@link VizBuilder.layoutAsync} for async engines (e.g. ELK via
 * web workers). For the sync-only variant, see {@link SyncLayoutAlgorithm}.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LayoutAlgorithm<Options = any> = (
  graph: LayoutGraph,
  options?: Options
) => LayoutResult | Promise<LayoutResult>;
