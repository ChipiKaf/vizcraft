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

export interface NodeSpec {
  /** Unique identifier for the node. Referenced by edges, overlays, and signals. */
  id: string;

  /** Display label. Pass an array of strings for a multi-line label. */
  label?: string | string[];

  /** Shape type. Defaults to `'rect'`. */
  shape?: NodeSpecShape;

  /** Absolute X position of the node centre in scene coordinates. */
  x: number;

  /** Absolute Y position of the node centre in scene coordinates. */
  y: number;

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

  /** Highlight ring colour. Draws a coloured border pulse around the node. */
  highlight?: string;

  /** CSS class added to the node's root SVG element. */
  class?: string;

  tooltip?: {
    title: string;
    sections?: Array<{ label: string; value: string }>;
  };
}

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

export type EdgeStyleSpec = 'straight' | 'curved' | 'orthogonal';

export type EdgeAnimateSpec = 'flow' | false;

export type ArrowModeSpec = 'end' | 'start' | 'both' | false;

export interface EdgeSpec {
  /** Source node id. */
  from: string;

  /** Target node id. */
  to: string;

  /**
   * Optional explicit id for later lookup or overlay anchoring.
   * Defaults to `'${from}-${to}'` when omitted.
   */
  id?: string;

  label?: string;

  /** Edge routing style. Default: `'straight'`. */
  style?: EdgeStyleSpec;

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
export interface VizSpec {
  /** Viewport dimensions. */
  view: { width: number; height: number };

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
}
