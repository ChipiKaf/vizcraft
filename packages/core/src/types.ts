export type Vec2 = { x: number; y: number };

import type { AnimationSpec } from './anim/spec';

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
    };

export type NodeLabel = {
  text: string;
  dx?: number;
  dy?: number;
  className?: string;
  fill?: string;
  fontSize?: number | string;
  fontWeight?: number | string;
  textAnchor?: 'start' | 'middle' | 'end';
  dominantBaseline?: string;
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
}>;

export type VizRuntimeEdgeProps = Partial<{
  strokeDashoffset: number;
  opacity: number;
}>;

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

export interface VizNode {
  id: string;
  pos: Vec2;
  shape: NodeShape;
  label?: NodeLabel;
  runtime?: VizRuntimeNodeProps;
  style?: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    opacity?: number;
  };
  className?: string; // e.g. "active", "input-layer"
  data?: unknown; // User payload
  onClick?: (id: string, node: VizNode) => void;
  animations?: VizAnimSpec[];

  /** If set, this node is a child of the node with this id. */
  parentId?: string;
  /** Container-specific configuration (only on parent nodes). */
  container?: ContainerConfig;
}

export interface EdgeLabel {
  text: string;
  position: 'start' | 'mid' | 'end'; // Simplified for now
  className?: string;
  dx?: number;
  dy?: number;
}

/** Edge routing algorithm. */
export type EdgeRouting = 'straight' | 'curved' | 'orthogonal';

export interface VizEdge {
  id: string;
  from: string;
  to: string;
  label?: EdgeLabel;
  runtime?: VizRuntimeEdgeProps;
  markerEnd?: 'arrow' | 'none';
  anchor?: 'center' | 'boundary';
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
