import type {
  VizScene,
  VizNode,
  VizEdge,
  NodeLabel,
  EdgeLabel,
  AnimationConfig,
  VizOverlaySpec,
  OverlayId,
  OverlayParams,
  VizGridConfig,
  ContainerConfig,
  EdgeRouting,
  EdgeMarkerType,
  NodeOptions,
  EdgeOptions,
  NodeImage,
  PanZoomOptions,
  PanZoomController,
  VizSceneMutator,
  SceneChanges,
  VizPlugin,
  VizEventMap,
  LayoutAlgorithm,
  LayoutGraph,
} from './types';
import { OVERLAY_RUNTIME_DIRTY } from './types';
import { setupPanZoom } from './panZoom';
import { DEFAULT_VIZ_CSS } from './styles';
import { defaultCoreAnimationRegistry } from './animations';
import { defaultCoreOverlayRegistry } from './overlays';
import { OverlayBuilder } from './overlayBuilder';
import { resolveDasharray } from './edgeStyles';
import {
  createRuntimePatchCtx,
  patchRuntime,
  type RuntimePatchCtx,
} from './runtimePatcher';
import {
  computeEdgePath,
  computeEdgeEndpoints,
  computeSelfLoop,
} from './edgePaths';
import { resolveEdgeLabelPosition, collectEdgeLabels } from './edgeLabels';
import { renderSvgText } from './textUtils';
import type { AnimationSpec } from './anim/spec';
import {
  buildAnimationSpec,
  type AnimationBuilder,
  type AnimatableProps,
  type TweenOptions,
} from './anim/animationBuilder';
import {
  createBuilderPlayback,
  type PlaybackController,
} from './anim/playback';
import type { ExtendAdapter } from './anim/extendAdapter';
import { getAdapterExtensions } from './anim/specExtensions';
import {
  applyShapeGeometry,
  effectivePos,
  getShapeBehavior,
  shapeSvgMarkup,
} from './shapes';

/**
 * Sanitise a CSS color value for use as a suffix in an SVG marker `id`.
 * Non-alphanumeric characters are replaced with underscores.
 */
function colorToMarkerSuffix(color: string): string {
  return color.replace(/[^a-zA-Z0-9]/g, '_');
}

/** Return the marker id to use for a marker type with an optional custom stroke and position. */
function markerIdFor(
  markerType: EdgeMarkerType,
  stroke: string | undefined,
  position: 'start' | 'end' = 'end'
): string {
  if (markerType === 'none') return '';
  const base = `viz-${markerType}`;
  const suffix = position === 'start' ? '-start' : '';
  return stroke
    ? `${base}${suffix}-${colorToMarkerSuffix(stroke)}`
    : `${base}${suffix}`;
}

/** @deprecated Use markerIdFor instead. Kept for backward compatibility. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function arrowMarkerIdFor(stroke: string | undefined): string {
  return markerIdFor('arrow', stroke);
}

/**
 * Generate SVG markup for a single marker definition.
 * @param markerType The type of marker
 * @param color Fill color for the marker (or stroke for open markers)
 * @param id The marker element id
 * @param position Whether this marker is used at the start or end of an edge
 */
/** Escape a string for safe use inside an XML/SVG attribute value. */
function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function generateMarkerSvg(
  markerType: EdgeMarkerType,
  color: string,
  id: string,
  position: 'start' | 'end' = 'end'
): string {
  if (markerType === 'none') return '';

  // Sanitise color for safe interpolation into SVG attribute strings
  const safeColor = escapeXmlAttr(color);

  // Common marker properties
  const viewBox = '0 0 10 10';
  // refX=9 positions the marker tip at the path endpoint.
  // Start markers use orient="auto-start-reverse" which flips the marker,
  // so the same refX=9 keeps the tip at the node boundary.
  const refX = '9';
  const refY = '5'; // Center vertically
  const markerWidth = '10';
  const markerHeight = '10';

  let content = '';

  switch (markerType) {
    case 'arrow':
      // Filled triangle
      content = `<polygon points="0,2 10,5 0,8" fill="${safeColor}" />`;
      break;

    case 'arrowOpen':
      // Open V-shape triangle (white fill hides the edge line behind the marker)
      content = `<polyline points="0,2 10,5 0,8" fill="white" stroke="${safeColor}" stroke-width="1.5" stroke-linejoin="miter" />`;
      break;

    case 'diamond':
      // Filled diamond
      content = `<polygon points="0,5 5,2 10,5 5,8" fill="${safeColor}" />`;
      break;

    case 'diamondOpen':
      // Open diamond (white fill hides the edge line behind the marker)
      content = `<polygon points="0,5 5,2 10,5 5,8" fill="white" stroke="${safeColor}" stroke-width="1.5" />`;
      break;

    case 'circle':
      // Filled circle
      content = `<circle cx="5" cy="5" r="3" fill="${safeColor}" />`;
      break;

    case 'circleOpen':
      // Open circle (white fill hides the edge line behind the marker)
      content = `<circle cx="5" cy="5" r="3" fill="white" stroke="${safeColor}" stroke-width="1.5" />`;
      break;

    case 'square':
      // Filled square
      content = `<rect x="2" y="2" width="6" height="6" fill="${safeColor}" />`;
      break;

    case 'bar':
      // Perpendicular line (T shape)
      content = `<line x1="5" y1="1" x2="5" y2="9" stroke="${safeColor}" stroke-width="2" stroke-linecap="round" />`;
      break;

    case 'halfArrow':
      // Single-sided arrow (top half of a filled triangle)
      content = `<polygon points="0,2 10,5 0,5" fill="${safeColor}" />`;
      break;

    default:
      return '';
  }

  const orient = position === 'start' ? 'auto-start-reverse' : 'auto';
  return `<marker id="${id}" viewBox="${viewBox}" refX="${refX}" refY="${refY}" markerWidth="${markerWidth}" markerHeight="${markerHeight}" orient="${orient}">${content}</marker>`;
}

const runtimePatchCtxBySvg = new WeakMap<SVGSVGElement, RuntimePatchCtx>();

const autoplayControllerByContainer = new WeakMap<
  HTMLElement,
  PlaybackController
>();

type SvgAttrValue = string | number | undefined;

function setSvgAttributes(el: SVGElement, attrs: Record<string, SvgAttrValue>) {
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === undefined) {
      el.removeAttribute(key);
    } else {
      el.setAttribute(key, String(value));
    }
  });
}

function svgAttributeString(attrs: Record<string, SvgAttrValue>) {
  return Object.entries(attrs)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ` ${key}="${String(value)}"`)
    .join('');
}

function animFallbackClass(id: string) {
  // Convention: `animate('flow')` -> `.viz-anim-flow`
  return `viz-anim-${id}`;
}

function animFallbackStyleEntries(params: unknown): Array<[string, string]> {
  if (!params || typeof params !== 'object') return [];
  return Object.entries(params as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => [`--viz-anim-${k}`, String(v)] as [string, string]);
}

export interface VizBuilder extends VizSceneMutator {
  /**
   * Applies a plugin to the builder fluently.
   * @param plugin The plugin function to execute
   * @param options Optional configuration for the plugin
   * @returns The builder, for fluent chaining
   */
  use<O>(plugin: VizPlugin<O>, options?: O): VizBuilder;

  /**
   * Applies a layout algorithm to the current nodes and edges.
   * @param algorithm The layout function to execute
   * @param options Optional configuration for the layout algorithm
   * @returns The builder, for fluent chaining
   */
  layout<O>(algorithm: LayoutAlgorithm<O>, options?: O): VizBuilder;

  /**
   * Listen for lifecycle events (e.g. 'build', 'mount').
   * @param event The event name
   * @param callback The callback to execute when the event fires
   * @returns An unsubscribe function
   */
  on<K extends keyof VizEventMap>(
    event: K,
    callback: (ev: VizEventMap[K]) => void
  ): () => void;

  view(w: number, h: number): VizBuilder;
  grid(
    cols: number,
    rows: number,
    padding?: { x: number; y: number }
  ): VizBuilder;

  /**
   * Fluent, data-only animation authoring. Compiles immediately to an `AnimationSpec`.
   * The compiled spec is also stored on the built scene as `scene.animationSpecs`.
   */
  animate(cb: (anim: AnimationBuilder) => unknown): AnimationSpec;

  /** Fluent overlay authoring (compiles to overlay specs and stores on the built scene). */
  overlay(cb: (overlay: OverlayBuilder) => unknown): VizBuilder;

  overlay<K extends OverlayId>(
    id: K,
    params: OverlayParams<K>,
    key?: string
  ): VizBuilder;
  // Back-compat escape hatch (also covers non-augmented custom overlay ids)
  overlay<T>(id: string, params: T, key?: string): VizBuilder;
  /** Create a node and return the NodeBuilder for fluent chaining. */
  node(id: string): NodeBuilder;
  /** Create a fully-configured node declaratively and return the parent VizBuilder. */
  node(id: string, opts: NodeOptions): VizBuilder;
  /** Create an edge and return the EdgeBuilder for fluent chaining. */
  edge(from: string, to: string, id?: string): EdgeBuilder;
  /** Create a fully-configured edge declaratively and return the parent VizBuilder. */
  edge(from: string, to: string, opts: EdgeOptions): VizBuilder;

  /** Hydrates the builder from an existing VizScene. */
  fromScene(scene: VizScene): VizBuilder;

  build(): VizScene;

  // Internal helper for NodeBuilder to access grid config
  _getGridConfig(): VizGridConfig | null;
  _getViewBox(): { w: number; h: number };
  svg(): string;
  mount(container: HTMLElement): PanZoomController | undefined;
  mount(
    container: HTMLElement,
    opts: { autoplay?: boolean; css?: string | string[] } & PanZoomOptions
  ): PanZoomController | undefined;

  /**
   * Plays animation specs against a mounted container.
   *
   * - If called with no args, plays against the last container passed to `mount()`.
   *   If `mount()` hasn't been called yet, logs a warning and no-ops.
   * - If `spec` is omitted, plays the specs stored on the built scene (`scene.animationSpecs`).
   * - Stops any prior playback started for the same container.
   * - If the container isn't mounted yet, it will be mounted first.
   */
  play(): PlaybackController | null;
  play(container: HTMLElement): PlaybackController | null;
  play(container: HTMLElement, spec: AnimationSpec): PlaybackController;
  play(container: HTMLElement, spec: AnimationSpec[]): PlaybackController;

  /**
   * Resizes a node at runtime, overriding its initial shape dimensions.
   */
  resizeNode(
    id: string,
    dims: { w?: number; h?: number; r?: number }
  ): VizBuilder;

  /**
   * Applies runtime-only patches (node.runtime / edge.runtime) to the mounted SVG.
   * This avoids full DOM reconciliation and is intended for animation frame updates.
   */
  patchRuntime(container: HTMLElement): void;

  /**
   * Tear down a previously mounted scene.
   *
   * - Removes the SVG tree from the container.
   * - Destroys the PanZoomController (if created).
   * - Cancels any pending requestAnimationFrame / animation loops.
   * - Removes any internal event listeners (resize, mutation, etc.).
   *
   * Safe to call multiple times (no-op after first call).
   * Safe to call even if `mount()` was never called.
   */
  destroy(): void;
}

interface NodeBuilder {
  at(x: number, y: number): NodeBuilder;
  cell(
    col: number,
    row: number,
    align?: 'center' | 'start' | 'end'
  ): NodeBuilder;
  circle(r: number): NodeBuilder;
  rect(w: number, h: number, rx?: number): NodeBuilder;
  diamond(w: number, h: number): NodeBuilder;
  cylinder(w: number, h: number, arcHeight?: number): NodeBuilder;
  hexagon(r: number, orientation?: 'pointy' | 'flat'): NodeBuilder;
  ellipse(rx: number, ry: number): NodeBuilder;
  arc(
    r: number,
    startAngle: number,
    endAngle: number,
    closed?: boolean
  ): NodeBuilder;
  blockArrow(
    length: number,
    bodyWidth: number,
    headWidth: number,
    headLength: number,
    direction?: 'right' | 'left' | 'up' | 'down'
  ): NodeBuilder;
  callout(
    w: number,
    h: number,
    opts?: {
      rx?: number;
      pointerSide?: 'bottom' | 'top' | 'left' | 'right';
      pointerHeight?: number;
      pointerWidth?: number;
      pointerPosition?: number;
    }
  ): NodeBuilder;
  cloud(w: number, h: number): NodeBuilder;
  cross(size: number, barWidth?: number): NodeBuilder;
  cube(w: number, h: number, depth?: number): NodeBuilder;
  path(d: string, w: number, h: number): NodeBuilder;
  document(w: number, h: number, waveHeight?: number): NodeBuilder;
  note(w: number, h: number, foldSize?: number): NodeBuilder;
  parallelogram(w: number, h: number, skew?: number): NodeBuilder;
  star(points: number, outerR: number, innerR?: number): NodeBuilder;
  trapezoid(topW: number, bottomW: number, h: number): NodeBuilder;
  triangle(
    w: number,
    h: number,
    direction?: 'up' | 'down' | 'left' | 'right'
  ): NodeBuilder;
  label(text: string, opts?: Partial<NodeLabel>): NodeBuilder;
  fill(color: string): NodeBuilder;
  stroke(color: string, width?: number): NodeBuilder;
  opacity(value: number): NodeBuilder;
  class(name: string): NodeBuilder;
  image(
    href: string,
    width: number,
    height: number,
    opts?: Omit<NodeImage, 'href' | 'width' | 'height'>
  ): NodeBuilder;
  zIndex(value: number): NodeBuilder;
  animate(type: string, config?: AnimationConfig): NodeBuilder;
  animate(cb: (anim: AnimationBuilder) => unknown): NodeBuilder;

  /** Sugar for `animate(a => a.to(...))`. */
  animateTo(props: AnimatableProps, opts: TweenOptions): NodeBuilder;
  data(payload: unknown): NodeBuilder;
  onClick(handler: (id: string, node: VizNode) => void): NodeBuilder;
  /**
   * Define a named connection port on the node.
   * @param id   Unique port id (e.g. `'top'`, `'out-1'`)
   * @param offset Position relative to the node center `{ x, y }`
   * @param direction Optional outgoing tangent in degrees (0=right, 90=down, 180=left, 270=up)
   */
  port(
    id: string,
    offset: { x: number; y: number },
    direction?: number
  ): NodeBuilder;
  container(config?: ContainerConfig): NodeBuilder;
  parent(parentId: string): NodeBuilder;
  done(): VizBuilder;

  // Seamless chaining extensions
  node(id: string): NodeBuilder;
  node(id: string, opts: NodeOptions): VizBuilder;
  edge(from: string, to: string, id?: string): EdgeBuilder;
  edge(from: string, to: string, opts: EdgeOptions): VizBuilder;
  overlay(cb: (overlay: OverlayBuilder) => unknown): VizBuilder;
  overlay<K extends OverlayId>(
    id: K,
    params: OverlayParams<K>,
    key?: string
  ): VizBuilder;
  overlay<T>(id: string, params: T, key?: string): VizBuilder;
  build(): VizScene;
  svg(): string;
}

interface EdgeBuilder {
  straight(): EdgeBuilder;
  curved(): EdgeBuilder;
  orthogonal(): EdgeBuilder;
  routing(mode: EdgeRouting): EdgeBuilder;
  via(x: number, y: number): EdgeBuilder;
  label(text: string, opts?: Partial<EdgeLabel>): EdgeBuilder;
  /**
   * Set arrow markers. Convenience method.
   * - `arrow(true)` or `arrow()` sets markerEnd to 'arrow'
   * - `arrow(false)` sets markerEnd to 'none'
   * - `arrow('both')` sets both markerStart and markerEnd to 'arrow'
   * - `arrow('start')` sets markerStart to 'arrow'
   * - `arrow('end')` sets markerEnd to 'arrow'
   */
  arrow(enabled?: boolean | 'both' | 'start' | 'end'): EdgeBuilder;
  /** Set the marker type at the end (target) of the edge. */
  markerEnd(type: EdgeMarkerType): EdgeBuilder;
  /** Set the marker type at the start (source) of the edge. */
  markerStart(type: EdgeMarkerType): EdgeBuilder;
  /** Connect the edge to a specific port on the source node. */
  fromPort(portId: string): EdgeBuilder;
  /** Connect the edge to a specific port on the target node. */
  toPort(portId: string): EdgeBuilder;
  connect(anchor: 'center' | 'boundary'): EdgeBuilder;
  /** Sets the fill color of the edge path. */
  fill(color: string): EdgeBuilder;
  /** Sets the stroke color and optional width of the edge path. */
  stroke(color: string, width?: number): EdgeBuilder;
  /** Sets the opacity of the edge. */
  opacity(value: number): EdgeBuilder;
  /** Apply a dashed stroke pattern (`8, 4`). */
  dashed(): EdgeBuilder;
  /** Apply a dotted stroke pattern (`2, 4`). */
  dotted(): EdgeBuilder;
  /** Apply a custom SVG `stroke-dasharray` value, or a preset name (`'dashed'`, `'dotted'`, `'dash-dot'`). */
  dash(
    pattern: 'solid' | 'dashed' | 'dotted' | 'dash-dot' | string
  ): EdgeBuilder;
  class(name: string): EdgeBuilder;
  hitArea(px: number): EdgeBuilder;
  animate(type: string, config?: AnimationConfig): EdgeBuilder;
  animate(cb: (anim: AnimationBuilder) => unknown): EdgeBuilder;

  /** Sugar for `animate(a => a.to(...))`. */
  animateTo(props: AnimatableProps, opts: TweenOptions): EdgeBuilder;
  data(payload: unknown): EdgeBuilder;
  onClick(handler: (id: string, edge: VizEdge) => void): EdgeBuilder;

  /**
   * For self-loops: which side the loop exits from.
   * @default 'top'
   */
  loopSide(side: 'top' | 'right' | 'bottom' | 'left'): EdgeBuilder;

  /**
   * For self-loops: how far the loop extends from the shape boundary.
   * @default 30
   */
  loopSize(size: number): EdgeBuilder;

  done(): VizBuilder;

  // Seamless chaining extensions
  node(id: string): NodeBuilder;
  node(id: string, opts: NodeOptions): VizBuilder;
  edge(from: string, to: string, id?: string): EdgeBuilder;
  edge(from: string, to: string, opts: EdgeOptions): VizBuilder;
  overlay(cb: (overlay: OverlayBuilder) => unknown): VizBuilder;
  overlay<K extends OverlayId>(
    id: K,
    params: OverlayParams<K>,
    key?: string
  ): VizBuilder;
  overlay<T>(id: string, params: T, key?: string): VizBuilder;
  build(): VizScene;
  svg(): string;
}

// ---------------------------------------------------------------------------
// Declarative options helpers
// ---------------------------------------------------------------------------

/** Apply a `NodeOptions` object to a `NodeBuilder` (sugar over chaining). */
function applyNodeOptions(nb: NodeBuilder, opts: NodeOptions): void {
  if (opts.at) nb.at(opts.at.x, opts.at.y);
  if (opts.cell) nb.cell(opts.cell.col, opts.cell.row, opts.cell.align);

  // Shape (first match wins)
  if (opts.circle) nb.circle(opts.circle.r);
  else if (opts.rect) nb.rect(opts.rect.w, opts.rect.h, opts.rect.rx);
  else if (opts.diamond) nb.diamond(opts.diamond.w, opts.diamond.h);
  else if (opts.cylinder)
    nb.cylinder(opts.cylinder.w, opts.cylinder.h, opts.cylinder.arcHeight);
  else if (opts.hexagon) nb.hexagon(opts.hexagon.r, opts.hexagon.orientation);
  else if (opts.ellipse) nb.ellipse(opts.ellipse.rx, opts.ellipse.ry);
  else if (opts.arc)
    nb.arc(opts.arc.r, opts.arc.startAngle, opts.arc.endAngle, opts.arc.closed);
  else if (opts.blockArrow)
    nb.blockArrow(
      opts.blockArrow.length,
      opts.blockArrow.bodyWidth,
      opts.blockArrow.headWidth,
      opts.blockArrow.headLength,
      opts.blockArrow.direction
    );
  else if (opts.callout)
    nb.callout(opts.callout.w, opts.callout.h, {
      rx: opts.callout.rx,
      pointerSide: opts.callout.pointerSide,
      pointerHeight: opts.callout.pointerHeight,
      pointerWidth: opts.callout.pointerWidth,
      pointerPosition: opts.callout.pointerPosition,
    });
  else if (opts.cloud) nb.cloud(opts.cloud.w, opts.cloud.h);
  else if (opts.cross) nb.cross(opts.cross.size, opts.cross.barWidth);
  else if (opts.cube) nb.cube(opts.cube.w, opts.cube.h, opts.cube.depth);
  else if (opts.path) nb.path(opts.path.d, opts.path.w, opts.path.h);
  else if (opts.document)
    nb.document(opts.document.w, opts.document.h, opts.document.waveHeight);
  else if (opts.note) nb.note(opts.note.w, opts.note.h, opts.note.foldSize);
  else if (opts.parallelogram)
    nb.parallelogram(
      opts.parallelogram.w,
      opts.parallelogram.h,
      opts.parallelogram.skew
    );
  else if (opts.star)
    nb.star(opts.star.points, opts.star.outerR, opts.star.innerR);
  else if (opts.trapezoid)
    nb.trapezoid(opts.trapezoid.topW, opts.trapezoid.bottomW, opts.trapezoid.h);
  else if (opts.triangle)
    nb.triangle(opts.triangle.w, opts.triangle.h, opts.triangle.direction);

  // Styling
  if (opts.fill) nb.fill(opts.fill);
  if (opts.stroke) {
    if (typeof opts.stroke === 'string') nb.stroke(opts.stroke);
    else nb.stroke(opts.stroke.color, opts.stroke.width);
  }
  if (opts.opacity !== undefined) nb.opacity(opts.opacity);
  if (opts.className) nb.class(opts.className);
  if (opts.zIndex !== undefined) nb.zIndex(opts.zIndex);

  // Label & Image
  if (opts.label) {
    if (typeof opts.label === 'string') nb.label(opts.label);
    else nb.label(opts.label.text, opts.label);
  }
  if (opts.image) {
    nb.image(opts.image.href, opts.image.width, opts.image.height, opts.image);
  }

  // Extras
  if (opts.data !== undefined) nb.data(opts.data);
  if (opts.onClick) nb.onClick(opts.onClick);

  // Ports
  if (opts.ports) {
    for (const p of opts.ports) nb.port(p.id, p.offset, p.direction);
  }

  // Containment
  if (opts.container) nb.container(opts.container);
  if (opts.parent) nb.parent(opts.parent);
}

/** Apply an `EdgeOptions` object to an `EdgeBuilder` (sugar over chaining). */
function applyEdgeOptions(eb: EdgeBuilder, opts: EdgeOptions): void {
  // Routing
  if (opts.routing) eb.routing(opts.routing);
  if (opts.waypoints) {
    for (const wp of opts.waypoints) eb.via(wp.x, wp.y);
  }

  // Markers
  if (opts.arrow !== undefined) eb.arrow(opts.arrow);
  if (opts.markerStart) eb.markerStart(opts.markerStart);
  if (opts.markerEnd) eb.markerEnd(opts.markerEnd);

  if (opts.loopSide) eb.loopSide(opts.loopSide);
  if (opts.loopSize) eb.loopSize(opts.loopSize);

  // Style
  if (opts.stroke) {
    if (typeof opts.stroke === 'string') eb.stroke(opts.stroke);
    else eb.stroke(opts.stroke.color, opts.stroke.width);
  }
  if (opts.fill) eb.fill(opts.fill);
  if (opts.opacity !== undefined) eb.opacity(opts.opacity);
  if (opts.dash) eb.dash(opts.dash);
  if (opts.className) eb.class(opts.className);

  // Anchor & ports
  if (opts.anchor) eb.connect(opts.anchor);
  if (opts.fromPort) eb.fromPort(opts.fromPort);
  if (opts.toPort) eb.toPort(opts.toPort);

  // Labels
  if (opts.label) {
    if (typeof opts.label === 'string') {
      eb.label(opts.label);
    } else if (Array.isArray(opts.label)) {
      for (const lbl of opts.label) eb.label(lbl.text, lbl);
    } else {
      eb.label(opts.label.text, opts.label);
    }
  }

  // Hit area
  if (opts.hitArea !== undefined) eb.hitArea(opts.hitArea);

  // Extras
  if (opts.data !== undefined) eb.data(opts.data);
  if (opts.onClick) eb.onClick(opts.onClick);
}

class VizBuilderImpl implements VizBuilder {
  private _viewBox = { w: 800, h: 600 };
  private _nodes = new Map<string, Partial<VizNode>>();
  private _edges = new Map<string, Partial<VizEdge>>();
  private _overlays: VizOverlaySpec[] = [];
  private _nodeOrder: string[] = [];
  private _edgeOrder: string[] = [];
  private _gridConfig: VizGridConfig | null = null;
  private _animationSpecs: AnimationSpec[] = [];
  private _mountedContainer: HTMLElement | null = null;
  private _panZoomController?: PanZoomController;

  // Scene Mutation State
  private _changes: SceneChanges = {
    added: { nodes: [], edges: [] },
    removed: { nodes: [], edges: [] },
    updated: { nodes: [], edges: [] },
  };
  private _changeListeners: Array<(changes: SceneChanges) => void> = [];

  // Lifecycle Event System
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _eventListeners: Record<string, Array<(ev: any) => void>> = {
    build: [],
    mount: [],
  };

  on<K extends keyof VizEventMap>(
    event: K,
    callback: (ev: VizEventMap[K]) => void
  ): () => void {
    if (!this._eventListeners[event as string]) {
      this._eventListeners[event as string] = [];
    }
    this._eventListeners[event as string]!.push(callback);
    return () => {
      this._eventListeners[event as string] = this._eventListeners[
        event as string
      ]!.filter((cb) => cb !== callback);
    };
  }

  private _dispatchEvent<K extends keyof VizEventMap>(
    event: K,
    payload: VizEventMap[K]
  ) {
    const listeners = this._eventListeners[event as string];
    if (listeners) {
      listeners.forEach((cb) => cb(payload));
    }
  }

  addNode(node: VizNode): void {
    if (this._nodes.has(node.id)) {
      console.warn(`VizBuilder.addNode: Node ${node.id} already exists`);
      return;
    }
    this._nodes.set(node.id, { ...node });
    this._nodeOrder.push(node.id);
    this._changes.added.nodes.push(node.id);
  }

  removeNode(id: string): void {
    if (!this._nodes.has(id)) return;
    this._nodes.delete(id);
    this._nodeOrder = this._nodeOrder.filter((n) => n !== id);
    this._changes.removed.nodes.push(id);

    // Also remove connected edges
    const edgesToRemove: string[] = [];
    this._edges.forEach((edge) => {
      if (edge.from === id || edge.to === id) {
        edgesToRemove.push(edge.id!);
      }
    });
    edgesToRemove.forEach((edgeId) => this.removeEdge(edgeId));
  }

  updateNode(id: string, patch: Partial<VizNode>): void {
    const node = this._nodes.get(id);
    if (!node) {
      console.warn(`VizBuilder.updateNode: Node ${id} not found`);
      return;
    }

    // Deep merge known nested objects
    const patchedNode = { ...node, ...patch };
    if (patch.pos && node.pos) patchedNode.pos = { ...node.pos, ...patch.pos };
    if (patch.style && node.style)
      patchedNode.style = { ...node.style, ...patch.style };
    if (patch.shape && node.shape)
      patchedNode.shape = { ...node.shape, ...patch.shape } as VizNode['shape'];

    this._nodes.set(id, patchedNode);
    if (!this._changes.added.nodes.includes(id)) {
      if (!this._changes.updated.nodes.includes(id)) {
        this._changes.updated.nodes.push(id);
      }
    }
  }

  addEdge(edge: VizEdge): void {
    if (this._edges.has(edge.id)) {
      console.warn(`VizBuilder.addEdge: Edge ${edge.id} already exists`);
      return;
    }
    this._edges.set(edge.id, { ...edge });
    this._edgeOrder.push(edge.id);
    this._changes.added.edges.push(edge.id);
  }

  removeEdge(id: string): void {
    if (!this._edges.has(id)) return;
    this._edges.delete(id);
    this._edgeOrder = this._edgeOrder.filter((e) => e !== id);
    this._changes.removed.edges.push(id);
  }

  updateEdge(id: string, patch: Partial<VizEdge>): void {
    const edge = this._edges.get(id);
    if (!edge) {
      console.warn(`VizBuilder.updateEdge: Edge ${id} not found`);
      return;
    }
    this._edges.set(id, { ...edge, ...patch });
    if (!this._changes.added.edges.includes(id)) {
      if (!this._changes.updated.edges.includes(id)) {
        this._changes.updated.edges.push(id);
      }
    }
  }

  onChange(cb: (changes: SceneChanges) => void): () => void {
    this._changeListeners.push(cb);
    return () => {
      this._changeListeners = this._changeListeners.filter((l) => l !== cb);
    };
  }

  commit(container: HTMLElement): void {
    const changesObj = this._changes;

    // 1. Notify listeners before resetting tracking state
    if (this._changeListeners.length > 0) {
      // Shallow clone so listeners get a frozen snapshot
      const snapshot: SceneChanges = {
        added: {
          nodes: [...changesObj.added.nodes],
          edges: [...changesObj.added.edges],
        },
        removed: {
          nodes: [...changesObj.removed.nodes],
          edges: [...changesObj.removed.edges],
        },
        updated: {
          nodes: [...changesObj.updated.nodes],
          edges: [...changesObj.updated.edges],
        },
      };

      this._changeListeners.forEach((cb) => cb(snapshot));
    }

    // 2. Reset tracking state immediately
    this._changes = {
      added: { nodes: [], edges: [] },
      removed: { nodes: [], edges: [] },
      updated: { nodes: [], edges: [] },
    };

    // 3. Early exit if no DOM to patch
    if (!container) return;
    const svg = container.querySelector('svg') as SVGSVGElement | null;
    if (!svg) {
      console.warn(
        'VizBuilder.commit: No mounted SVG found in container. Need to call .mount() first.'
      );
      return;
    }

    // Since we maintain the _renderSceneToDOM method which already does an
    // intelligent DOM diffing/reconciliation pass based on the current `_nodes` and `_edges` maps
    // we can simply call it to apply all structural changes (add/remove) and property updates.
    // The reconciliation correctly re-uses existing SVG elements, inserts new ones, and deletes missing ones.
    const scene = this.build();
    this._renderSceneToDOM(scene, container);

    // Apply runtime overrides (if any)
    let ctx = runtimePatchCtxBySvg.get(svg);
    if (!ctx) {
      ctx = createRuntimePatchCtx(svg);
      runtimePatchCtxBySvg.set(svg, ctx);
    }
    patchRuntime(scene, ctx);
  }

  /**
   * Applies a plugin to the builder.
   * @param plugin The plugin
   * @param options Optional configuration
   * @returns The builder
   */
  use<O>(plugin: VizPlugin<O>, options?: O): VizBuilder {
    plugin(this, options);
    return this;
  }

  layout<O>(algorithm: LayoutAlgorithm<O>, options?: O): VizBuilder {
    const scene = this.build(); // gets full constructed VizNode[]
    const graph: LayoutGraph = {
      nodes: scene.nodes,
      edges: scene.edges,
    };

    const result = algorithm(graph, options);

    // Apply computed node positions
    for (const [id, pos] of Object.entries(result.nodes)) {
      this.updateNode(id, { pos });
    }

    // Apply optionally returned edge waypoints
    if (result.edges) {
      for (const [id, edgeResult] of Object.entries(result.edges)) {
        if (edgeResult.waypoints !== undefined) {
          this.updateEdge(id, { waypoints: edgeResult.waypoints });
        }
      }
    }

    return this;
  }

  /**
   * Sets the view box.
   * @param w The width of the view box
   * @param h The height of the view box
   * @returns The builder
   */
  view(w: number, h: number): VizBuilder {
    this._viewBox = { w, h };
    return this;
  }

  /**
   * Sets the grid configuration.
   * @param cols The number of columns
   * @param rows The number of rows
   * @param padding The padding of the grid
   * @returns The builder
   */
  grid(
    cols: number,
    rows: number,
    padding: { x: number; y: number } = { x: 20, y: 20 }
  ): VizBuilder {
    this._gridConfig = { cols, rows, padding };
    return this;
  }

  /**
   * Adds an overlay to the scene.
   * @param id The ID of the overlay
   * @param params The parameters of the overlay
   * @param key The key of the overlay
   * @returns The builder
   */
  overlay<K extends OverlayId>(
    id: K,
    params: OverlayParams<K>,
    key?: string
  ): VizBuilder;
  overlay(cb: (overlay: OverlayBuilder) => unknown): VizBuilder;
  overlay<T>(id: string, params: T, key?: string): VizBuilder;
  overlay(
    arg1: string | ((overlay: OverlayBuilder) => unknown),
    arg2?: unknown,
    arg3?: string
  ): VizBuilder {
    if (typeof arg1 === 'function') {
      const overlay = new OverlayBuilder();
      arg1(overlay);
      this._overlays.push(...overlay.build());
      return this;
    }

    const id = arg1;
    const params = arg2;
    const key = arg3;
    this._overlays.push({ id, params, key });
    return this;
  }

  animate(cb: (anim: AnimationBuilder) => unknown): AnimationSpec {
    const spec = buildAnimationSpec(cb);
    this._animationSpecs.push(spec);
    return spec;
  }

  /**
   * Creates a node.
   * - `node(id)` — returns NodeBuilder for fluent chaining
   * - `node(id, opts)` — configures declaratively and returns VizBuilder
   */
  node(id: string): NodeBuilder;
  node(id: string, opts: NodeOptions): VizBuilder;
  node(id: string, opts?: NodeOptions): NodeBuilder | VizBuilder {
    if (!this._nodes.has(id)) {
      this._nodes.set(id, {
        id,
        pos: { x: 0, y: 0 },
        shape: { kind: 'circle', r: 10 },
      });
      this._nodeOrder.push(id);
    }
    const nb = new NodeBuilderImpl(this, this._nodes.get(id)!);
    if (!opts) return nb;
    applyNodeOptions(nb, opts);
    return this;
  }

  /**
   * Creates an edge between two nodes.
   * - `edge(from, to)` / `edge(from, to, id)` — returns EdgeBuilder for fluent chaining
   * - `edge(from, to, opts)` — configures declaratively and returns VizBuilder
   */
  edge(from: string, to: string, id?: string): EdgeBuilder;
  edge(from: string, to: string, opts: EdgeOptions): VizBuilder;
  edge(
    from: string,
    to: string,
    idOrOpts?: string | EdgeOptions
  ): EdgeBuilder | VizBuilder {
    const isDeclarative =
      idOrOpts !== undefined && typeof idOrOpts !== 'string';
    const edgeId = isDeclarative
      ? (idOrOpts as EdgeOptions).id || `${from}->${to}`
      : (idOrOpts as string | undefined) || `${from}->${to}`;
    if (!this._edges.has(edgeId)) {
      this._edges.set(edgeId, { id: edgeId, from, to });
      this._edgeOrder.push(edgeId);
    }
    const eb = new EdgeBuilderImpl(this, this._edges.get(edgeId)!);
    if (!isDeclarative) return eb;
    applyEdgeOptions(eb, idOrOpts as EdgeOptions);
    return this;
  }

  /**
   * Hydrates the builder from an existing VizScene.
   * @param scene The scene to hydrate from
   * @returns The builder
   */
  fromScene(scene: VizScene): VizBuilder {
    if (scene.viewBox) {
      this.view(scene.viewBox.w, scene.viewBox.h);
    }
    if (scene.grid) {
      this.grid(scene.grid.cols, scene.grid.rows, scene.grid.padding);
    }

    this._nodes.clear();
    this._nodeOrder = [];
    this._edges.clear();
    this._edgeOrder = [];
    this._overlays = [];
    this._animationSpecs = [];

    if (scene.nodes) {
      scene.nodes.forEach((n) => {
        this._nodes.set(n.id, { ...n });
        this._nodeOrder.push(n.id);
      });
    }

    if (scene.edges) {
      scene.edges.forEach((e) => {
        this._edges.set(e.id, { ...e });
        this._edgeOrder.push(e.id);
      });
    }

    if (scene.overlays) {
      this._overlays = [...scene.overlays];
    }

    if (scene.animationSpecs) {
      this._animationSpecs = [...scene.animationSpecs];
    }

    return this;
  }

  /**
   * Builds the scene.
   * @returns The scene
   */
  build(): VizScene {
    this._edges.forEach((edge) => {
      if (!this._nodes.has(edge.from!)) {
        console.warn(
          `VizBuilder: Edge ${edge.id} references missing source node ${edge.from}`
        );
      }
      if (!this._nodes.has(edge.to!)) {
        console.warn(
          `VizBuilder: Edge ${edge.id} references missing target node ${edge.to}`
        );
      }
    });

    const nodes = this._nodeOrder.map((id) => this._nodes.get(id) as VizNode);
    const edges = this._edgeOrder.map((id) => this._edges.get(id) as VizEdge);

    const scene: VizScene = {
      viewBox: this._viewBox,
      grid: this._gridConfig ?? undefined,
      nodes,
      edges,
      overlays: this._overlays,
      animationSpecs:
        this._animationSpecs.length > 0 ? [...this._animationSpecs] : undefined,
    };

    this._dispatchEvent('build', { scene });

    return scene;
  }

  _getGridConfig(): VizGridConfig | null {
    return this._gridConfig;
  }

  _getViewBox() {
    return this._viewBox;
  }

  /**
   * Returns the SVG string representation of the scene.
   * @deprecated Use `mount` instead
   */
  svg(): string {
    const scene = this.build();
    return this._renderSceneToSvg(scene);
  }

  /**
   * Mounts the scene to the DOM.
   * @param container The container to mount the scene into
   */
  mount(
    container: HTMLElement,
    opts?: { autoplay?: boolean; css?: string | string[] } & PanZoomOptions
  ): PanZoomController | undefined {
    const scene = this.build();
    this._renderSceneToDOM(scene, container);
    this._mountedContainer = container;

    const svg = container.querySelector('svg') as SVGSVGElement | null;
    if (svg && opts?.css) this._injectCssIntoMountedSvg(svg, opts.css);

    if (svg && opts?.autoplay) this.play(container, scene.animationSpecs ?? []);

    let controller: PanZoomController | undefined;
    if (svg && opts?.panZoom) {
      const viewport = svg.querySelector('.viz-viewport') as SVGGElement | null;
      if (viewport) {
        controller = setupPanZoom(svg, viewport, scene, opts);
      }
    }

    this._panZoomController = controller;

    this._dispatchEvent('mount', { container, controller });

    return controller;
  }

  /**
   * Tear down a previously mounted scene.
   */
  destroy(): void {
    // 1. Destroy PanZoomController if created
    if (this._panZoomController) {
      this._panZoomController.destroy();
      this._panZoomController = undefined;
    }

    // 2. Clear out mounted container and animations
    if (this._mountedContainer) {
      // Stop any pending animations
      const playback = autoplayControllerByContainer.get(
        this._mountedContainer
      );
      if (playback) {
        playback.stop();
        autoplayControllerByContainer.delete(this._mountedContainer);
      }

      // Remove SVG tree
      const svg = this._mountedContainer.querySelector(
        'svg'
      ) as SVGSVGElement | null;
      if (svg) {
        svg.remove();
      }

      this._mountedContainer = null;
    }
  }

  private _injectCssIntoMountedSvg(svg: SVGSVGElement, css: string | string[]) {
    const cssText = (Array.isArray(css) ? css.join('\n') : css).trim();
    if (!cssText) return;

    const attr = 'data-viz-user-css';
    const existing = svg.querySelector(
      `style[${attr}="true"]`
    ) as HTMLStyleElement | null;

    if (existing) {
      const prior = existing.textContent ?? '';
      if (prior.includes(cssText)) return;
      existing.textContent = `${prior}\n${cssText}`.trim();
      return;
    }

    const style = document.createElement('style');
    style.setAttribute(attr, 'true');
    style.setAttribute('type', 'text/css');
    style.textContent = cssText;

    // Prefer placing custom CSS right after the default VizCraft CSS.
    const firstStyle = svg.querySelector('style');
    if (firstStyle && firstStyle.parentNode === svg) {
      svg.insertBefore(style, firstStyle.nextSibling);
    } else {
      svg.prepend(style);
    }
  }

  play(): PlaybackController | null;
  play(container: HTMLElement): PlaybackController | null;
  play(container: HTMLElement, spec: AnimationSpec): PlaybackController;
  play(container: HTMLElement, spec: AnimationSpec[]): PlaybackController;
  play(
    containerOrNothing?: HTMLElement,
    specOrSpecs?: AnimationSpec | AnimationSpec[]
  ): PlaybackController | null {
    if (!containerOrNothing) {
      const container = this._mountedContainer;
      if (!container) {
        console.warn('VizBuilder: Call mount(container) before play().');
        return null;
      }

      const svg = container.querySelector('svg') as SVGSVGElement | null;
      if (!svg) {
        console.warn('VizBuilder: Call mount(container) before play().');
        return null;
      }

      // No-arg play() intentionally does not auto-mount.
      return this._playImpl(container, undefined, false);
    }

    return this._playImpl(containerOrNothing, specOrSpecs, true);
  }

  private _playImpl(
    container: HTMLElement,
    specOrSpecs: AnimationSpec | AnimationSpec[] | undefined,
    allowAutoMount: boolean
  ): PlaybackController | null {
    const svg = container.querySelector('svg') as SVGSVGElement | null;
    if (!svg) {
      if (!allowAutoMount) return null;
      this.mount(container);
    }

    const scene = this.build();
    const specs: AnimationSpec[] = Array.isArray(specOrSpecs)
      ? specOrSpecs
      : specOrSpecs
        ? [specOrSpecs]
        : (scene.animationSpecs ?? []);

    if (!specOrSpecs && specs.length === 0) return null;

    const adapterExtensions: ExtendAdapter[] = [];
    for (const s of specs) {
      adapterExtensions.push(...getAdapterExtensions(s));
    }

    // Stop any prior playback for this container.
    autoplayControllerByContainer.get(container)?.stop();

    // Play all specs together (tweens already carry their own delays).
    const combined: AnimationSpec = {
      version: 'viz-anim/1',
      tweens: specs.flatMap((s) => s.tweens),
    };

    const controller = createBuilderPlayback({
      builder: this,
      container,
      extendAdapter:
        adapterExtensions.length > 0
          ? (adapter) => {
              for (const ext of adapterExtensions) ext(adapter);
            }
          : undefined,
    });
    controller.load(combined);
    if (combined.tweens.length > 0) controller.play();
    autoplayControllerByContainer.set(container, controller);
    return controller;
  }

  resizeNode(
    id: string,
    dims: { w?: number; h?: number; r?: number }
  ): VizBuilder {
    const node = this._nodes.get(id);
    if (!node) return this;
    node.runtime = node.runtime || {};
    if (dims.w !== undefined) node.runtime.width = dims.w;
    if (dims.h !== undefined) node.runtime.height = dims.h;
    if (dims.r !== undefined) node.runtime.radius = dims.r;
    return this;
  }

  patchRuntime(container: HTMLElement) {
    const scene = this.build();
    const svg = container.querySelector('svg') as SVGSVGElement | null;

    // If not mounted yet, fall back to full mount.
    if (!svg) {
      this._renderSceneToDOM(scene, container);
      return;
    }

    let ctx = runtimePatchCtxBySvg.get(svg);
    if (!ctx) {
      ctx = createRuntimePatchCtx(svg);
      runtimePatchCtxBySvg.set(svg, ctx);
    }

    patchRuntime(scene, ctx);

    // Keep overlays in sync during animation playback.
    //
    // Animations flush via `patchRuntime()` (to avoid full re-mounts). Nodes/edges
    // are patched via `runtimePatcher`, but overlays are registry-rendered and
    // need an explicit reconcile pass to reflect animated `spec.params` changes.
    const overlayLayer =
      (svg.querySelector(
        '[data-viz-layer="overlays"]'
      ) as SVGGElement | null) ||
      (svg.querySelector('.viz-layer-overlays') as SVGGElement | null);

    if (overlayLayer) {
      const overlays = scene.overlays ?? [];
      const nodesById = new Map(scene.nodes.map((n) => [n.id, n]));
      const edgesById = new Map(scene.edges.map((e) => [e.id, e]));

      const svgNS = 'http://www.w3.org/2000/svg';

      // 1) Map existing overlay groups
      const existingOverlayGroups = Array.from(overlayLayer.children).filter(
        (el) => el.tagName === 'g'
      ) as SVGGElement[];
      const existingOverlaysMap = new Map<string, SVGGElement>();
      existingOverlayGroups.forEach((el) => {
        const id = el.getAttribute('data-overlay-id');
        if (id) existingOverlaysMap.set(id, el);
      });

      // Fast decision: if nothing is dirty and keys match, skip overlay work.
      const overlayKeyCountMatches =
        overlays.length === existingOverlaysMap.size;
      let needsOverlayPass = !overlayKeyCountMatches;
      const dirtyOverlays: VizOverlaySpec[] = [];
      if (!needsOverlayPass) {
        for (const spec of overlays) {
          const uniqueKey = spec.key || spec.id;
          if (!existingOverlaysMap.has(uniqueKey)) {
            needsOverlayPass = true;
            break;
          }
          if (
            (spec as unknown as Record<symbol, unknown>)[OVERLAY_RUNTIME_DIRTY]
          ) {
            dirtyOverlays.push(spec);
          }
        }
      }

      if (!needsOverlayPass && dirtyOverlays.length === 0) return;

      const processedOverlayIds = new Set<string>();

      // 2) Render/update overlays
      const toUpdate = needsOverlayPass ? overlays : dirtyOverlays;

      toUpdate.forEach((spec) => {
        const renderer = defaultCoreOverlayRegistry.get(spec.id);
        if (!renderer) return;

        const uniqueKey = spec.key || spec.id;
        processedOverlayIds.add(uniqueKey);

        let group = existingOverlaysMap.get(uniqueKey);
        if (!group) {
          group = document.createElementNS(svgNS, 'g');
          group.setAttribute('data-overlay-id', uniqueKey);
          group.setAttribute('data-viz-role', 'overlay-group');
          overlayLayer.appendChild(group);
        }

        // Keep wrapper class in sync even when reusing an existing group.
        const expectedClass = `viz-overlay-${spec.id}${
          spec.className ? ` ${spec.className}` : ''
        }`;
        const currentClass = group.getAttribute('class');
        if (currentClass !== expectedClass) {
          group.setAttribute('class', expectedClass);
        }

        const overlayCtx = {
          spec,
          nodesById,
          edgesById,
          scene,
          registry: defaultCoreOverlayRegistry,
        };

        if (renderer.update) {
          renderer.update(overlayCtx, group);
        } else {
          group.innerHTML = renderer.render(overlayCtx);
        }

        // Clear dirty flag after successful update.
        delete (spec as unknown as Record<symbol, unknown>)[
          OVERLAY_RUNTIME_DIRTY
        ];
      });

      // 3) Remove stale overlays only if keys may have changed.
      if (!overlayKeyCountMatches) {
        existingOverlayGroups.forEach((el) => {
          const id = el.getAttribute('data-overlay-id');
          if (id && !processedOverlayIds.has(id)) {
            el.remove();
          }
        });
      }
    }
  }

  /**
   * Renders the scene to the DOM.
   * @param scene The scene to render
   * @param container The container to render the scene into
   */
  private _renderSceneToDOM(scene: VizScene, container: HTMLElement) {
    const { viewBox, nodes, edges, overlays } = scene;
    const nodesById = new Map(nodes.map((n) => [n.id, n]));

    const svgNS = 'http://www.w3.org/2000/svg';
    let svg = container.querySelector('svg') as SVGSVGElement;

    // Initial Render if SVG doesn't exist
    if (!svg) {
      container.innerHTML = ''; // Safety clear
      svg = document.createElementNS(svgNS, 'svg');
      svg.style.width = '100%';
      svg.style.height = '100%';
      svg.style.overflow = 'visible';

      // Inject Styles
      const style = document.createElement('style');
      style.textContent = DEFAULT_VIZ_CSS;
      svg.appendChild(style);

      // Defs — marker definitions only for marker types/positions actually used
      const defs = document.createElementNS(svgNS, 'defs');

      // Collect the set of (markerType, color, position) tuples actually needed
      // and pre-generate their SVG content strings.
      const neededMarkers = new Set<string>();
      const markerSvgById = new Map<string, string>();
      edges.forEach((e) => {
        const stroke = e.style?.stroke;
        if (e.markerEnd && e.markerEnd !== 'none') {
          const mid = markerIdFor(e.markerEnd, stroke, 'end');
          if (!neededMarkers.has(mid)) {
            neededMarkers.add(mid);
            markerSvgById.set(
              mid,
              generateMarkerSvg(
                e.markerEnd,
                stroke ?? 'currentColor',
                mid,
                'end'
              )
            );
          }
        }
        if (e.markerStart && e.markerStart !== 'none') {
          const mid = markerIdFor(e.markerStart, stroke, 'start');
          if (!neededMarkers.has(mid)) {
            neededMarkers.add(mid);
            markerSvgById.set(
              mid,
              generateMarkerSvg(
                e.markerStart,
                stroke ?? 'currentColor',
                mid,
                'start'
              )
            );
          }
        }
      });

      neededMarkers.forEach((mid) => {
        const markerEl = document.createElementNS(svgNS, 'marker');
        markerEl.setAttribute('id', mid);
        markerEl.setAttribute('viewBox', '0 0 10 10');
        markerEl.setAttribute('markerWidth', '10');
        markerEl.setAttribute('markerHeight', '10');
        markerEl.setAttribute('refX', '9');
        markerEl.setAttribute('refY', '5');
        const isStart = mid.includes('-start');
        markerEl.setAttribute(
          'orient',
          isStart ? 'auto-start-reverse' : 'auto'
        );
        const tmp = document.createElementNS(svgNS, 'svg');
        tmp.innerHTML = markerSvgById.get(mid) ?? '';
        const parsed = tmp.querySelector('marker');
        if (parsed) {
          while (parsed.firstChild) {
            markerEl.appendChild(parsed.firstChild);
          }
        }
        defs.appendChild(markerEl);
      });

      svg.appendChild(defs);

      // Layers
      const viewport = document.createElementNS(svgNS, 'g');
      viewport.setAttribute('class', 'viz-viewport');
      svg.appendChild(viewport);

      const edgeLayer = document.createElementNS(svgNS, 'g');
      edgeLayer.setAttribute('class', 'viz-layer-edges');
      edgeLayer.setAttribute('data-viz-layer', 'edges');
      viewport.appendChild(edgeLayer);

      const nodeLayer = document.createElementNS(svgNS, 'g');
      nodeLayer.setAttribute('class', 'viz-layer-nodes');
      nodeLayer.setAttribute('data-viz-layer', 'nodes');
      viewport.appendChild(nodeLayer);

      const overlayLayer = document.createElementNS(svgNS, 'g');
      overlayLayer.setAttribute('class', 'viz-layer-overlays');
      overlayLayer.setAttribute('data-viz-layer', 'overlays');
      viewport.appendChild(overlayLayer);

      container.appendChild(svg);
    }

    // Update ViewBox
    svg.setAttribute('viewBox', `0 0 ${viewBox.w} ${viewBox.h}`);

    const edgeLayer =
      (svg.querySelector('[data-viz-layer="edges"]') as SVGGElement | null) ||
      (svg.querySelector('.viz-layer-edges') as SVGGElement | null);
    const nodeLayer =
      (svg.querySelector('[data-viz-layer="nodes"]') as SVGGElement | null) ||
      (svg.querySelector('.viz-layer-nodes') as SVGGElement | null);
    const overlayLayer =
      (svg.querySelector(
        '[data-viz-layer="overlays"]'
      ) as SVGGElement | null) ||
      (svg.querySelector('.viz-layer-overlays') as SVGGElement | null);

    if (!edgeLayer || !nodeLayer || !overlayLayer) {
      // Defensive: if the SVG exists but layers are missing, re-mount cleanly.
      this._renderSceneToDOM(scene, container);
      return;
    }

    // --- 1. Reconcile Edges ---
    const existingEdgeGroups = Array.from(edgeLayer.children).filter(
      (el) => el.tagName === 'g'
    ) as SVGGElement[];
    const existingEdgesMap = new Map<string, SVGGElement>();
    existingEdgeGroups.forEach((el) => {
      const id = el.getAttribute('data-id');
      if (id) existingEdgesMap.set(id, el);
    });

    const processedEdgeIds = new Set<string>();

    edges.forEach((edge) => {
      const start = nodesById.get(edge.from);
      const end = nodesById.get(edge.to);
      if (!start || !end) return;

      processedEdgeIds.add(edge.id);

      let group = existingEdgesMap.get(edge.id);
      if (!group) {
        group = document.createElementNS(svgNS, 'g');
        group.setAttribute('data-id', edge.id);
        group.setAttribute('data-viz-role', 'edge-group');
        edgeLayer.appendChild(group);

        // Initial creation of children
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('class', 'viz-edge');
        path.setAttribute('data-viz-role', 'edge-line');
        group.appendChild(path);

        // Optional parts created on demand later, but structure expected
      }

      // Compute Classes & Styles
      let classes = `viz-edge-group ${edge.className || ''}`;
      // Reset styles
      group.removeAttribute('style');

      if (edge.animations) {
        edge.animations.forEach((spec) => {
          if (spec.when === false) return;
          const renderer = defaultCoreAnimationRegistry.getEdgeRenderer(
            spec.id
          );
          if (renderer) {
            if (renderer.getClass)
              classes += ` ${renderer.getClass({ spec, element: edge })}`;
            if (renderer.getStyle) {
              const s = renderer.getStyle({ spec, element: edge });
              Object.entries(s).forEach(([k, v]) => {
                group!.style.setProperty(k, String(v));
              });
            }
          } else {
            classes += ` ${animFallbackClass(spec.id)}`;
            animFallbackStyleEntries(spec.params).forEach(([k, v]) => {
              group!.style.setProperty(k, v);
            });
          }
        });
      }
      group.setAttribute('class', classes);

      // Use effective positions (handles runtime overrides internally via helper)
      let edgePath;
      if (start === end) {
        edgePath = computeSelfLoop(start, edge);
      } else {
        const endpoints = computeEdgeEndpoints(start, end, edge);
        edgePath = computeEdgePath(
          endpoints.start,
          endpoints.end,
          edge.routing,
          edge.waypoints
        );
      }

      // Apply Edge Runtime Overrides
      if (edge.runtime?.opacity !== undefined) {
        group.style.opacity = String(edge.runtime.opacity);
      } else {
        group.style.removeProperty('opacity');
      }

      // Update Path
      const line =
        (group.querySelector(
          '[data-viz-role="edge-line"]'
        ) as SVGPathElement | null) ||
        (group.querySelector('.viz-edge') as SVGPathElement | null);

      if (!line) return;

      if (edge.runtime?.strokeDashoffset !== undefined) {
        line.style.strokeDashoffset = String(edge.runtime.strokeDashoffset);
        // Optional: Also set attribute for consistency/export, though style usually wins
        line.setAttribute(
          'stroke-dashoffset',
          String(edge.runtime.strokeDashoffset)
        );
      } else {
        line.style.removeProperty('stroke-dashoffset');
        line.removeAttribute('stroke-dashoffset');
      }
      line.setAttribute('d', edgePath.d);

      // Update marker-end
      if (edge.markerEnd && edge.markerEnd !== 'none') {
        const mid = markerIdFor(edge.markerEnd, edge.style?.stroke, 'end');
        line.setAttribute('marker-end', `url(#${mid})`);
      } else {
        line.removeAttribute('marker-end');
      }

      // Update marker-start
      if (edge.markerStart && edge.markerStart !== 'none') {
        const mid = markerIdFor(edge.markerStart, edge.style?.stroke, 'start');
        line.setAttribute('marker-start', `url(#${mid})`);
      } else {
        line.removeAttribute('marker-start');
      }

      // Per-edge style overrides (inline style wins over CSS class defaults)
      if (edge.style?.stroke !== undefined) {
        line.style.stroke = edge.style.stroke;
      } else {
        line.style.removeProperty('stroke');
      }
      if (edge.style?.strokeWidth !== undefined)
        line.style.strokeWidth = String(edge.style.strokeWidth);
      else line.style.removeProperty('stroke-width');
      if (edge.style?.fill !== undefined) line.style.fill = edge.style.fill;
      else line.style.removeProperty('fill');
      if (edge.style?.opacity !== undefined)
        line.style.opacity = String(edge.style.opacity);
      else line.style.removeProperty('opacity');
      if (edge.style?.strokeDasharray !== undefined) {
        line.style.strokeDasharray = resolveDasharray(
          edge.style.strokeDasharray
        );
      } else {
        line.style.removeProperty('stroke-dasharray');
      }

      const oldHit =
        group.querySelector('[data-viz-role="edge-hit"]') ||
        group.querySelector('.viz-edge-hit');
      if (oldHit) oldHit.remove();

      if (edge.hitArea || edge.onClick) {
        const hit = document.createElementNS(svgNS, 'path');
        hit.setAttribute('class', 'viz-edge-hit'); // Add class for selection
        hit.setAttribute('data-viz-role', 'edge-hit');
        hit.setAttribute('d', edgePath.d);
        hit.setAttribute('stroke', 'transparent');
        hit.setAttribute('stroke-width', String(edge.hitArea || 10));
        hit.style.cursor = edge.onClick ? 'pointer' : '';
        if (edge.onClick) {
          hit.addEventListener('click', (e) => {
            e.stopPropagation();
            edge.onClick!(edge.id, edge);
          });
        }
        group.appendChild(hit);
      }

      // Labels (remove all old, re-create from labels[])
      group
        .querySelectorAll('[data-viz-role="edge-label"],.viz-edge-label')
        .forEach((el) => el.remove());

      const allLabels = collectEdgeLabels(edge);
      allLabels.forEach((lbl, idx) => {
        const pos = resolveEdgeLabelPosition(lbl, edgePath);
        const labelClass = `viz-edge-label ${lbl.className || ''}`;

        const edgeLabelSvg = renderSvgText(pos.x, pos.y, lbl.text, {
          className: labelClass,
          textAnchor: 'middle',
          dominantBaseline: 'middle',
          maxWidth: lbl.maxWidth,
          lineHeight: lbl.lineHeight,
          verticalAlign: lbl.verticalAlign,
          overflow: lbl.overflow,
        }).replace(
          '<text ',
          `<text data-viz-role="edge-label" data-label-index="${idx}" data-label-position="${lbl.position}" `
        );

        group.insertAdjacentHTML('beforeend', edgeLabelSvg);
      });
    });

    // Remove stale edges
    existingEdgeGroups.forEach((el) => {
      const id = el.getAttribute('data-id');
      if (id && !processedEdgeIds.has(id)) {
        el.remove();
      }
    });

    // --- 2. Reconcile Nodes ---

    // Build parent→children map for container grouping
    const childrenByParentDOM = new Map<string, VizNode[]>();
    const rootNodesDOM: VizNode[] = [];
    nodes.forEach((n) => {
      if (n.parentId) {
        let arr = childrenByParentDOM.get(n.parentId);
        if (!arr) {
          arr = [];
          childrenByParentDOM.set(n.parentId, arr);
        }
        arr.push(n);
      } else {
        rootNodesDOM.push(n);
      }
    });

    // Sort by zIndex (stable sort relies on array insertion order if zIndex is equal)
    rootNodesDOM.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    childrenByParentDOM.forEach((arr) =>
      arr.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
    );

    // Collect ALL existing node groups (including nested inside containers)
    const existingNodeGroups = Array.from(
      nodeLayer.querySelectorAll('g[data-viz-role="node-group"]')
    ) as SVGGElement[];
    const existingNodesMap = new Map<string, SVGGElement>();
    existingNodeGroups.forEach((el) => {
      const id = el.getAttribute('data-id');
      if (id) existingNodesMap.set(id, el);
    });

    const processedNodeIds = new Set<string>();

    const reconcileNodeDOM = (node: VizNode, parentGroup: Element): void => {
      processedNodeIds.add(node.id);

      let group = existingNodesMap.get(node.id);

      if (!group) {
        group = document.createElementNS(svgNS, 'g');
        group.setAttribute('data-id', node.id);
        group.setAttribute('data-viz-role', 'node-group');
      }

      // Always append to ensure DOM order matches z-index order
      parentGroup.appendChild(group);

      const isContainer = !!node.container;

      // Calculate Anim Classes
      let classes = `viz-node-group${isContainer ? ' viz-container' : ''} ${node.className || ''}`;
      group.removeAttribute('style');

      if (node.animations) {
        node.animations.forEach((spec) => {
          if (spec.when === false) return;
          const renderer = defaultCoreAnimationRegistry.getNodeRenderer(
            spec.id
          );
          if (renderer) {
            if (renderer.getClass)
              classes += ` ${renderer.getClass({ spec, element: node })}`;
            if (renderer.getStyle) {
              const s = renderer.getStyle({ spec, element: node });
              Object.entries(s).forEach(([k, v]) => {
                group!.style.setProperty(k, String(v));
              });
            }
          } else {
            classes += ` ${animFallbackClass(spec.id)}`;
            animFallbackStyleEntries(spec.params).forEach(([k, v]) => {
              group!.style.setProperty(k, v);
            });
          }
        });
      }
      group.setAttribute('class', classes);

      // @ts-expect-error: Property _clickHandler does not exist on SVGGElement
      group._clickHandler = node.onClick
        ? (e: MouseEvent) => {
            e.stopPropagation();
            node.onClick!(node.id, node);
          }
        : null;

      if (!group.hasAttribute('data-click-initialized')) {
        group.addEventListener('click', (e) => {
          // @ts-expect-error: Property _clickHandler does not exist on SVGGElement
          if (group._clickHandler) group._clickHandler(e);
        });
        group.setAttribute('data-click-initialized', 'true');
      }

      group.style.cursor = node.onClick ? 'pointer' : '';

      // Shape (Update geometry)
      const { x, y } = effectivePos(node);

      let shape =
        (group.querySelector(
          '[data-viz-role="node-shape"]'
        ) as SVGElement | null) ||
        (group.querySelector('.viz-node-shape') as SVGElement | null);

      const behavior = getShapeBehavior(node.shape);
      const expectedTag = behavior.tagName;

      if (!shape || shape.tagName !== expectedTag) {
        if (shape) shape.remove();
        shape = document.createElementNS(svgNS, expectedTag);
        shape!.setAttribute('class', 'viz-node-shape');
        shape!.setAttribute('data-viz-role', 'node-shape');
        group.prepend(shape!);
      }

      applyShapeGeometry(shape!, node.shape, { x, y });

      setSvgAttributes(shape!, {
        fill: node.style?.fill ?? 'none',
        stroke: node.style?.stroke ?? '#111',
        'stroke-width': node.style?.strokeWidth ?? 2,
        opacity: node.runtime?.opacity ?? node.style?.opacity,
      });

      // Container header line
      if (
        isContainer &&
        node.container!.headerHeight &&
        'w' in node.shape &&
        'h' in node.shape
      ) {
        const sw = (node.shape as { w: number }).w;
        const sh = (node.shape as { h: number }).h;
        const headerY = y - sh / 2 + node.container!.headerHeight;

        let headerLine = group.querySelector(
          '[data-viz-role="container-header"]'
        ) as SVGLineElement | null;
        if (!headerLine) {
          headerLine = document.createElementNS(svgNS, 'line');
          headerLine.setAttribute('class', 'viz-container-header');
          headerLine.setAttribute('data-viz-role', 'container-header');
          group.appendChild(headerLine);
        }
        headerLine.setAttribute('x1', String(x - sw / 2));
        headerLine.setAttribute('y1', String(headerY));
        headerLine.setAttribute('x2', String(x + sw / 2));
        headerLine.setAttribute('y2', String(headerY));
        headerLine.setAttribute('stroke', node.style?.stroke ?? '#111');
        headerLine.setAttribute(
          'stroke-width',
          String(node.style?.strokeWidth ?? 2)
        );
      } else {
        // Remove stale header line if no longer a container with headerHeight
        const staleHeader = group.querySelector(
          '[data-viz-role="container-header"]'
        );
        if (staleHeader) staleHeader.remove();
      }

      // Label & Image coordinate computation
      let lx = x + (node.label?.dx || 0);
      let ly = y + (node.label?.dy || 0);
      let showLabel = !!node.label;

      if (
        node.label &&
        isContainer &&
        node.container!.headerHeight &&
        'h' in node.shape &&
        !node.label.dy
      ) {
        const sh = (node.shape as { h: number }).h;
        ly = y - sh / 2 + node.container!.headerHeight / 2;
        lx = x + (node.label.dx || 0);
      }

      let ix = x;
      let iy = y;

      if (node.image) {
        const { width, height, position, dx = 0, dy = 0 } = node.image;
        ix = x - width / 2 + dx;
        iy = y - height / 2 + dy;

        if (node.label && position) {
          if (position === 'replace') {
            showLabel = false;
          } else if (position === 'above') {
            iy -= 15;
            ly += height / 2 + 5;
          } else if (position === 'below') {
            iy += 15;
            ly -= height / 2 + 5;
          } else if (position === 'left') {
            ix -= 15;
            lx += width / 2 + 5;
          } else if (position === 'right') {
            ix += 15;
            lx -= width / 2 + 5;
          }
        }
      }

      // Render Label
      let label =
        (group.querySelector(
          '[data-viz-role="node-label"]'
        ) as SVGTextElement | null) ||
        (group.querySelector('.viz-node-label') as SVGTextElement | null);
      if (label) {
        label.remove();
        label = null;
      }

      if (node.label && showLabel) {
        const labelClass = `viz-node-label ${node.label.className || ''}`;
        const nodeLabelSvg = renderSvgText(lx, ly, node.label.text, {
          className: labelClass,
          fill: node.label.fill,
          fontSize: node.label.fontSize,
          fontWeight: node.label.fontWeight,
          textAnchor: node.label.textAnchor || 'middle',
          dominantBaseline: node.label.dominantBaseline || 'middle',
          maxWidth: node.label.maxWidth,
          lineHeight: node.label.lineHeight,
          verticalAlign: node.label.verticalAlign,
          overflow: node.label.overflow,
        }).replace('<text ', '<text data-viz-role="node-label" ');

        group.insertAdjacentHTML('beforeend', nodeLabelSvg);
        label = group.querySelector(
          '[data-viz-role="node-label"]'
        ) as SVGTextElement | null;
      }

      // Render Image
      let img = group.querySelector(
        '[data-viz-role="node-image"]'
      ) as SVGImageElement | null;
      if (img) img.remove();

      if (node.image) {
        const { href, width, height } = node.image;
        const imgEl = document.createElementNS(svgNS, 'image');
        imgEl.setAttribute('href', href);
        imgEl.setAttribute('x', String(ix));
        imgEl.setAttribute('y', String(iy));
        imgEl.setAttribute('width', String(width));
        imgEl.setAttribute('height', String(height));
        imgEl.setAttribute('data-viz-role', 'node-image');
        group.insertBefore(imgEl, label || group.firstChild);
      }

      // Ports — render small circles at each explicit port position.
      // Remove stale ports first, then recreate from current spec.
      const oldPorts = group.querySelectorAll('[data-viz-role="port"]');
      oldPorts.forEach((el) => el.remove());

      if (node.ports && node.ports.length > 0) {
        node.ports.forEach((port) => {
          const portEl = document.createElementNS(svgNS, 'circle');
          portEl.setAttribute('cx', String(x + port.offset.x));
          portEl.setAttribute('cy', String(y + port.offset.y));
          portEl.setAttribute('r', '4');
          portEl.setAttribute('class', 'viz-port');
          portEl.setAttribute('data-viz-role', 'port');
          portEl.setAttribute('data-node', node.id);
          portEl.setAttribute('data-port', port.id);
          group!.appendChild(portEl);
        });
      }

      // Container children
      const children = childrenByParentDOM.get(node.id);
      if (children && children.length > 0) {
        let childrenGroup = group.querySelector(
          ':scope > [data-viz-role="container-children"]'
        ) as SVGGElement | null;
        if (!childrenGroup) {
          childrenGroup = document.createElementNS(svgNS, 'g');
          childrenGroup.setAttribute('class', 'viz-container-children');
          childrenGroup.setAttribute('data-viz-role', 'container-children');
          group.appendChild(childrenGroup);
        }
        children.forEach((child) => reconcileNodeDOM(child, childrenGroup!));
      } else {
        // Remove stale children group
        const staleChildren = group.querySelector(
          ':scope > [data-viz-role="container-children"]'
        );
        if (staleChildren) staleChildren.remove();
      }
    };

    // Reconcile root nodes only; children are reconciled recursively
    rootNodesDOM.forEach((node) => reconcileNodeDOM(node, nodeLayer));

    // Remove stale nodes (from anywhere in the tree)
    existingNodeGroups.forEach((el) => {
      const id = el.getAttribute('data-id');
      if (id && !processedNodeIds.has(id)) {
        el.remove();
      }
    });

    // --- 3. Reconcile Overlays (Smart) ---

    // 1. Map existing overlay groups
    const existingOverlayGroups = Array.from(overlayLayer.children).filter(
      (el) => el.tagName === 'g'
    ) as SVGGElement[];
    const existingOverlaysMap = new Map<string, SVGGElement>();
    existingOverlayGroups.forEach((el) => {
      const id = el.getAttribute('data-overlay-id');
      if (id) existingOverlaysMap.set(id, el);
    });

    const processedOverlayIds = new Set<string>();

    if (overlays && overlays.length > 0) {
      overlays.forEach((spec) => {
        const renderer = defaultCoreOverlayRegistry.get(spec.id);
        if (renderer) {
          const uniqueKey = spec.key || spec.id;
          processedOverlayIds.add(uniqueKey);

          let group = existingOverlaysMap.get(uniqueKey);
          if (!group) {
            group = document.createElementNS(svgNS, 'g');
            group.setAttribute('data-overlay-id', uniqueKey);
            group.setAttribute('data-viz-role', 'overlay-group');
            overlayLayer.appendChild(group);
          }

          // Keep wrapper class in sync even when reusing an existing group.
          group.setAttribute(
            'class',
            `viz-overlay-${spec.id}${spec.className ? ` ${spec.className}` : ''}`
          );

          const ctx = {
            spec,
            nodesById,
            edgesById: new Map(edges.map((e) => [e.id, e])),
            scene,
            registry: defaultCoreOverlayRegistry,
          };

          if (renderer.update) {
            renderer.update(ctx, group);
          } else {
            // Fallback: full re-render of this overlay's content
            group.innerHTML = renderer.render(ctx);
          }
        }
      });
    }

    // Remove stale overlays
    existingOverlayGroups.forEach((el) => {
      const id = el.getAttribute('data-overlay-id');
      if (id && !processedOverlayIds.has(id)) {
        el.remove();
      }
    });

    // Build/refresh patch context after reconcile so animation flush can patch in-place.
    runtimePatchCtxBySvg.set(svg, createRuntimePatchCtx(svg));
  }

  /**
   * Returns the SVG string representation of the scene.
   * @deprecated The use of this method is deprecated. Use `mount` instead.
   * @param scene The scene to render
   * @returns The SVG string representation of the scene
   */
  private _renderSceneToSvg(scene: VizScene): string {
    const { viewBox, nodes, edges, overlays } = scene;
    const nodesById = new Map(nodes.map((n) => [n.id, n]));
    const edgesById = new Map(edges.map((e) => [e.id, e]));

    let svgContent = `<svg viewBox="0 0 ${viewBox.w} ${viewBox.h}" xmlns="http://www.w3.org/2000/svg">`;

    // Inject Styles
    svgContent += `<style>${DEFAULT_VIZ_CSS}</style>`;

    // Defs (Marker definitions for all marker types)
    svgContent += `
        <defs>`;

    // Only generate marker defs for types/positions actually used by edges
    const markerDefinitions = new Set<string>();
    edges.forEach((e) => {
      const stroke = e.style?.stroke;
      if (e.markerEnd && e.markerEnd !== 'none') {
        const mid = markerIdFor(e.markerEnd, stroke, 'end');
        if (!markerDefinitions.has(mid)) {
          markerDefinitions.add(mid);
          svgContent += generateMarkerSvg(
            e.markerEnd,
            stroke ?? 'currentColor',
            mid,
            'end'
          );
        }
      }
      if (e.markerStart && e.markerStart !== 'none') {
        const mid = markerIdFor(e.markerStart, stroke, 'start');
        if (!markerDefinitions.has(mid)) {
          markerDefinitions.add(mid);
          svgContent += generateMarkerSvg(
            e.markerStart,
            stroke ?? 'currentColor',
            mid,
            'start'
          );
        }
      }
    });

    svgContent += `
        </defs>`;

    // Render Edges
    svgContent += '<g class="viz-layer-edges" data-viz-layer="edges">';
    edges.forEach((edge) => {
      const start = nodesById.get(edge.from);
      const end = nodesById.get(edge.to);
      if (!start || !end) return;

      // Animations
      let animClasses = '';
      let animStyleStr = '';

      if (edge.animations) {
        edge.animations.forEach((spec) => {
          if (spec.when === false) return;
          const renderer = defaultCoreAnimationRegistry.getEdgeRenderer(
            spec.id
          );
          if (renderer) {
            if (renderer.getClass) {
              animClasses += ` ${renderer.getClass({ spec, element: edge })}`;
            }
            if (renderer.getStyle) {
              const styles = renderer.getStyle({ spec, element: edge });
              Object.entries(styles).forEach(([k, v]) => {
                animStyleStr += `${k}: ${v}; `;
              });
            }
          } else {
            animClasses += ` ${animFallbackClass(spec.id)}`;
            animFallbackStyleEntries(spec.params).forEach(([k, v]) => {
              animStyleStr += `${k}: ${v}; `;
            });
          }
        });
      }

      const markerEnd =
        edge.markerEnd && edge.markerEnd !== 'none'
          ? `marker-end="url(#${markerIdFor(edge.markerEnd, edge.style?.stroke, 'end')})"`
          : '';

      const markerStart =
        edge.markerStart && edge.markerStart !== 'none'
          ? `marker-start="url(#${markerIdFor(edge.markerStart, edge.style?.stroke, 'start')})"`
          : '';

      let edgePath;
      if (start === end) {
        edgePath = computeSelfLoop(start, edge);
      } else {
        const endpoints = computeEdgeEndpoints(start, end, edge);
        edgePath = computeEdgePath(
          endpoints.start,
          endpoints.end,
          edge.routing,
          edge.waypoints
        );
      }

      // Runtime overrides for SVG export
      let runtimeStyle = '';
      if (edge.runtime?.opacity !== undefined) {
        runtimeStyle += `opacity: ${edge.runtime.opacity}; `;
      }

      let lineRuntimeStyle = '';
      let lineRuntimeAttrs = '';
      if (edge.runtime?.strokeDashoffset !== undefined) {
        lineRuntimeStyle += `stroke-dashoffset: ${edge.runtime.strokeDashoffset}; `;
        lineRuntimeAttrs += ` stroke-dashoffset="${edge.runtime.strokeDashoffset}"`;
      }

      svgContent += `<g data-id="${edge.id}" data-viz-role="edge-group" class="viz-edge-group ${edge.className || ''} ${animClasses}" style="${animStyleStr}${runtimeStyle}">`;

      let edgeInlineStyle = lineRuntimeStyle;
      if (edge.style?.stroke !== undefined)
        edgeInlineStyle += `stroke: ${edge.style.stroke}; `;
      if (edge.style?.strokeWidth !== undefined)
        edgeInlineStyle += `stroke-width: ${edge.style.strokeWidth}; `;
      if (edge.style?.fill !== undefined)
        edgeInlineStyle += `fill: ${edge.style.fill}; `;
      if (edge.style?.opacity !== undefined)
        edgeInlineStyle += `opacity: ${edge.style.opacity}; `;
      if (edge.style?.strokeDasharray !== undefined) {
        const resolved = resolveDasharray(edge.style.strokeDasharray);
        if (resolved) edgeInlineStyle += `stroke-dasharray: ${resolved}; `;
      }
      svgContent += `<path d="${edgePath.d}" class="viz-edge" data-viz-role="edge-line" ${markerEnd} ${markerStart} style="${edgeInlineStyle}"${lineRuntimeAttrs} />`;

      // Edge Labels (multi-position)
      const allLabels = collectEdgeLabels(edge);
      allLabels.forEach((lbl, idx) => {
        const pos = resolveEdgeLabelPosition(lbl, edgePath);
        const labelClass = `viz-edge-label ${lbl.className || ''}`;

        const edgeLabelSvg = renderSvgText(pos.x, pos.y, lbl.text, {
          className: labelClass,
          textAnchor: 'middle',
          dominantBaseline: 'middle',
          maxWidth: lbl.maxWidth,
          lineHeight: lbl.lineHeight,
          verticalAlign: lbl.verticalAlign,
          overflow: lbl.overflow,
        });

        // Inject the role/position/idx data attributes.
        // It's a bit hacky on the output string, but works.
        const augmentedSvg = edgeLabelSvg.replace(
          '<text ',
          `<text data-viz-role="edge-label" data-label-index="${idx}" data-label-position="${lbl.position}" `
        );
        svgContent += augmentedSvg;
      });
      svgContent += '</g>';
    });
    svgContent += '</g>';

    // Build parent→children map for container grouping
    const childrenByParent = new Map<string, VizNode[]>();
    nodes.forEach((n) => {
      if (n.parentId) {
        let arr = childrenByParent.get(n.parentId);
        if (!arr) {
          arr = [];
          childrenByParent.set(n.parentId, arr);
        }
        arr.push(n);
      }
    });

    // Recursive node renderer
    const renderNodeToSvg = (node: VizNode): string => {
      let content = '';
      const { x, y } = effectivePos(node);
      const { shape } = node;

      // Animations (Nodes)
      let animClasses = '';
      let animStyleStr = '';

      // Apply runtime opacity
      if (node.runtime?.opacity !== undefined) {
        animStyleStr += `opacity: ${node.runtime.opacity}; `;
      }

      if (node.animations) {
        node.animations.forEach((spec) => {
          if (spec.when === false) return;
          const renderer = defaultCoreAnimationRegistry.getNodeRenderer(
            spec.id
          );
          if (renderer) {
            if (renderer.getClass) {
              animClasses += ` ${renderer.getClass({ spec, element: node })}`;
            }
            if (renderer.getStyle) {
              const styles = renderer.getStyle({ spec, element: node });
              Object.entries(styles).forEach(([k, v]) => {
                animStyleStr += `${k}: ${v}; `;
              });
            }
          } else {
            animClasses += ` ${animFallbackClass(spec.id)}`;
            animFallbackStyleEntries(spec.params).forEach(([k, v]) => {
              animStyleStr += `${k}: ${v}; `;
            });
          }
        });
      }

      const isContainer = !!node.container;
      const className = `viz-node-group${isContainer ? ' viz-container' : ''} ${node.className || ''} ${animClasses}`;

      content += `<g data-id="${node.id}" data-viz-role="node-group" class="${className}" style="${animStyleStr}">`;

      const shapeStyleAttrs = svgAttributeString({
        fill: node.style?.fill ?? 'none',
        stroke: node.style?.stroke ?? '#111',
        'stroke-width': node.style?.strokeWidth ?? 2,
        opacity: node.style?.opacity,
      });

      // Shape
      content += shapeSvgMarkup(shape, { x, y }, shapeStyleAttrs);

      // Container header line
      if (
        isContainer &&
        node.container!.headerHeight &&
        'w' in shape &&
        'h' in shape
      ) {
        const sw = (shape as { w: number }).w;
        const sh = (shape as { h: number }).h;
        const headerY = y - sh / 2 + node.container!.headerHeight;
        content += `<line x1="${x - sw / 2}" y1="${headerY}" x2="${x + sw / 2}" y2="${headerY}" stroke="${node.style?.stroke ?? '#111'}" stroke-width="${node.style?.strokeWidth ?? 2}" class="viz-container-header" data-viz-role="container-header" />`;
      }

      // Label
      if (node.label) {
        let lx = x + (node.label.dx || 0);
        let ly = y + (node.label.dy || 0);

        // If container with headerHeight, center label in header area
        if (
          isContainer &&
          node.container!.headerHeight &&
          'h' in shape &&
          !node.label.dy
        ) {
          const sh = (shape as { h: number }).h;
          ly = y - sh / 2 + node.container!.headerHeight / 2;
          lx = x + (node.label.dx || 0);
        }

        const labelClass = `viz-node-label ${node.label.className || ''}`;

        const nodeLabelSvg = renderSvgText(lx, ly, node.label.text, {
          className: labelClass,
          fill: node.label.fill,
          fontSize: node.label.fontSize,
          fontWeight: node.label.fontWeight,
          textAnchor: node.label.textAnchor || 'middle',
          dominantBaseline: node.label.dominantBaseline || 'middle',
          maxWidth: node.label.maxWidth,
          lineHeight: node.label.lineHeight,
          verticalAlign: node.label.verticalAlign,
          overflow: node.label.overflow,
        });

        const augmentedSvg = nodeLabelSvg.replace(
          '<text ',
          '<text data-viz-role="node-label" '
        );
        content += augmentedSvg;
      }

      // Ports (small circles on the shape boundary, hidden by default, shown on hover via CSS)
      if (node.ports && node.ports.length > 0) {
        node.ports.forEach((port) => {
          const px = x + port.offset.x;
          const py = y + port.offset.y;
          content += `<circle cx="${px}" cy="${py}" r="4" class="viz-port" data-viz-role="port" data-node="${node.id}" data-port="${port.id}" />`;
        });
      }

      // Container children
      const children = childrenByParent.get(node.id);
      if (children && children.length > 0) {
        content +=
          '<g class="viz-container-children" data-viz-role="container-children">';
        children.forEach((child) => {
          content += renderNodeToSvg(child);
        });
        content += '</g>';
      }

      content += '</g>';
      return content;
    };

    // Render Nodes (only root nodes; children are rendered inside their containers)
    svgContent += '<g class="viz-layer-nodes" data-viz-layer="nodes">';
    nodes.forEach((node) => {
      if (!node.parentId) {
        svgContent += renderNodeToSvg(node);
      }
    });
    svgContent += '</g>';

    // Render Overlays
    if (overlays && overlays.length > 0) {
      svgContent += '<g class="viz-layer-overlays" data-viz-layer="overlays">';
      overlays.forEach((spec) => {
        const renderer = defaultCoreOverlayRegistry.get(spec.id);
        if (renderer) {
          svgContent += renderer.render({
            spec,
            nodesById,
            edgesById,
            scene,
            registry: defaultCoreOverlayRegistry,
          });
        }
      });
      svgContent += '</g>';
    }

    svgContent += '</svg>';
    return svgContent;
  }
}

class NodeBuilderImpl implements NodeBuilder {
  private _builder: VizBuilder;
  private nodeDef: Partial<VizNode>;

  constructor(parent: VizBuilder, nodeDef: Partial<VizNode>) {
    this._builder = parent;
    this.nodeDef = nodeDef;
  }

  at(x: number, y: number): NodeBuilder {
    this.nodeDef.pos = { x, y };
    return this;
  }

  cell(
    col: number,
    row: number,
    align: 'center' | 'start' | 'end' = 'center'
  ): NodeBuilder {
    const grid = this._builder._getGridConfig();
    if (!grid) {
      console.warn(
        'VizBuilder: .cell() called but no grid configured. Use .grid() first.'
      );
      return this;
    }

    const view = this._builder._getViewBox();
    const availableW = view.w - grid.padding.x * 2;
    const availableH = view.h - grid.padding.y * 2;

    const cellW = availableW / grid.cols;
    const cellH = availableH / grid.rows;

    let x = grid.padding.x + col * cellW;
    let y = grid.padding.y + row * cellH;

    // Alignment adjustments
    if (align === 'center') {
      x += cellW / 2;
      y += cellH / 2;
    } else if (align === 'end') {
      x += cellW;
      y += cellH;
    }

    this.nodeDef.pos = { x, y };
    return this;
  }

  circle(r: number): NodeBuilder {
    this.nodeDef.shape = { kind: 'circle', r };
    return this;
  }

  rect(w: number, h: number, rx?: number): NodeBuilder {
    this.nodeDef.shape = { kind: 'rect', w, h, rx };
    return this;
  }

  diamond(w: number, h: number): NodeBuilder {
    this.nodeDef.shape = { kind: 'diamond', w, h };
    return this;
  }

  cylinder(w: number, h: number, arcHeight?: number): NodeBuilder {
    this.nodeDef.shape = { kind: 'cylinder', w, h, arcHeight };
    return this;
  }

  hexagon(r: number, orientation?: 'pointy' | 'flat'): NodeBuilder {
    this.nodeDef.shape = { kind: 'hexagon', r, orientation };
    return this;
  }

  ellipse(rx: number, ry: number): NodeBuilder {
    this.nodeDef.shape = { kind: 'ellipse', rx, ry };
    return this;
  }

  arc(
    r: number,
    startAngle: number,
    endAngle: number,
    closed?: boolean
  ): NodeBuilder {
    this.nodeDef.shape = { kind: 'arc', r, startAngle, endAngle, closed };
    return this;
  }

  blockArrow(
    length: number,
    bodyWidth: number,
    headWidth: number,
    headLength: number,
    direction?: 'right' | 'left' | 'up' | 'down'
  ): NodeBuilder {
    this.nodeDef.shape = {
      kind: 'blockArrow',
      length,
      bodyWidth,
      headWidth,
      headLength,
      direction,
    };
    return this;
  }

  callout(
    w: number,
    h: number,
    opts?: {
      rx?: number;
      pointerSide?: 'bottom' | 'top' | 'left' | 'right';
      pointerHeight?: number;
      pointerWidth?: number;
      pointerPosition?: number;
    }
  ): NodeBuilder {
    this.nodeDef.shape = {
      kind: 'callout',
      w,
      h,
      rx: opts?.rx,
      pointerSide: opts?.pointerSide,
      pointerHeight: opts?.pointerHeight,
      pointerWidth: opts?.pointerWidth,
      pointerPosition: opts?.pointerPosition,
    };
    return this;
  }

  cloud(w: number, h: number): NodeBuilder {
    this.nodeDef.shape = { kind: 'cloud', w, h };
    return this;
  }

  cross(size: number, barWidth?: number): NodeBuilder {
    this.nodeDef.shape = { kind: 'cross', size, barWidth };
    return this;
  }

  cube(w: number, h: number, depth?: number): NodeBuilder {
    this.nodeDef.shape = { kind: 'cube', w, h, depth };
    return this;
  }

  path(d: string, w: number, h: number): NodeBuilder {
    this.nodeDef.shape = { kind: 'path', d, w, h };
    return this;
  }

  document(w: number, h: number, waveHeight?: number): NodeBuilder {
    this.nodeDef.shape = { kind: 'document', w, h, waveHeight };
    return this;
  }

  note(w: number, h: number, foldSize?: number): NodeBuilder {
    this.nodeDef.shape = { kind: 'note', w, h, foldSize };
    return this;
  }

  parallelogram(w: number, h: number, skew?: number): NodeBuilder {
    this.nodeDef.shape = { kind: 'parallelogram', w, h, skew };
    return this;
  }

  star(points: number, outerR: number, innerR?: number): NodeBuilder {
    this.nodeDef.shape = { kind: 'star', points, outerR, innerR };
    return this;
  }

  trapezoid(topW: number, bottomW: number, h: number): NodeBuilder {
    this.nodeDef.shape = { kind: 'trapezoid', topW, bottomW, h };
    return this;
  }

  triangle(
    w: number,
    h: number,
    direction?: 'up' | 'down' | 'left' | 'right'
  ): NodeBuilder {
    this.nodeDef.shape = { kind: 'triangle', w, h, direction };
    return this;
  }

  label(text: string, opts?: Partial<NodeLabel>): NodeBuilder {
    this.nodeDef.label = { text, ...opts };
    return this;
  }

  fill(color: string): NodeBuilder {
    this.nodeDef.style = {
      ...(this.nodeDef.style || {}),
      fill: color,
    };
    return this;
  }

  stroke(color: string, width?: number): NodeBuilder {
    this.nodeDef.style = {
      ...(this.nodeDef.style || {}),
      stroke: color,
      strokeWidth: width ?? this.nodeDef.style?.strokeWidth,
    };
    return this;
  }

  opacity(value: number): NodeBuilder {
    this.nodeDef.style = {
      ...(this.nodeDef.style || {}),
      opacity: value,
    };
    return this;
  }

  image(
    href: string,
    width: number,
    height: number,
    opts?: Omit<NodeImage, 'href' | 'width' | 'height'>
  ): NodeBuilder {
    this.nodeDef.image = { href, width, height, ...opts };
    return this;
  }

  class(name: string): NodeBuilder {
    if (this.nodeDef.className) {
      this.nodeDef.className += ` ${name}`;
    } else {
      this.nodeDef.className = name;
    }
    return this;
  }

  zIndex(value: number): NodeBuilder {
    this.nodeDef.zIndex = value;
    return this;
  }

  animate(type: string, config?: AnimationConfig): NodeBuilder;
  animate(cb: (anim: AnimationBuilder) => unknown): NodeBuilder;
  animate(
    typeOrCb: string | ((anim: AnimationBuilder) => unknown),
    config?: AnimationConfig
  ): NodeBuilder {
    if (typeof typeOrCb === 'string') {
      if (!this.nodeDef.animations) {
        this.nodeDef.animations = [];
      }
      this.nodeDef.animations.push({ id: typeOrCb, params: config });
      return this;
    }

    const id = this.nodeDef.id;
    if (!id) {
      throw new Error('NodeBuilder.animate(cb): node has no id');
    }

    // Compile to a portable AnimationSpec and store on the scene via the parent builder.
    this._builder.animate((anim) => {
      anim.node(id);
      typeOrCb(anim);
    });

    return this;
  }

  animateTo(props: AnimatableProps, opts: TweenOptions): NodeBuilder {
    return this.animate((anim) => {
      anim.to(props, opts);
    });
  }

  data(payload: unknown): NodeBuilder {
    this.nodeDef.data = payload;
    return this;
  }

  onClick(handler: (id: string, node: VizNode) => void): NodeBuilder {
    this.nodeDef.onClick = handler;
    return this;
  }

  container(config?: ContainerConfig): NodeBuilder {
    this.nodeDef.container = config ?? { layout: 'free' };
    return this;
  }

  port(
    id: string,
    offset: { x: number; y: number },
    direction?: number
  ): NodeBuilder {
    if (!this.nodeDef.ports) {
      this.nodeDef.ports = [];
    }
    this.nodeDef.ports.push({ id, offset, direction });
    return this;
  }

  parent(parentId: string): NodeBuilder {
    this.nodeDef.parentId = parentId;
    return this;
  }

  done(): VizBuilder {
    return this._builder;
  }

  // Chaining
  node(id: string): NodeBuilder;
  node(id: string, opts: NodeOptions): VizBuilder;
  node(id: string, opts?: NodeOptions): NodeBuilder | VizBuilder {
    return this._builder.node(id, opts as NodeOptions);
  }
  edge(from: string, to: string, id?: string): EdgeBuilder;
  edge(from: string, to: string, opts: EdgeOptions): VizBuilder;
  edge(
    from: string,
    to: string,
    idOrOpts?: string | EdgeOptions
  ): EdgeBuilder | VizBuilder {
    return this._builder.edge(from, to, idOrOpts as string);
  }
  overlay<K extends OverlayId>(
    id: K,
    params: OverlayParams<K>,
    key?: string
  ): VizBuilder;
  overlay(cb: (overlay: OverlayBuilder) => unknown): VizBuilder;
  overlay<T>(id: string, params: T, key?: string): VizBuilder;
  overlay(
    arg1: string | ((overlay: OverlayBuilder) => unknown),
    arg2?: unknown,
    arg3?: string
  ): VizBuilder {
    if (typeof arg1 === 'function') return this._builder.overlay(arg1);
    return this._builder.overlay(
      arg1 as string,
      arg2,
      arg3 as string | undefined
    );
  }
  build(): VizScene {
    return this._builder.build();
  }
  svg(): string {
    return this._builder.svg();
  }
}

class EdgeBuilderImpl implements EdgeBuilder {
  private parent: VizBuilder;
  private edgeDef: Partial<VizEdge>;

  constructor(parent: VizBuilder, edgeDef: Partial<VizEdge>) {
    this.parent = parent;
    this.edgeDef = edgeDef;
  }

  straight(): EdgeBuilder {
    this.edgeDef.routing = 'straight';
    return this;
  }

  curved(): EdgeBuilder {
    this.edgeDef.routing = 'curved';
    return this;
  }

  orthogonal(): EdgeBuilder {
    this.edgeDef.routing = 'orthogonal';
    return this;
  }

  routing(mode: EdgeRouting): EdgeBuilder {
    this.edgeDef.routing = mode;
    return this;
  }

  via(x: number, y: number): EdgeBuilder {
    if (!this.edgeDef.waypoints) {
      this.edgeDef.waypoints = [];
    }
    this.edgeDef.waypoints.push({ x, y });
    return this;
  }

  label(text: string, opts?: Partial<EdgeLabel>): EdgeBuilder {
    const lbl: EdgeLabel = { position: 'mid', text, dy: -10, ...opts };
    // Accumulate into the labels array
    if (!this.edgeDef.labels) {
      this.edgeDef.labels = [];
    }
    this.edgeDef.labels.push(lbl);
    // Backwards compat: keep the first mid label in `label`
    if (lbl.position === 'mid' && !this.edgeDef.label) {
      this.edgeDef.label = lbl;
    }
    return this;
  }

  arrow(enabled: boolean | 'both' | 'start' | 'end' = true): EdgeBuilder {
    if (enabled === 'both') {
      this.edgeDef.markerStart = 'arrow';
      this.edgeDef.markerEnd = 'arrow';
    } else if (enabled === 'start') {
      this.edgeDef.markerStart = 'arrow';
    } else if (enabled === 'end') {
      this.edgeDef.markerEnd = 'arrow';
    } else if (enabled === true) {
      this.edgeDef.markerEnd = 'arrow';
    } else {
      this.edgeDef.markerEnd = 'none';
    }
    return this;
  }

  markerEnd(type: EdgeMarkerType): EdgeBuilder {
    this.edgeDef.markerEnd = type;
    return this;
  }

  markerStart(type: EdgeMarkerType): EdgeBuilder {
    this.edgeDef.markerStart = type;
    return this;
  }

  connect(anchor: 'center' | 'boundary'): EdgeBuilder {
    this.edgeDef.anchor = anchor;
    return this;
  }

  fromPort(portId: string): EdgeBuilder {
    this.edgeDef.fromPort = portId;
    return this;
  }

  toPort(portId: string): EdgeBuilder {
    this.edgeDef.toPort = portId;
    return this;
  }

  fill(color: string): EdgeBuilder {
    this.edgeDef.style = {
      ...(this.edgeDef.style || {}),
      fill: color,
    };
    return this;
  }

  stroke(color: string, width?: number): EdgeBuilder {
    this.edgeDef.style = {
      ...(this.edgeDef.style || {}),
      stroke: color,
      strokeWidth: width ?? this.edgeDef.style?.strokeWidth,
    };
    return this;
  }

  opacity(value: number): EdgeBuilder {
    this.edgeDef.style = {
      ...(this.edgeDef.style || {}),
      opacity: value,
    };
    return this;
  }

  dashed(): EdgeBuilder {
    this.edgeDef.style = {
      ...(this.edgeDef.style || {}),
      strokeDasharray: 'dashed',
    };
    return this;
  }

  dotted(): EdgeBuilder {
    this.edgeDef.style = {
      ...(this.edgeDef.style || {}),
      strokeDasharray: 'dotted',
    };
    return this;
  }

  dash(
    pattern: 'solid' | 'dashed' | 'dotted' | 'dash-dot' | string
  ): EdgeBuilder {
    this.edgeDef.style = {
      ...(this.edgeDef.style || {}),
      strokeDasharray: pattern,
    };
    return this;
  }

  class(name: string): EdgeBuilder {
    if (this.edgeDef.className) {
      this.edgeDef.className += ` ${name}`;
    } else {
      this.edgeDef.className = name;
    }
    return this;
  }

  animate(type: string, config?: AnimationConfig): EdgeBuilder;
  animate(cb: (anim: AnimationBuilder) => unknown): EdgeBuilder;
  animate(
    typeOrCb: string | ((anim: AnimationBuilder) => unknown),
    config?: AnimationConfig
  ): EdgeBuilder {
    if (typeof typeOrCb === 'string') {
      if (!this.edgeDef.animations) {
        this.edgeDef.animations = [];
      }
      this.edgeDef.animations.push({ id: typeOrCb, params: config });
      return this;
    }

    const id = this.edgeDef.id || `${this.edgeDef.from}->${this.edgeDef.to}`;
    if (!id) {
      throw new Error('EdgeBuilder.animate(cb): edge has no id');
    }

    // Compile to a portable AnimationSpec and store on the scene via the parent builder.
    this.parent.animate((anim) => {
      anim.edge(id);
      typeOrCb(anim);
    });

    return this;
  }

  animateTo(props: AnimatableProps, opts: TweenOptions): EdgeBuilder {
    return this.animate((anim) => {
      anim.to(props, opts);
    });
  }

  hitArea(px: number): EdgeBuilder {
    this.edgeDef.hitArea = px;
    return this;
  }

  data(payload: unknown): EdgeBuilder {
    this.edgeDef.data = payload;
    return this;
  }

  onClick(handler: (id: string, edge: VizEdge) => void): EdgeBuilder {
    this.edgeDef.onClick = handler;
    return this;
  }

  loopSide(side: 'top' | 'right' | 'bottom' | 'left'): EdgeBuilder {
    this.edgeDef.loopSide = side;
    return this;
  }

  loopSize(size: number): EdgeBuilder {
    this.edgeDef.loopSize = size;
    return this;
  }

  done(): VizBuilder {
    return this.parent;
  }

  // Chaining
  node(id: string): NodeBuilder;
  node(id: string, opts: NodeOptions): VizBuilder;
  node(id: string, opts?: NodeOptions): NodeBuilder | VizBuilder {
    return this.parent.node(id, opts as NodeOptions);
  }
  edge(from: string, to: string, id?: string): EdgeBuilder;
  edge(from: string, to: string, opts: EdgeOptions): VizBuilder;
  edge(
    from: string,
    to: string,
    idOrOpts?: string | EdgeOptions
  ): EdgeBuilder | VizBuilder {
    return this.parent.edge(from, to, idOrOpts as string);
  }
  overlay<K extends OverlayId>(
    id: K,
    params: OverlayParams<K>,
    key?: string
  ): VizBuilder;
  overlay(cb: (overlay: OverlayBuilder) => unknown): VizBuilder;
  overlay<T>(id: string, params: T, key?: string): VizBuilder;
  overlay(
    arg1: string | ((overlay: OverlayBuilder) => unknown),
    arg2?: unknown,
    arg3?: string
  ): VizBuilder {
    if (typeof arg1 === 'function') return this.parent.overlay(arg1);
    return this.parent.overlay(
      arg1 as string,
      arg2,
      arg3 as string | undefined
    );
  }
  build(): VizScene {
    return this.parent.build();
  }
  svg(): string {
    return this.parent.svg();
  }
}

export function viz(): VizBuilder {
  return new VizBuilderImpl();
}
