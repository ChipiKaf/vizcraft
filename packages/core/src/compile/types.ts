/**
 * Internal types for the declarative spec compiler.
 *
 * The compiler turns a `VizSpec` (which may omit coordinates and use groups,
 * zones, ports, kinds, …) into fully resolved nodes/edges/overlays that map
 * 1:1 onto fluent builder calls.
 */

import type {
  EdgeAnimateSpec,
  EdgeMarkerSpec,
  EdgeSpec,
  LabelPlacementSpec,
  NodePortSpec,
  NodeSpec,
  NodeSpecShape,
  NodeTypeSpec,
  StaticOverlaySpec,
  ViewSpec,
} from '../spec';

/** A 2D point (kept local so the compiler has no dependency on core types). */
export interface Point {
  x: number;
  y: number;
}

/** Axis-aligned box described by its centre and size. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A node with every geometric and visual property resolved.
 * `x`/`y` are the absolute centre in scene coordinates.
 */
export interface ResolvedNode extends Box {
  id: string;
  type: NodeTypeSpec;
  /** Original spec entry (unmodified). */
  spec: NodeSpec;

  /** Effective shape (explicit, kind-token, or type default). */
  shape: NodeSpecShape;

  parent?: string;
  labelPlacement: LabelPlacementSpec;

  /** Groups: header strip height reserved for the label (0 when no label). */
  headerHeight: number;
  /** Groups/zones: resolved inner padding. */
  padding: number;

  /** True when this group renders collapsed (summary node). */
  collapsed?: boolean;
  /** Number of direct+indirect children hidden by collapse. */
  hiddenChildCount?: number;

  // Resolved visual style (kind token merged under explicit spec values).
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /** `'solid'`, `'dashed'`, `'dotted'` or raw dasharray. */
  dash?: string;
  opacity?: number;
  className?: string;
  zIndex?: number;

  ports?: NodePortSpec[];

  /** True when the focus feature dims this node. */
  dimmed?: boolean;
}

/** An edge with endpoints, ports, routing and style fully resolved. */
export interface ResolvedEdge {
  id: string;
  /** Original spec entry (unmodified). */
  spec: EdgeSpec;

  from: string;
  to: string;
  fromPort?: string;
  toPort?: string;

  routing: 'straight' | 'curved' | 'orthogonal';
  waypoints?: Point[];
  fromAngle?: number;
  toAngle?: number;

  label?: string;
  markerStart?: EdgeMarkerSpec;
  markerEnd?: EdgeMarkerSpec;
  animate?: EdgeAnimateSpec;

  stroke?: string;
  strokeWidth?: number;
  dash?: string;
  opacity?: number;
  className?: string;

  /** True when the focus feature dims this edge. */
  dimmed?: boolean;
}

/** Output of {@link compileSpec}: everything `fromSpec` needs to hydrate a builder. */
export interface CompiledSpec {
  view: ViewSpec;
  /** In render order: zones first, then groups/leaves in tree order, notes last. */
  nodes: ResolvedNode[];
  edges: ResolvedEdge[];
  /** Original overlays plus generated title/legend overlays. */
  overlays: StaticOverlaySpec[];
  /** Ids of groups that can be collapse-toggled by clicking. */
  collapsibleGroupIds: string[];
  /** Map of node id → all descendant ids (groups only). */
  descendantsOf: Map<string, string[]>;
}

/** Options threaded through the compile pipeline. */
export interface CompileOptions {
  /**
   * Runtime collapse-state overrides (group id → collapsed?). Takes
   * precedence over `NodeSpec.collapsed`. Used by the interactive
   * collapse/expand toggle.
   */
  collapsedOverrides?: ReadonlyMap<string, boolean>;
}
