import type {
  Vec2,
  VizScene,
  VizNode,
  VizEdge,
  NodeLabel,
  EdgeLabel,
  RichText,
  RichTextToken,
  AnimationConfig,
  VizOverlaySpec,
  OverlayId,
  OverlayParams,
  VizGridConfig,
  ContainerConfig,
  EdgeRouting,
  EdgeMarkerType,
  EdgePathResolver,
  NodeOptions,
  EdgeOptions,
  PanZoomOptions,
  PanZoomController,
  VizSceneMutator,
  SceneChanges,
  VizPlugin,
  VizEventMap,
  SyncLayoutAlgorithm,
  LayoutAlgorithm,
  LayoutGraph,
  LayoutResult,
  SvgExportOptions,
  TooltipContent,
  BadgePosition,
  EntryOptions,
  CompartmentClickContext,
  CollapseIndicatorOptions,
} from './types';
import { OVERLAY_RUNTIME_DIRTY } from './types';
import { setupPanZoom } from './interaction/panZoom';
import { setupTooltip, type TooltipController } from './interaction/tooltip';
import { DEFAULT_VIZ_CSS } from './rendering/styles';
import { defaultCoreAnimationRegistry } from './rendering/animations';
import { defaultCoreOverlayRegistry } from './overlays/registry';
import { OverlayBuilder } from './overlays/builder';
import { resolveDasharray } from './edges/styles';
import {
  createRuntimePatchCtx,
  patchRuntime,
  type RuntimePatchCtx,
} from './rendering/runtimePatcher';
import {
  computeEdgePath,
  computeEdgeEndpoints,
  computeSelfLoop,
} from './edges/paths';
import { resolveEdgeLabelPosition, collectEdgeLabels } from './edges/labels';
import { renderSvgText } from './utils/text';
import type { AnimationSpec } from './animation/spec';
import {
  buildAnimationSpec,
  type AnimationBuilder,
  type AnimatableProps,
  type TweenOptions,
} from './animation/builder';
import {
  createBuilderPlayback,
  type PlaybackController,
} from './animation/playback';
import type { ExtendAdapter } from './animation/extendAdapter';
import { getAdapterExtensions } from './animation/specExtensions';
import {
  applyShapeGeometry,
  effectivePos,
  effectiveShape,
  getShapeBehavior,
  shapeSvgMarkup,
  getNodeBoundingBox,
} from './shapes/geometry';
import { getEffectiveNodeBounds } from './interaction/hitTest';
import { defaultCoreIconRegistry } from './shapes/icons';
import { NodeBuilderImpl, applyNodeOptions } from './nodes/builder';
import { EdgeBuilderImpl, applyEdgeOptions } from './edges/builder';
import {
  resolveShadow,
  shadowFilterId,
  shadowFilterSvg,
} from './rendering/shadow';
import {
  resolveSketchSeed,
  sketchFilterId,
  sketchFilterSvg,
} from './rendering/sketch';

/**
 * Runtime check for Promise-like values without `as any` casting.
 */
function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

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

/**
 * Resolves edge endpoints for dangling edges.
 * Returns `null` when a referenced node id doesn't exist.
 */
function resolveDanglingEdge(
  edge: VizEdge,
  nodesById: Map<string, VizNode>
): { start: VizNode | null; end: VizNode | null } | null {
  const start = edge.from ? (nodesById.get(edge.from) ?? null) : null;
  const end = edge.to ? (nodesById.get(edge.to) ?? null) : null;

  if (edge.from && !start) return null;
  if (edge.to && !end) return null;
  if (!start && !edge.fromAt && !end && !edge.toAt) return null;

  return { start, end };
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

/** Lookup table mapping each marker type to a function that returns its inner SVG shape markup.
 *  The parameter `c` is the XML-escaped, safe color string to embed in SVG attributes. */
const MARKER_INNER: Partial<Record<EdgeMarkerType, (c: string) => string>> = {
  arrow: (c) => `<polygon points="0,2 10,5 0,8" fill="${c}" />`,
  arrowOpen: (c) =>
    `<polyline points="0,2 10,5 0,8" fill="white" stroke="${c}" stroke-width="1.5" stroke-linejoin="miter" />`,
  diamond: (c) => `<polygon points="0,5 5,2 10,5 5,8" fill="${c}" />`,
  diamondOpen: (c) =>
    `<polygon points="0,5 5,2 10,5 5,8" fill="white" stroke="${c}" stroke-width="1.5" />`,
  circle: (c) => `<circle cx="5" cy="5" r="3" fill="${c}" />`,
  circleOpen: (c) =>
    `<circle cx="5" cy="5" r="3" fill="white" stroke="${c}" stroke-width="1.5" />`,
  square: (c) => `<rect x="2" y="2" width="6" height="6" fill="${c}" />`,
  bar: (c) =>
    `<line x1="5" y1="1" x2="5" y2="9" stroke="${c}" stroke-width="2" stroke-linecap="round" />`,
  halfArrow: (c) => `<polygon points="0,2 10,5 0,5" fill="${c}" />`,
};

function generateMarkerSvg(
  markerType: EdgeMarkerType,
  color: string,
  id: string,
  position: 'start' | 'end' = 'end'
): string {
  if (markerType === 'none') return '';
  const innerFn = MARKER_INNER[markerType];
  if (!innerFn) return '';

  const safeColor = escapeXmlAttr(color);
  const orient = position === 'start' ? 'auto-start-reverse' : 'auto';
  // refX=9 positions the marker tip at the path endpoint.
  // Start markers use orient="auto-start-reverse" which flips the marker,
  // so the same refX=9 keeps the tip at the node boundary.
  return `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" orient="${orient}">${innerFn(safeColor)}</marker>`;
}

function mediaTopLeft(
  node: VizNode,
  mediaW: number,
  mediaH: number,
  opts?: {
    position?: 'center' | 'above' | 'below' | 'left' | 'right';
    dx?: number;
    dy?: number;
  }
): { x: number; y: number } {
  const { x: cx, y: cy } = effectivePos(node);
  const bounds = getEffectiveNodeBounds(node);
  const position = opts?.position ?? 'center';
  const dx = opts?.dx ?? 0;
  const dy = opts?.dy ?? 0;

  let ox = 0;
  let oy = 0;
  switch (position) {
    case 'above':
      oy = -bounds.h / 2 - mediaH / 2;
      break;
    case 'below':
      oy = bounds.h / 2 + mediaH / 2;
      break;
    case 'left':
      ox = -bounds.w / 2 - mediaW / 2;
      break;
    case 'right':
      ox = bounds.w / 2 + mediaW / 2;
      break;
    case 'center':
    default:
      break;
  }

  return {
    x: cx + ox - mediaW / 2 + dx,
    y: cy + oy - mediaH / 2 + dy,
  };
}

function sizeSvgString(svg: string, w: number, h: number): string {
  const trimmed = svg.trim();
  if (!trimmed.startsWith('<svg')) return svg;
  return trimmed.replace(/<svg\b([^>]*)>/, (_m, attrs: string) => {
    const cleaned = attrs
      .replace(/\swidth="[^"]*"/g, '')
      .replace(/\sheight="[^"]*"/g, '');
    return `<svg${cleaned} width="${w}" height="${h}">`;
  });
}

function normalizeSvgContent(content: string, w: number, h: number): string {
  const trimmed = content.trim();
  if (trimmed.startsWith('<svg')) return sizeSvgString(trimmed, w, h);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${content}</svg>`;
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
   * Applies a **synchronous** layout algorithm to the current nodes and edges.
   * @param algorithm The layout function to execute (must return synchronously)
   * @param options Optional configuration for the layout algorithm
   * @returns The builder, for fluent chaining
   */
  layout<O>(algorithm: SyncLayoutAlgorithm<O>, options?: O): VizBuilder;

  /**
   * Applies a layout algorithm that may be asynchronous (e.g. ELK via web workers).
   * @param algorithm The layout function to execute (may return a Promise)
   * @param options Optional configuration for the layout algorithm
   * @returns A Promise that resolves to the builder, for fluent chaining
   */
  layoutAsync<O>(
    algorithm: LayoutAlgorithm<O>,
    options?: O
  ): Promise<VizBuilder>;

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

  /**
   * Override edge SVG path computation.
   *
   * Intended to be installed before `mount()`. Applies to DOM reconciliation and
   * `patchRuntime()`.
   */
  setEdgePathResolver(resolver: EdgePathResolver | null): VizBuilder;

  view(w: number, h: number): VizBuilder;
  grid(
    cols: number,
    rows: number,
    padding?: { x: number; y: number }
  ): VizBuilder;

  /** Enable global sketch / hand-drawn rendering for all nodes and edges. */
  sketch(enabled?: boolean, seed?: number): VizBuilder;

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

  /**
   * Create a dangling edge with at least one free endpoint.
   * The free end renders at a canvas coordinate (`fromAt`/`toAt`) rather than a node.
   */
  danglingEdge(id: string, opts?: EdgeOptions): EdgeBuilder;
  /** Declarative overload — returns the parent VizBuilder. */
  danglingEdge(id: string, opts: EdgeOptions): VizBuilder;

  /** Hydrates the builder from an existing VizScene. */
  fromScene(scene: VizScene): VizBuilder;

  build(): VizScene;

  // Internal helper for NodeBuilder to access grid config
  _getGridConfig(): VizGridConfig | null;
  _getViewBox(): { w: number; h: number };
  svg(opts?: SvgExportOptions): string;
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

export interface RichLabelBuilder {
  text(
    text: string,
    opts?: Partial<
      Omit<Extract<RichTextToken, { kind: 'span' }>, 'kind' | 'text'>
    >
  ): RichLabelBuilder;
  bold(
    text: string,
    opts?: Partial<
      Omit<Extract<RichTextToken, { kind: 'span' }>, 'kind' | 'text'>
    >
  ): RichLabelBuilder;
  italic(
    text: string,
    opts?: Partial<
      Omit<Extract<RichTextToken, { kind: 'span' }>, 'kind' | 'text'>
    >
  ): RichLabelBuilder;
  code(
    text: string,
    opts?: Partial<
      Omit<Extract<RichTextToken, { kind: 'span' }>, 'kind' | 'text'>
    >
  ): RichLabelBuilder;
  color(
    text: string,
    fill: string,
    opts?: Partial<
      Omit<Extract<RichTextToken, { kind: 'span' }>, 'kind' | 'text' | 'fill'>
    >
  ): RichLabelBuilder;
  link(
    text: string,
    href: string,
    opts?: Partial<
      Omit<Extract<RichTextToken, { kind: 'span' }>, 'kind' | 'text' | 'href'>
    >
  ): RichLabelBuilder;
  sup(
    text: string,
    opts?: Partial<
      Omit<
        Extract<RichTextToken, { kind: 'span' }>,
        'kind' | 'text' | 'baselineShift'
      >
    >
  ): RichLabelBuilder;
  sub(
    text: string,
    opts?: Partial<
      Omit<
        Extract<RichTextToken, { kind: 'span' }>,
        'kind' | 'text' | 'baselineShift'
      >
    >
  ): RichLabelBuilder;
  newline(): RichLabelBuilder;
  build(): RichText;
}

/**
 * Builder for configuring a single compartment inside a compartmented node.
 */
export interface CompartmentBuilder {
  /** Set the compartment's label text. */
  label(text: string, opts?: Partial<NodeLabel>): CompartmentBuilder;
  /** Set an explicit height for this compartment (overrides auto-sizing). */
  height(h: number): CompartmentBuilder;
  /**
   * Add an individually interactive entry (line) to this compartment.
   *
   * Entries and `label()` are **mutually exclusive** on a compartment.
   * Using `entry()` after `label()` (or vice versa) replaces the previous
   * content and emits a dev console warning.
   */
  entry(id: string, text: string, opts?: EntryOptions): CompartmentBuilder;
  /**
   * Register a click handler for this compartment.
   *
   * The callback receives a `CompartmentClickContext` with `nodeId`,
   * `compartmentId`, the current `collapsed` state, and a `toggle()` helper
   * for animating collapse/expand.
   */
  onClick(handler: (ctx: CompartmentClickContext) => void): CompartmentBuilder;
}

export interface NodeBuilder {
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

  /** Embed an SVG <image> inside/around the node. */
  image(
    href: string,
    w: number,
    h: number,
    opts?: {
      dx?: number;
      dy?: number;
      position?: 'center' | 'above' | 'below' | 'left' | 'right';
      preserveAspectRatio?: string;
    }
  ): NodeBuilder;
  image(
    href: string,
    opts: {
      w: number;
      h: number;
      dx?: number;
      dy?: number;
      position?: 'center' | 'above' | 'below' | 'left' | 'right';
      preserveAspectRatio?: string;
    }
  ): NodeBuilder;

  /** Render a registered SVG icon inside/around the node. */
  icon(
    id: string,
    opts: {
      size: number;
      color?: string;
      dx?: number;
      dy?: number;
      position?: 'center' | 'above' | 'below' | 'left' | 'right';
    }
  ): NodeBuilder;

  /** Render inline SVG content inside/around the node. */
  svgContent(
    content: string,
    w: number,
    h: number,
    opts?: {
      dx?: number;
      dy?: number;
      position?: 'center' | 'above' | 'below' | 'left' | 'right';
    }
  ): NodeBuilder;
  svgContent(
    content: string,
    opts: {
      w: number;
      h: number;
      dx?: number;
      dy?: number;
      position?: 'center' | 'above' | 'below' | 'left' | 'right';
    }
  ): NodeBuilder;
  label(text: string, opts?: Partial<NodeLabel>): NodeBuilder;
  /**
   * Create a rich text label (mixed formatting) using nested SVG <tspan> spans.
   *
   * Note: Rich labels currently support explicit newlines via `l.newline()`.
   */
  richLabel(
    cb: (l: RichLabelBuilder) => unknown,
    opts?: Partial<Omit<NodeLabel, 'text' | 'rich'>>
  ): NodeBuilder;
  fill(color: string): NodeBuilder;
  stroke(color: string, width?: number): NodeBuilder;
  opacity(value: number): NodeBuilder;
  /** Apply a dashed stroke pattern (`8, 4`). */
  dashed(): NodeBuilder;
  /** Apply a dotted stroke pattern (`2, 4`). */
  dotted(): NodeBuilder;
  /** Apply a custom SVG `stroke-dasharray` value, or a preset name (`'dashed'`, `'dotted'`, `'dash-dot'`). */
  dash(
    pattern: 'solid' | 'dashed' | 'dotted' | 'dash-dot' | string
  ): NodeBuilder;
  /**
   * Add a drop shadow behind the node shape.
   *
   * Call with no arguments for a sensible default, or pass a config object.
   */
  shadow(config?: {
    dx?: number;
    dy?: number;
    blur?: number;
    color?: string;
  }): NodeBuilder;
  /** Render this node with a hand-drawn / sketchy appearance. */
  sketch(config?: { seed?: number }): NodeBuilder;
  class(name: string): NodeBuilder;
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
  /**
   * Add a compartment section to this node (UML-style class boxes).
   *
   * @param id   Unique compartment id (e.g. `'name'`, `'attributes'`, `'methods'`)
   * @param cb   Callback to configure the compartment's label
   */
  compartment(id: string, cb?: (c: CompartmentBuilder) => unknown): NodeBuilder;
  /**
   * Mark this compartmented node as collapsed.
   *
   * When collapsed, only the first compartment (header) is rendered and the
   * node height shrinks to fit. All compartment data is preserved.
   * Has no effect on nodes without compartments.
   *
   * @param state  `true` to collapse (default), `false` to expand.
   */
  collapsed(state?: boolean): NodeBuilder;
  /**
   * Customize or hide the collapse indicator (chevron).
   *
   * @param opts  Options object, or `false` to hide the indicator.
   */
  collapseIndicator(opts: CollapseIndicatorOptions | false): NodeBuilder;
  /**
   * Set the anchor point for collapse/expand animation.
   *
   * @param anchor  `'top'` | `'center'` (default) | `'bottom'`
   */
  collapseAnchor(anchor: import('./types').CollapseAnchor): NodeBuilder;
  /** Set tooltip content shown on hover/focus. */
  tooltip(content: TooltipContent): NodeBuilder;
  /**
   * Add a text badge pinned to a corner of the node.
   *
   * @param text       1–2 character badge text
   * @param opts       Badge options (position, colors, fontSize)
   */
  badge(
    text: string,
    opts?: {
      position?: BadgePosition;
      fill?: string;
      background?: string;
      fontSize?: number;
    }
  ): NodeBuilder;
  done(): VizBuilder;

  // Seamless chaining extensions
  node(id: string): NodeBuilder;
  node(id: string, opts: NodeOptions): VizBuilder;
  edge(from: string, to: string, id?: string): EdgeBuilder;
  edge(from: string, to: string, opts: EdgeOptions): VizBuilder;
  danglingEdge(id: string, opts?: EdgeOptions): EdgeBuilder;
  danglingEdge(id: string, opts: EdgeOptions): VizBuilder;
  overlay(cb: (overlay: OverlayBuilder) => unknown): VizBuilder;
  overlay<K extends OverlayId>(
    id: K,
    params: OverlayParams<K>,
    key?: string
  ): VizBuilder;
  overlay<T>(id: string, params: T, key?: string): VizBuilder;
  build(): VizScene;
  svg(opts?: SvgExportOptions): string;
}

export interface EdgeBuilder {
  straight(): EdgeBuilder;
  curved(): EdgeBuilder;
  orthogonal(): EdgeBuilder;
  routing(mode: EdgeRouting): EdgeBuilder;
  via(x: number, y: number): EdgeBuilder;
  /** Set the source node id (useful with `danglingEdge()`). */
  from(nodeId: string): EdgeBuilder;
  /** Set the target node id (useful with `danglingEdge()`). */
  to(nodeId: string): EdgeBuilder;
  /** Set the free-endpoint source position (when `from` is omitted). */
  fromAt(pos: Vec2): EdgeBuilder;
  /** Set the free-endpoint target position (when `to` is omitted). */
  toAt(pos: Vec2): EdgeBuilder;
  label(text: string, opts?: Partial<EdgeLabel>): EdgeBuilder;
  /**
   * Create a rich text label (mixed formatting) using nested SVG <tspan> spans.
   *
   * Note: Rich labels currently support explicit newlines via `l.newline()`.
   */
  richLabel(
    cb: (l: RichLabelBuilder) => unknown,
    opts?: Partial<Omit<EdgeLabel, 'text' | 'rich'>>
  ): EdgeBuilder;
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
  /** Set a fixed perimeter angle (degrees, 0 = right, 90 = down) on the source node. */
  fromAngle(deg: number): EdgeBuilder;
  /** Set a fixed perimeter angle (degrees, 0 = right, 90 = down) on the target node. */
  toAngle(deg: number): EdgeBuilder;
  /**
   * Auto-compute perimeter angles so the edge forms a straight line between
   * both node boundaries. Equivalent to computing `angleBetween` and setting
   * `fromAngle` + `toAngle`.
   */
  straightLine(): EdgeBuilder;
  /** Auto-compute only the source perimeter angle for a straight line to the target. */
  straightLineFrom(): EdgeBuilder;
  /** Auto-compute only the target perimeter angle for a straight line from the source. */
  straightLineTo(): EdgeBuilder;
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
  /** Render this edge with a hand-drawn / sketchy appearance. */
  sketch(): EdgeBuilder;
  class(name: string): EdgeBuilder;
  hitArea(px: number): EdgeBuilder;
  animate(type: string, config?: AnimationConfig): EdgeBuilder;
  animate(cb: (anim: AnimationBuilder) => unknown): EdgeBuilder;

  /** Sugar for `animate(a => a.to(...))`. */
  animateTo(props: AnimatableProps, opts: TweenOptions): EdgeBuilder;
  /** Attach arbitrary consumer-defined metadata to the edge. */
  meta(meta: Record<string, unknown>): EdgeBuilder;
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

  /** Set tooltip content shown on hover/focus. */
  tooltip(content: TooltipContent): EdgeBuilder;

  done(): VizBuilder;

  // Seamless chaining extensions
  node(id: string): NodeBuilder;
  node(id: string, opts: NodeOptions): VizBuilder;
  edge(from: string, to: string, id?: string): EdgeBuilder;
  edge(from: string, to: string, opts: EdgeOptions): VizBuilder;
  danglingEdge(id: string, opts?: EdgeOptions): EdgeBuilder;
  danglingEdge(id: string, opts: EdgeOptions): VizBuilder;
  overlay(cb: (overlay: OverlayBuilder) => unknown): VizBuilder;
  overlay<K extends OverlayId>(
    id: K,
    params: OverlayParams<K>,
    key?: string
  ): VizBuilder;
  overlay<T>(id: string, params: T, key?: string): VizBuilder;
  build(): VizScene;
  svg(opts?: SvgExportOptions): string;
}

export class RichLabelBuilderImpl implements RichLabelBuilder {
  private _tokens: RichTextToken[] = [];

  text(
    text: string,
    opts?: Partial<
      Omit<Extract<RichTextToken, { kind: 'span' }>, 'kind' | 'text'>
    >
  ): RichLabelBuilder {
    this._tokens.push({ kind: 'span', text, ...(opts ?? {}) });
    return this;
  }

  bold(
    text: string,
    opts?: Partial<
      Omit<Extract<RichTextToken, { kind: 'span' }>, 'kind' | 'text'>
    >
  ): RichLabelBuilder {
    return this.text(text, { ...(opts ?? {}), bold: true });
  }

  italic(
    text: string,
    opts?: Partial<
      Omit<Extract<RichTextToken, { kind: 'span' }>, 'kind' | 'text'>
    >
  ): RichLabelBuilder {
    return this.text(text, { ...(opts ?? {}), italic: true });
  }

  code(
    text: string,
    opts?: Partial<
      Omit<Extract<RichTextToken, { kind: 'span' }>, 'kind' | 'text'>
    >
  ): RichLabelBuilder {
    return this.text(text, { ...(opts ?? {}), code: true });
  }

  color(
    text: string,
    fill: string,
    opts?: Partial<
      Omit<Extract<RichTextToken, { kind: 'span' }>, 'kind' | 'text' | 'fill'>
    >
  ): RichLabelBuilder {
    return this.text(text, { ...(opts ?? {}), fill });
  }

  link(
    text: string,
    href: string,
    opts?: Partial<
      Omit<Extract<RichTextToken, { kind: 'span' }>, 'kind' | 'text' | 'href'>
    >
  ): RichLabelBuilder {
    return this.text(text, { ...(opts ?? {}), href });
  }

  sup(
    text: string,
    opts?: Partial<
      Omit<
        Extract<RichTextToken, { kind: 'span' }>,
        'kind' | 'text' | 'baselineShift'
      >
    >
  ): RichLabelBuilder {
    return this.text(text, { ...(opts ?? {}), baselineShift: 'super' });
  }

  sub(
    text: string,
    opts?: Partial<
      Omit<
        Extract<RichTextToken, { kind: 'span' }>,
        'kind' | 'text' | 'baselineShift'
      >
    >
  ): RichLabelBuilder {
    return this.text(text, { ...(opts ?? {}), baselineShift: 'sub' });
  }

  newline(): RichLabelBuilder {
    this._tokens.push({ kind: 'newline' });
    return this;
  }

  build(): RichText {
    return { kind: 'rich', tokens: [...this._tokens] };
  }
}

class VizBuilderImpl implements VizBuilder {
  private _viewBox = { w: 800, h: 600 };
  private _nodes = new Map<string, Partial<VizNode>>();
  private _edges = new Map<string, Partial<VizEdge>>();
  private _overlays: VizOverlaySpec[] = [];
  private _nodeOrder: string[] = [];
  private _edgeOrder: string[] = [];
  private _gridConfig: VizGridConfig | null = null;
  private _sketch: { enabled: boolean; seed?: number } | null = null;
  private _animationSpecs: AnimationSpec[] = [];
  private _mountedContainer: HTMLElement | null = null;
  private _panZoomController?: PanZoomController;
  private _tooltipController?: TooltipController;
  private _edgePathResolver: EdgePathResolver | null = null;

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

  /**
   * Toggle collapse state of a compartmented node and re-render.
   * Used internally by compartment onClick handlers' `toggle()` helper.
   * @internal
   */
  _performCollapseToggle(
    nodeId: string,
    animate?: number,
    anchorOverride?: import('./types').CollapseAnchor
  ): void {
    const n = this._nodes.get(nodeId);
    if (!n || !n.compartments || n.compartments.length === 0) return;
    if (!n.shape || !('h' in n.shape)) return;

    const anchor = anchorOverride ?? n.collapseAnchor ?? 'center';
    const newState = !n.collapsed;
    const isExpanding = !!n.collapsed; // currently collapsed → expanding
    const duration = animate ?? 0;
    const fullHeight = n.compartments.reduce((sum, c) => sum + c.height, 0);
    const headerH = n.compartments[0]!.height;
    const fromH = n.collapsed ? headerH : fullHeight;
    const toH = newState ? headerH : fullHeight;
    const originalY = n.pos?.y ?? 0;

    const container = this._mountedContainer;

    // Flip collapsed state immediately so content is rendered/hidden from frame 1.
    // During expand the growing rect clips overflow via clip-path so content
    // reveals smoothly as the rect grows rather than popping in at the end.
    const shape = { ...n.shape, h: fromH } as VizNode['shape'];
    this.updateNode(nodeId, { collapsed: newState, shape });

    if (duration > 0 && fromH !== toH && container) {
      const startTime = performance.now();
      const animateFrame = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        const currentH = fromH + (toH - fromH) * eased;
        const cur = this._nodes.get(nodeId);
        if (!cur?.shape || !('h' in cur.shape)) return;

        // Compute y offset so the chosen edge stays fixed
        const deltaH = currentH - fromH;
        const dy =
          anchor === 'top' ? deltaH / 2 : anchor === 'bottom' ? -deltaH / 2 : 0;

        const animShape = { ...cur.shape, h: currentH } as VizNode['shape'];
        this.updateNode(nodeId, {
          shape: animShape,
          pos: { x: cur.pos?.x ?? 0, y: originalY + dy },
        });
        this.commit(container);

        // Clip-path only needed when expanding: content is rendered but should
        // be hidden until the rect has grown to reveal it. When collapsing,
        // collapsed=true already hides the extra compartments so no clip needed.
        if (isExpanding) {
          const nodeGroup = container.querySelector(
            `[data-id="${nodeId}"]`
          ) as SVGGElement | null;
          if (nodeGroup) {
            if (t < 1) {
              const clipBottom = ((fullHeight - currentH) / fullHeight) * 100;
              nodeGroup.style.clipPath = `inset(0 0 ${clipBottom}% 0)`;
            } else {
              nodeGroup.style.clipPath = '';
            }
          }
        }

        if (t < 1) {
          requestAnimationFrame(animateFrame);
        }
      };
      requestAnimationFrame(animateFrame);
    } else {
      // No animation – apply instantly at target height
      const deltaH = toH - fromH;
      const dy =
        anchor === 'top' ? deltaH / 2 : anchor === 'bottom' ? -deltaH / 2 : 0;
      const finalShape = { ...n.shape, h: toH } as VizNode['shape'];
      this.updateNode(nodeId, {
        collapsed: newState,
        shape: finalShape,
        pos: { x: n.pos?.x ?? 0, y: originalY + dy },
      });
      if (container) this.commit(container);
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

    // Update tooltip data after re-render
    if (this._tooltipController) {
      const nodesById = new Map(scene.nodes.map((n) => [n.id, n]));
      const edgesById = new Map(scene.edges.map((e) => [e.id, e]));
      this._tooltipController.updateData(nodesById, edgesById);
      this._addTooltipA11y(svg, scene);
    }

    // Apply runtime overrides (if any).
    // Always recreate the context after _renderSceneToDOM so patchRuntime
    // never references stale / detached elements (fixes #81).
    const ctx = createRuntimePatchCtx(svg, {
      edgePathResolver: this._edgePathResolver,
    });
    runtimePatchCtxBySvg.set(svg, ctx);
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

  layout<O>(algorithm: SyncLayoutAlgorithm<O>, options?: O): VizBuilder {
    const scene = this.build(); // gets full constructed VizNode[]
    const graph: LayoutGraph = {
      nodes: scene.nodes,
      edges: scene.edges,
    };

    const result = algorithm(graph, options);

    // Guard: if the algorithm returned a Promise-like, throw a helpful error
    if (isPromiseLike(result)) {
      throw new Error(
        'VizBuilder.layout: received a Promise from the layout algorithm. ' +
          'Use .layoutAsync() for async layout engines.'
      );
    }

    this._applyLayoutResult(result);
    return this;
  }

  async layoutAsync<O>(
    algorithm: LayoutAlgorithm<O>,
    options?: O
  ): Promise<VizBuilder> {
    const scene = this.build();
    const graph: LayoutGraph = {
      nodes: scene.nodes,
      edges: scene.edges,
    };

    const result = await algorithm(graph, options);
    this._applyLayoutResult(result);
    return this;
  }

  /** @internal Apply positions and waypoints from a layout result. */
  private _applyLayoutResult(result: LayoutResult): void {
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
  }

  setEdgePathResolver(resolver: EdgePathResolver | null): VizBuilder {
    this._edgePathResolver = resolver;

    // If already mounted, update (or create) the runtime patch ctx so
    // `patchRuntime()` uses the resolver immediately.
    const container = this._mountedContainer;
    if (container) {
      const svg = container.querySelector('svg') as SVGSVGElement | null;
      if (svg) {
        const existing = runtimePatchCtxBySvg.get(svg);
        if (existing) {
          existing.edgePathResolver = resolver;
        } else {
          runtimePatchCtxBySvg.set(
            svg,
            createRuntimePatchCtx(svg, { edgePathResolver: resolver })
          );
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

  sketch(enabled: boolean = true, seed?: number): VizBuilder {
    this._sketch = enabled ? { enabled: true, seed } : null;
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
    nb.done(); // Resolve compartments (if any) before returning
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

  /** Creates a dangling edge with at least one free endpoint. */
  danglingEdge(id: string, opts?: EdgeOptions): EdgeBuilder;
  danglingEdge(id: string, opts: EdgeOptions): VizBuilder;
  danglingEdge(id: string, opts?: EdgeOptions): EdgeBuilder | VizBuilder {
    if (!this._edges.has(id)) {
      const edgeDef: VizEdge = { id } as VizEdge;
      if (opts?.fromAt) edgeDef.fromAt = opts.fromAt;
      if (opts?.toAt) edgeDef.toAt = opts.toAt;
      this._edges.set(id, edgeDef);
      this._edgeOrder.push(id);
    }
    const eb = new EdgeBuilderImpl(this, this._edges.get(id)!);
    if (!opts) return eb;
    applyEdgeOptions(eb, opts);
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

    this._sketch = scene.sketch
      ? { ...scene.sketch, enabled: scene.sketch.enabled ?? true }
      : null;

    return this;
  }

  /**
   * Builds the scene.
   * @returns The scene
   */
  build(): VizScene {
    this._edges.forEach((edge) => {
      // Only warn about missing nodes when a node id is specified
      // (dangling edges intentionally omit from/to).
      if (edge.from && !this._nodes.has(edge.from)) {
        console.warn(
          `VizBuilder: Edge ${edge.id} references missing source node ${edge.from}`
        );
      }
      if (edge.to && !this._nodes.has(edge.to)) {
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
      sketch: this._sketch ?? undefined,
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
   *
   * By default, this exports the **static scene** (ignores `node.runtime` / `edge.runtime`).
   * For animated export (frame snapshots), pass `{ includeRuntime: true }`.
   *
   * @deprecated Use `mount` instead
   */
  svg(opts?: SvgExportOptions): string {
    const scene = this.build();
    return this._renderSceneToSvg(scene, opts);
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

    // Set up tooltip interaction if any node/edge has tooltip data
    if (svg) {
      const hasTooltips =
        scene.nodes.some((n) => n.tooltip != null) ||
        scene.edges.some((e) => e.tooltip != null);
      if (hasTooltips) {
        // Destroy any prior tooltip controller
        if (this._tooltipController) this._tooltipController.destroy();
        const nodesById = new Map(scene.nodes.map((n) => [n.id, n]));
        const edgesById = new Map(scene.edges.map((e) => [e.id, e]));
        this._tooltipController = setupTooltip(
          container,
          svg,
          nodesById,
          edgesById
        );
        this._addTooltipA11y(svg, scene);
      }
    }

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

    // 2. Destroy tooltip controller
    if (this._tooltipController) {
      this._tooltipController.destroy();
      this._tooltipController = undefined;
    }

    // 3. Clear out mounted container and animations
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

  /**
   * Add `tabindex="0"` to node/edge groups that have tooltips for keyboard accessibility.
   */
  private _addTooltipA11y(svg: SVGSVGElement, scene: VizScene): void {
    const nodeGroups = svg.querySelectorAll<SVGGElement>(
      'g[data-viz-role="node-group"]'
    );
    const nodeTooltipIds = new Set(
      scene.nodes.filter((n) => n.tooltip != null).map((n) => n.id)
    );
    nodeGroups.forEach((el) => {
      const id = el.getAttribute('data-id');
      if (id && nodeTooltipIds.has(id) && !el.hasAttribute('tabindex')) {
        el.setAttribute('tabindex', '0');
      }
    });

    const edgeGroups = svg.querySelectorAll<SVGGElement>(
      'g[data-viz-role="edge-group"]'
    );
    const edgeTooltipIds = new Set(
      scene.edges.filter((e) => e.tooltip != null).map((e) => e.id)
    );
    edgeGroups.forEach((el) => {
      const id = el.getAttribute('data-id');
      if (id && edgeTooltipIds.has(id) && !el.hasAttribute('tabindex')) {
        el.setAttribute('tabindex', '0');
      }
    });
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
      ctx = createRuntimePatchCtx(svg, {
        edgePathResolver: this._edgePathResolver,
      });
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

      const neededShadows = new Map<
        string,
        { dx: number; dy: number; blur: number; color: string }
      >();
      nodes.forEach((n) => {
        if (n.style?.shadow) {
          const cfg = resolveShadow(n.style.shadow);
          const fid = shadowFilterId(cfg);
          if (!neededShadows.has(fid)) {
            neededShadows.set(fid, cfg);
          }
        }
      });
      neededShadows.forEach((cfg, fid) => {
        const tmp = document.createElementNS(svgNS, 'svg');
        tmp.innerHTML = shadowFilterSvg(fid, cfg);
        const filterEl = tmp.querySelector('filter');
        if (filterEl) {
          defs.appendChild(filterEl);
        }
      });

      const neededSketchSeeds = new Set<number>();
      const globalSketch = scene.sketch?.enabled;
      nodes.forEach((n) => {
        if (n.style?.sketch || globalSketch) {
          neededSketchSeeds.add(resolveSketchSeed(n.style, n.id));
        }
      });
      edges.forEach((e) => {
        if (e.style?.sketch || globalSketch) {
          let h = 0;
          for (let i = 0; i < e.id.length; i++) {
            h = (Math.imul(31, h) + e.id.charCodeAt(i)) | 0;
          }
          neededSketchSeeds.add(Math.abs(h));
        }
      });
      neededSketchSeeds.forEach((seed) => {
        const fid = sketchFilterId(seed);
        const tmp = document.createElementNS(svgNS, 'svg');
        tmp.innerHTML = sketchFilterSvg(fid, seed);
        const filterEl = tmp.querySelector('filter');
        if (filterEl) {
          defs.appendChild(filterEl);
        }
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

    // Update Viewbox
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
      const resolved = resolveDanglingEdge(edge, nodesById);
      if (!resolved) return;
      const { start, end } = resolved;

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
      const edgeSketched = edge.style?.sketch || scene.sketch?.enabled;
      if (edgeSketched) classes += ' viz-sketch';
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
      if (start && end && start === end) {
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

      // Allow consumer override of the SVG path `d` string.
      if (this._edgePathResolver) {
        const defaultResolver = (e: VizEdge): string => {
          const r = resolveDanglingEdge(e, nodesById);
          if (!r) return '';
          if (r.start && r.end && r.start === r.end)
            return computeSelfLoop(r.start, e).d;
          const endpoints = computeEdgeEndpoints(r.start, r.end, e);
          return computeEdgePath(
            endpoints.start,
            endpoints.end,
            e.routing,
            e.waypoints
          ).d;
        };

        try {
          const d = this._edgePathResolver(edge, scene, defaultResolver);
          if (typeof d === 'string' && d) edgePath.d = d;
        } catch (err) {
          console.warn(
            `VizBuilder: edge path resolver threw for edge ${edge.id}`,
            err
          );
        }
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

      if (edgeSketched) {
        let h = 0;
        for (let i = 0; i < edge.id.length; i++) {
          h = (Math.imul(31, h) + edge.id.charCodeAt(i)) | 0;
        }
        const seed = Math.abs(h);
        line.setAttribute('filter', `url(#${sketchFilterId(seed)})`);
      } else {
        line.removeAttribute('filter');
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

        const edgeLabelSvg = renderSvgText(pos.x, pos.y, lbl.rich ?? lbl.text, {
          className: labelClass,
          fill: lbl.fill,
          fontSize: lbl.fontSize,
          fontWeight: lbl.fontWeight,
          fontFamily: lbl.fontFamily,
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
      const nodeSketched = node.style?.sketch || scene.sketch?.enabled;
      if (nodeSketched) classes += ' viz-sketch';
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

      const resolvedNodeDash = resolveDasharray(node.style?.strokeDasharray);
      const nodeShadowFilter = node.style?.shadow
        ? `url(#${shadowFilterId(resolveShadow(node.style.shadow))})`
        : undefined;
      setSvgAttributes(shape!, {
        fill: node.style?.fill ?? 'none',
        stroke: node.style?.stroke ?? '#111',
        'stroke-width': node.style?.strokeWidth ?? 2,
        opacity: node.runtime?.opacity ?? node.style?.opacity,
        'stroke-dasharray': resolvedNodeDash || undefined,
        filter: nodeShadowFilter,
      });

      if (nodeSketched) {
        const seed = resolveSketchSeed(node.style, node.id);
        group.setAttribute('filter', `url(#${sketchFilterId(seed)})`);
      } else {
        group.removeAttribute('filter');
      }

      // Embedded media (rendered alongside the base shape)
      const existingImg = group.querySelector(
        ':scope > [data-viz-role="node-image"], :scope > .viz-node-image'
      ) as SVGImageElement | null;
      if (existingImg) existingImg.remove();
      const existingIcon = group.querySelector(
        ':scope > [data-viz-role="node-icon"], :scope > .viz-node-icon'
      ) as SVGGElement | null;
      if (existingIcon) existingIcon.remove();
      const existingSvg = group.querySelector(
        ':scope > [data-viz-role="node-svg"], :scope > .viz-node-svg'
      ) as SVGGElement | null;
      if (existingSvg) existingSvg.remove();

      // Insert immediately after the shape so labels/ports remain on top.
      let insertAfter: ChildNode = shape!;
      const insertNext = (el: SVGElement) => {
        group!.insertBefore(el, insertAfter.nextSibling);
        insertAfter = el;
      };

      if (node.image) {
        const tl = mediaTopLeft(node, node.image.width, node.image.height, {
          position: node.image.position,
          dx: node.image.dx,
          dy: node.image.dy,
        });

        const imgEl = document.createElementNS(svgNS, 'image');
        imgEl.setAttribute('class', 'viz-node-image');
        imgEl.setAttribute('data-viz-role', 'node-image');
        imgEl.setAttribute('x', String(tl.x));
        imgEl.setAttribute('y', String(tl.y));
        imgEl.setAttribute('width', String(node.image.width));
        imgEl.setAttribute('height', String(node.image.height));
        imgEl.setAttribute('href', node.image.href);
        if (node.image.preserveAspectRatio) {
          imgEl.setAttribute(
            'preserveAspectRatio',
            node.image.preserveAspectRatio
          );
        }
        insertNext(imgEl);
      }

      if (node.icon) {
        const svg = defaultCoreIconRegistry.get(node.icon.id);
        if (!svg) {
          console.warn(
            `VizCraft: icon '${node.icon.id}' not found. Use registerIcon().`
          );
        } else {
          const tl = mediaTopLeft(node, node.icon.size, node.icon.size, {
            position: node.icon.position,
            dx: node.icon.dx,
            dy: node.icon.dy,
          });

          const iconGroup = document.createElementNS(svgNS, 'g');
          iconGroup.setAttribute('class', 'viz-node-icon');
          iconGroup.setAttribute('data-viz-role', 'node-icon');
          iconGroup.setAttribute('transform', `translate(${tl.x} ${tl.y})`);
          if (node.icon.color) {
            // Keep formatting stable for tests (avoid CSSStyleDeclaration serialization)
            iconGroup.setAttribute('style', `color:${node.icon.color}`);
          }
          iconGroup.innerHTML = sizeSvgString(
            svg,
            node.icon.size,
            node.icon.size
          );
          insertNext(iconGroup);
        }
      }

      if (node.svgContent) {
        const tl = mediaTopLeft(
          node,
          node.svgContent.width,
          node.svgContent.height,
          {
            position: node.svgContent.position,
            dx: node.svgContent.dx,
            dy: node.svgContent.dy,
          }
        );
        const svgGroup = document.createElementNS(svgNS, 'g');
        svgGroup.setAttribute('class', 'viz-node-svg');
        svgGroup.setAttribute('data-viz-role', 'node-svg');
        svgGroup.setAttribute('transform', `translate(${tl.x} ${tl.y})`);
        svgGroup.innerHTML = normalizeSvgContent(
          node.svgContent.content,
          node.svgContent.width,
          node.svgContent.height
        );
        insertNext(svgGroup);
      }

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

      // Compartment divider lines and labels
      const hasCompartments = node.compartments && node.compartments.length > 0;
      const isCollapsed = !!(node.collapsed && hasCompartments);

      // Remove stale compartment elements before re-creating
      group
        .querySelectorAll(
          '[data-viz-role="compartment-divider"],[data-viz-role="compartment-label"],[data-viz-role="compartment-entry"],[data-viz-role="collapse-indicator"],[data-viz-role="collapse-indicator-group"]'
        )
        .forEach((el) => el.remove());

      // Toggle collapsed class on the group
      group.classList.toggle('viz-node-collapsed', isCollapsed);

      if (hasCompartments && 'w' in node.shape) {
        const sw = (node.shape as { w: number }).w;
        const sh = (node.shape as { h: number }).h;
        const nodeTop = y - sh / 2;
        const compartmentPadding = 8;

        // When collapsed, only render the first compartment (header)
        const visibleCount = isCollapsed ? 1 : node.compartments!.length;

        for (let ci = 0; ci < visibleCount; ci++) {
          const c = node.compartments![ci]!;

          // Draw divider line between compartments (skip the first one)
          if (ci > 0) {
            const dividerY = nodeTop + c.y;
            const divider = document.createElementNS(svgNS, 'line');
            divider.setAttribute('class', 'viz-compartment-divider');
            divider.setAttribute('data-viz-role', 'compartment-divider');
            divider.setAttribute('data-compartment', c.id);
            divider.setAttribute('x1', String(x - sw / 2));
            divider.setAttribute('y1', String(dividerY));
            divider.setAttribute('x2', String(x + sw / 2));
            divider.setAttribute('y2', String(dividerY));
            divider.setAttribute('stroke', node.style?.stroke ?? '#111');
            divider.setAttribute(
              'stroke-width',
              String(node.style?.strokeWidth ?? 2)
            );
            group.appendChild(divider);
          }

          // Render per-entry text lines (takes precedence over label)
          if (c.entries && c.entries.length > 0) {
            for (const entry of c.entries) {
              const elx =
                x - sw / 2 + compartmentPadding + (entry.label?.dx || 0);
              const padT = entry.paddingTop ?? 0;
              const padB = entry.paddingBottom ?? 0;
              const contentH = entry.height - padT - padB;
              const ely =
                nodeTop +
                c.y +
                entry.y +
                padT +
                contentH / 2 +
                (entry.label?.dy || 0);
              const entryClass =
                `viz-compartment-entry ${entry.className || ''} ${entry.label?.className || ''}`.trim();

              const entryLabelSvg = renderSvgText(
                elx,
                ely,
                entry.label?.rich ?? entry.text,
                {
                  className: entryClass,
                  fill: entry.label?.fill,
                  fontSize: entry.label?.fontSize,
                  fontWeight: entry.label?.fontWeight,
                  fontFamily: entry.label?.fontFamily,
                  textAnchor: entry.label?.textAnchor || 'start',
                  dominantBaseline: entry.label?.dominantBaseline || 'middle',
                  maxWidth:
                    entry.label?.maxWidth ?? sw - compartmentPadding * 2,
                  lineHeight: entry.label?.lineHeight,
                  verticalAlign: entry.label?.verticalAlign,
                  overflow: entry.label?.overflow,
                }
              ).replace(
                '<text ',
                `<text data-viz-role="compartment-entry" data-compartment="${c.id}" data-entry="${entry.id}" `
              );

              group.insertAdjacentHTML('beforeend', entryLabelSvg);
            }
          } else if (c.label) {
            // Render compartment label (single text block)
            const clx = x - sw / 2 + compartmentPadding + (c.label.dx || 0);
            const cly = nodeTop + c.y + c.height / 2 + (c.label.dy || 0);
            const cLabelClass = `viz-compartment-label ${c.label.className || ''}`;

            const cLabelSvg = renderSvgText(
              clx,
              cly,
              c.label.rich ?? c.label.text,
              {
                className: cLabelClass,
                fill: c.label.fill,
                fontSize: c.label.fontSize,
                fontWeight: c.label.fontWeight,
                fontFamily: c.label.fontFamily,
                textAnchor: c.label.textAnchor || 'start',
                dominantBaseline: c.label.dominantBaseline || 'middle',
                maxWidth: c.label.maxWidth ?? sw - compartmentPadding * 2,
                lineHeight: c.label.lineHeight,
                verticalAlign: c.label.verticalAlign,
                overflow: c.label.overflow,
              }
            ).replace(
              '<text ',
              `<text data-viz-role="compartment-label" data-compartment="${c.id}" `
            );

            group.insertAdjacentHTML('beforeend', cLabelSvg);
          }
        }

        // Wire up per-entry click handlers (only for visible compartments)
        const wireCompartments = isCollapsed
          ? [node.compartments![0]!]
          : node.compartments!;
        for (const c of wireCompartments) {
          if (!c.entries) continue;
          for (const entry of c.entries) {
            if (!entry.onClick) continue;
            const entryEl = group.querySelector(
              `[data-viz-role="compartment-entry"][data-compartment="${c.id}"][data-entry="${entry.id}"]`
            );
            if (entryEl) {
              entryEl.addEventListener('click', (e) => {
                e.stopPropagation();
                entry.onClick!();
              });
              (entryEl as SVGElement).style.cursor = 'pointer';
            }
          }
        }

        // Collapse indicator (triangle) — shown when the first compartment
        // has an onClick handler or the node is currently collapsed.
        const firstComp = node.compartments![0]!;
        const indicatorOpts = node.collapseIndicator;
        const indicatorHidden =
          indicatorOpts === false ||
          (typeof indicatorOpts === 'object' &&
            indicatorOpts.visible === false);
        const isCollapsible = isCollapsed || !!firstComp.onClick;
        if (
          isCollapsible &&
          !indicatorHidden &&
          node.compartments!.length > 1
        ) {
          const indicatorSize = 6;
          const ix = x + sw / 2 - compartmentPadding - indicatorSize;
          const firstCompH = node.compartments![0]!.height;
          const iy = nodeTop + firstCompH / 2;
          const indicatorColor =
            (typeof indicatorOpts === 'object'
              ? indicatorOpts.color
              : undefined) ??
            node.style?.stroke ??
            '#111';
          const customRender =
            typeof indicatorOpts === 'object'
              ? indicatorOpts.render
              : undefined;

          let indicatorEl: SVGElement;
          if (customRender) {
            const svgStr = customRender(isCollapsed);
            const wrapper = document.createElementNS(svgNS, 'g');
            wrapper.innerHTML = svgStr;
            indicatorEl = (wrapper.firstElementChild as SVGElement) ?? wrapper;
            if (indicatorEl === wrapper && wrapper.childNodes.length > 0) {
              indicatorEl = wrapper;
            }
            indicatorEl.setAttribute('data-viz-role', 'collapse-indicator');
          } else {
            const indicator = document.createElementNS(svgNS, 'polygon');
            indicator.setAttribute('data-viz-role', 'collapse-indicator');
            if (isCollapsed) {
              indicator.setAttribute(
                'points',
                `${ix},${iy - indicatorSize} ${ix + indicatorSize},${iy} ${ix},${iy + indicatorSize}`
              );
            } else {
              indicator.setAttribute(
                'points',
                `${ix},${iy - indicatorSize / 2} ${ix + indicatorSize * 2},${iy - indicatorSize / 2} ${ix + indicatorSize},${iy + indicatorSize / 2}`
              );
            }
            indicator.setAttribute('fill', indicatorColor);
            indicator.setAttribute('class', 'viz-collapse-indicator');
            indicatorEl = indicator;
          }

          // Invisible hit-area rect for easier clicking
          const hitPad = 10;
          const hitRect = document.createElementNS(svgNS, 'rect');
          hitRect.setAttribute('x', String(ix - hitPad));
          hitRect.setAttribute('y', String(iy - indicatorSize - hitPad));
          hitRect.setAttribute('width', String(indicatorSize * 2 + hitPad * 2));
          hitRect.setAttribute(
            'height',
            String(indicatorSize * 2 + hitPad * 2)
          );
          hitRect.setAttribute('fill', 'transparent');
          hitRect.style.cursor = 'pointer';

          // Wrap indicator + hit rect in a group
          const indicatorGroup = document.createElementNS(svgNS, 'g');
          indicatorGroup.setAttribute(
            'data-viz-role',
            'collapse-indicator-group'
          );
          indicatorGroup.style.cursor = 'pointer';
          indicatorGroup.appendChild(hitRect);
          indicatorGroup.appendChild(indicatorEl);

          if (firstComp.onClick) {
            const nodeId = node.id;
            const compartmentId = firstComp.id;
            // eslint-disable-next-line @typescript-eslint/no-this-alias
            const builder = this;
            indicatorGroup.addEventListener('click', (e) => {
              e.stopPropagation();
              const currentNode = builder._nodes.get(nodeId);
              firstComp.onClick!({
                nodeId,
                compartmentId,
                collapsed: !!currentNode?.collapsed,
                collapseAnchor: currentNode?.collapseAnchor ?? 'center',
                toggle: (toggleOpts) =>
                  builder._performCollapseToggle(
                    nodeId,
                    toggleOpts?.animate,
                    toggleOpts?.anchor
                  ),
              });
            });
          }

          group.appendChild(indicatorGroup);
        }

        // Wire compartment-level onClick handlers
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const builderRef = this;
        for (const c of wireCompartments) {
          if (!c.onClick) continue;
          const compLabels = group.querySelectorAll(
            `[data-viz-role="compartment-label"][data-compartment="${c.id}"]`
          );
          const nodeId = node.id;
          const compartmentId = c.id;
          const handler = c.onClick;
          const attachClick = (el: Element) => {
            el.addEventListener('click', (e) => {
              e.stopPropagation();
              const currentNode = builderRef._nodes.get(nodeId);
              handler({
                nodeId,
                compartmentId,
                collapsed: !!currentNode?.collapsed,
                collapseAnchor: currentNode?.collapseAnchor ?? 'center',
                toggle: (toggleOpts) =>
                  builderRef._performCollapseToggle(
                    nodeId,
                    toggleOpts?.animate,
                    toggleOpts?.anchor
                  ),
              });
            });
            (el as SVGElement).style.cursor = 'pointer';
          };
          compLabels.forEach(attachClick);
        }
      }

      // Label coordinate computation
      let lx = x + (node.label?.dx || 0);
      let ly = y + (node.label?.dy || 0);
      let showLabel = !!node.label && !hasCompartments;

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
        const nodeLabelSvg = renderSvgText(
          lx,
          ly,
          node.label.rich ?? node.label.text,
          {
            className: labelClass,
            fill: node.label.fill,
            fontSize: node.label.fontSize,
            fontWeight: node.label.fontWeight,
            fontFamily: node.label.fontFamily,
            textAnchor: node.label.textAnchor || 'middle',
            dominantBaseline: node.label.dominantBaseline || 'middle',
            maxWidth: node.label.maxWidth,
            lineHeight: node.label.lineHeight,
            verticalAlign: node.label.verticalAlign,
            overflow: node.label.overflow,
          }
        ).replace('<text ', '<text data-viz-role="node-label" ');

        group.insertAdjacentHTML('beforeend', nodeLabelSvg);
        label = group.querySelector(
          '[data-viz-role="node-label"]'
        ) as SVGTextElement | null;
      }

      // Badges — small text indicators pinned to node corners
      const oldBadges = group.querySelectorAll('[data-viz-role="badge"]');
      oldBadges.forEach((el) => el.remove());

      if (node.badges && node.badges.length > 0) {
        const bbox = getNodeBoundingBox(node.shape);
        const hw = bbox.width / 2;
        const hh = bbox.height / 2;

        for (const badge of node.badges) {
          const fs = badge.fontSize ?? 10;
          const pad = 3;
          const pillH = fs + pad * 2;
          const pillW = Math.max(fs * badge.text.length * 0.7 + pad * 2, pillH);

          let bx: number;
          let by: number;
          if (badge.position === 'top-left') {
            bx = x - hw - pillW / 4;
            by = y - hh - pillH / 4;
          } else if (badge.position === 'top-right') {
            bx = x + hw - (pillW * 3) / 4;
            by = y - hh - pillH / 4;
          } else if (badge.position === 'bottom-left') {
            bx = x - hw - pillW / 4;
            by = y + hh - (pillH * 3) / 4;
          } else {
            bx = x + hw - (pillW * 3) / 4;
            by = y + hh - (pillH * 3) / 4;
          }

          const badgeG = document.createElementNS(svgNS, 'g');
          badgeG.setAttribute('class', 'viz-badge');
          badgeG.setAttribute('data-viz-role', 'badge');

          if (badge.background) {
            const pill = document.createElementNS(svgNS, 'rect');
            pill.setAttribute('x', String(bx));
            pill.setAttribute('y', String(by));
            pill.setAttribute('width', String(pillW));
            pill.setAttribute('height', String(pillH));
            pill.setAttribute('rx', String(pillH / 2));
            pill.setAttribute('fill', badge.background);
            badgeG.appendChild(pill);
          }

          const txt = document.createElementNS(svgNS, 'text');
          txt.setAttribute('x', String(bx + pillW / 2));
          txt.setAttribute('y', String(by + pillH / 2));
          txt.setAttribute('text-anchor', 'middle');
          txt.setAttribute('dominant-baseline', 'central');
          txt.setAttribute('font-size', String(fs));
          if (badge.fill) txt.setAttribute('fill', badge.fill);
          txt.textContent = badge.text;
          badgeG.appendChild(txt);

          group.appendChild(badgeG);
        }
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
    runtimePatchCtxBySvg.set(
      svg,
      createRuntimePatchCtx(svg, { edgePathResolver: this._edgePathResolver })
    );
  }

  /**
   * Returns the SVG string representation of the scene.
   * @deprecated The use of this method is deprecated. Use `mount` instead.
   * @param scene The scene to render
   * @returns The SVG string representation of the scene
   */
  private _renderSceneToSvg(scene: VizScene, opts?: SvgExportOptions): string {
    const includeRuntime = opts?.includeRuntime === true;

    const { viewBox, nodes, edges, overlays } = scene;

    // When exporting runtime, containers can move and their children should follow.
    // We bake that into the exported node positions by writing `runtime.x/y` into cloned nodes.
    const parentDeltas = new Map<string, { dx: number; dy: number }>();
    if (includeRuntime) {
      for (const n of nodes) {
        if (!n.container) continue;
        const dx = (n.runtime?.x ?? n.pos.x) - n.pos.x;
        const dy = (n.runtime?.y ?? n.pos.y) - n.pos.y;
        if (dx !== 0 || dy !== 0) parentDeltas.set(n.id, { dx, dy });
      }
    }

    const exportNodes: VizNode[] = nodes.map((n) => {
      if (!includeRuntime) return { ...n, runtime: undefined };

      const runtime = n.runtime ? { ...n.runtime } : {};
      let x = runtime.x ?? n.pos.x;
      let y = runtime.y ?? n.pos.y;

      if (n.parentId) {
        const delta = parentDeltas.get(n.parentId);
        if (delta) {
          x += delta.dx;
          y += delta.dy;
        }
      }

      const shouldWriteXY =
        runtime.x !== undefined ||
        runtime.y !== undefined ||
        x !== n.pos.x ||
        y !== n.pos.y;

      if (shouldWriteXY) {
        runtime.x = x;
        runtime.y = y;
      }

      const runtimeOut = Object.keys(runtime).length > 0 ? runtime : undefined;
      return { ...n, runtime: runtimeOut };
    });

    const exportEdges: VizEdge[] = edges.map((e) =>
      includeRuntime ? e : ({ ...e, runtime: undefined } as VizEdge)
    );

    const exportScene: VizScene = {
      ...scene,
      nodes: exportNodes,
      edges: exportEdges,
    };

    const nodesById = new Map(exportNodes.map((n) => [n.id, n] as const));
    const edgesById = new Map(exportEdges.map((e) => [e.id, e] as const));

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

    const exportShadows = new Map<
      string,
      { dx: number; dy: number; blur: number; color: string }
    >();
    exportNodes.forEach((n) => {
      if (n.style?.shadow) {
        const cfg = resolveShadow(n.style.shadow);
        const fid = shadowFilterId(cfg);
        if (!exportShadows.has(fid)) {
          exportShadows.set(fid, cfg);
        }
      }
    });
    exportShadows.forEach((cfg, fid) => {
      svgContent += shadowFilterSvg(fid, cfg);
    });

    const exportSketchSeeds = new Set<number>();
    const globalSketchExport = exportScene.sketch?.enabled;
    exportNodes.forEach((n) => {
      if (n.style?.sketch || globalSketchExport) {
        exportSketchSeeds.add(resolveSketchSeed(n.style, n.id));
      }
    });
    exportEdges.forEach((e) => {
      if (e.style?.sketch || globalSketchExport) {
        let h = 0;
        for (let i = 0; i < e.id.length; i++) {
          h = (Math.imul(31, h) + e.id.charCodeAt(i)) | 0;
        }
        exportSketchSeeds.add(Math.abs(h));
      }
    });
    exportSketchSeeds.forEach((seed) => {
      svgContent += sketchFilterSvg(sketchFilterId(seed), seed);
    });

    svgContent += `
        </defs>`;

    // Render Edges
    svgContent += '<g class="viz-layer-edges" data-viz-layer="edges">';
    exportEdges.forEach((edge) => {
      const resolved = resolveDanglingEdge(edge, nodesById);
      if (!resolved) return;
      const { start, end } = resolved;

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
      if (start && end && start === end) {
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

      if (this._edgePathResolver) {
        const defaultResolver = (e: VizEdge): string => {
          const r = resolveDanglingEdge(e, nodesById);
          if (!r) return '';
          if (r.start && r.end && r.start === r.end)
            return computeSelfLoop(r.start, e).d;
          const endpoints = computeEdgeEndpoints(r.start, r.end, e);
          return computeEdgePath(
            endpoints.start,
            endpoints.end,
            e.routing,
            e.waypoints
          ).d;
        };

        try {
          const d = this._edgePathResolver(edge, exportScene, (e) =>
            defaultResolver(e)
          );
          if (typeof d === 'string' && d) edgePath.d = d;
        } catch (err) {
          console.warn(
            `VizBuilder: edge path resolver threw for edge ${edge.id}`,
            err
          );
        }
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

      const edgeSketched = edge.style?.sketch || globalSketchExport;
      const sketchClass = edgeSketched ? ' viz-sketch' : '';

      svgContent += `<g data-id="${edge.id}" data-viz-role="edge-group" class="viz-edge-group${sketchClass} ${edge.className || ''} ${animClasses}" style="${animStyleStr}${runtimeStyle}">`;

      let edgeInlineStyle = lineRuntimeStyle;
      if (edge.style?.stroke !== undefined)
        edgeInlineStyle += `stroke: ${edge.style.stroke}; `;
      if (edge.style?.strokeWidth !== undefined)
        edgeInlineStyle += `stroke-width: ${edge.style.strokeWidth}; `;
      if (edge.style?.fill !== undefined)
        edgeInlineStyle += `fill: ${edge.style.fill}; `;
      if (
        edge.style?.opacity !== undefined &&
        edge.runtime?.opacity === undefined
      )
        edgeInlineStyle += `opacity: ${edge.style.opacity}; `;
      if (edge.style?.strokeDasharray !== undefined) {
        const resolved = resolveDasharray(edge.style.strokeDasharray);
        if (resolved) edgeInlineStyle += `stroke-dasharray: ${resolved}; `;
      }
      let edgeSketchFilterAttr = '';
      if (edgeSketched) {
        let h = 0;
        for (let i = 0; i < edge.id.length; i++) {
          h = (Math.imul(31, h) + edge.id.charCodeAt(i)) | 0;
        }
        edgeSketchFilterAttr = ` filter="url(#${sketchFilterId(Math.abs(h))})"`;
      }
      svgContent += `<path d="${edgePath.d}" class="viz-edge" data-viz-role="edge-line" ${markerEnd} ${markerStart} style="${edgeInlineStyle}"${lineRuntimeAttrs}${edgeSketchFilterAttr} />`;

      // Edge Labels (multi-position)
      const allLabels = collectEdgeLabels(edge);
      allLabels.forEach((lbl, idx) => {
        const pos = resolveEdgeLabelPosition(lbl, edgePath);
        const labelClass = `viz-edge-label ${lbl.className || ''}`;

        const edgeLabelSvg = renderSvgText(pos.x, pos.y, lbl.rich ?? lbl.text, {
          className: labelClass,
          fill: lbl.fill,
          fontSize: lbl.fontSize,
          fontWeight: lbl.fontWeight,
          fontFamily: lbl.fontFamily,
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
    exportNodes.forEach((n) => {
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
      const shape = effectiveShape(node);

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
      const nodeSketched = node.style?.sketch || globalSketchExport;
      const className = `viz-node-group${isContainer ? ' viz-container' : ''}${nodeSketched ? ' viz-sketch' : ''}${node.collapsed && node.compartments && node.compartments.length > 0 ? ' viz-node-collapsed' : ''} ${node.className || ''} ${animClasses}`;

      const scale = node.runtime?.scale;
      const rotation = node.runtime?.rotation;
      let groupFilterAttr = '';
      if (nodeSketched) {
        const seed = resolveSketchSeed(node.style, node.id);
        groupFilterAttr = ` filter="url(#${sketchFilterId(seed)})"`;
      }
      const transformAttr =
        scale !== undefined || rotation !== undefined
          ? ` transform="translate(${x} ${y}) rotate(${rotation ?? 0}) scale(${scale ?? 1}) translate(${-x} ${-y})"`
          : '';

      content += `<g data-id="${node.id}" data-viz-role="node-group" class="${className}" style="${animStyleStr}"${transformAttr}${groupFilterAttr}>`;

      const resolvedExportNodeDash = resolveDasharray(
        node.style?.strokeDasharray
      );
      const exportShadowFilter = node.style?.shadow
        ? `url(#${shadowFilterId(resolveShadow(node.style.shadow))})`
        : undefined;
      const shapeStyleAttrs = svgAttributeString({
        fill: node.style?.fill ?? 'none',
        stroke: node.style?.stroke ?? '#111',
        'stroke-width': node.style?.strokeWidth ?? 2,
        opacity:
          node.runtime?.opacity !== undefined ? undefined : node.style?.opacity,
        'stroke-dasharray': resolvedExportNodeDash || undefined,
        filter: exportShadowFilter,
      });

      // Shape
      content += shapeSvgMarkup(shape, { x, y }, shapeStyleAttrs);

      // Embedded media (rendered alongside the base shape)
      if (node.image) {
        const tl = mediaTopLeft(node, node.image.width, node.image.height, {
          position: node.image.position,
          dx: node.image.dx,
          dy: node.image.dy,
        });
        const preserve = node.image.preserveAspectRatio
          ? ` preserveAspectRatio="${escapeXmlAttr(node.image.preserveAspectRatio)}"`
          : '';
        const safeHref = escapeXmlAttr(node.image.href);
        content += `<image x="${tl.x}" y="${tl.y}" width="${node.image.width}" height="${node.image.height}" href="${safeHref}"${preserve} class="viz-node-image" data-viz-role="node-image" />`;
      }

      if (node.icon) {
        const svg = defaultCoreIconRegistry.get(node.icon.id);
        if (!svg) {
          console.warn(
            `VizCraft: icon '${node.icon.id}' not found. Use registerIcon().`
          );
        } else {
          const tl = mediaTopLeft(node, node.icon.size, node.icon.size, {
            position: node.icon.position,
            dx: node.icon.dx,
            dy: node.icon.dy,
          });
          const colorStyle = node.icon.color
            ? ` style="color:${escapeXmlAttr(node.icon.color)}"`
            : '';
          const sized = sizeSvgString(svg, node.icon.size, node.icon.size);
          content += `<g transform="translate(${tl.x} ${tl.y})" class="viz-node-icon" data-viz-role="node-icon"${colorStyle}>${sized}</g>`;
        }
      }

      if (node.svgContent) {
        const tl = mediaTopLeft(
          node,
          node.svgContent.width,
          node.svgContent.height,
          {
            position: node.svgContent.position,
            dx: node.svgContent.dx,
            dy: node.svgContent.dy,
          }
        );
        const normalized = normalizeSvgContent(
          node.svgContent.content,
          node.svgContent.width,
          node.svgContent.height
        );
        content += `<g transform="translate(${tl.x} ${tl.y})" class="viz-node-svg" data-viz-role="node-svg">${normalized}</g>`;
      }

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

      // Compartment divider lines and labels
      const hasCompartments = node.compartments && node.compartments.length > 0;
      const isCollapsedSvg = !!(node.collapsed && hasCompartments);

      if (hasCompartments && 'w' in shape) {
        const sw = (shape as { w: number }).w;
        const sh = (shape as { h: number }).h;
        const nodeTop = y - sh / 2;
        const compartmentPadding = 8;

        const visibleCount = isCollapsedSvg ? 1 : node.compartments!.length;

        for (let ci = 0; ci < visibleCount; ci++) {
          const c = node.compartments![ci]!;

          // Draw divider line between compartments (skip the first one)
          if (ci > 0) {
            const dividerY = nodeTop + c.y;
            content += `<line x1="${x - sw / 2}" y1="${dividerY}" x2="${x + sw / 2}" y2="${dividerY}" stroke="${node.style?.stroke ?? '#111'}" stroke-width="${node.style?.strokeWidth ?? 2}" class="viz-compartment-divider" data-viz-role="compartment-divider" data-compartment="${c.id}" />`;
          }

          // Render per-entry text lines (takes precedence over label)
          if (c.entries && c.entries.length > 0) {
            for (const entry of c.entries) {
              const elx =
                x - sw / 2 + compartmentPadding + (entry.label?.dx || 0);
              const padT = entry.paddingTop ?? 0;
              const padB = entry.paddingBottom ?? 0;
              const contentH = entry.height - padT - padB;
              const ely =
                nodeTop +
                c.y +
                entry.y +
                padT +
                contentH / 2 +
                (entry.label?.dy || 0);
              const entryClass =
                `viz-compartment-entry ${entry.className || ''} ${entry.label?.className || ''}`.trim();

              const entryLabelSvg = renderSvgText(
                elx,
                ely,
                entry.label?.rich ?? entry.text,
                {
                  className: entryClass,
                  fill: entry.label?.fill,
                  fontSize: entry.label?.fontSize,
                  fontWeight: entry.label?.fontWeight,
                  fontFamily: entry.label?.fontFamily,
                  textAnchor: entry.label?.textAnchor || 'start',
                  dominantBaseline: entry.label?.dominantBaseline || 'middle',
                  maxWidth:
                    entry.label?.maxWidth ?? sw - compartmentPadding * 2,
                  lineHeight: entry.label?.lineHeight,
                  verticalAlign: entry.label?.verticalAlign,
                  overflow: entry.label?.overflow,
                }
              ).replace(
                '<text ',
                `<text data-viz-role="compartment-entry" data-compartment="${escapeXmlAttr(c.id)}" data-entry="${escapeXmlAttr(entry.id)}" `
              );

              content += entryLabelSvg;
            }
          } else if (c.label) {
            // Render compartment label (single text block)
            const clx = x - sw / 2 + compartmentPadding + (c.label.dx || 0);
            const cly = nodeTop + c.y + c.height / 2 + (c.label.dy || 0);
            const cLabelClass = `viz-compartment-label ${c.label.className || ''}`;

            const cLabelSvg = renderSvgText(
              clx,
              cly,
              c.label.rich ?? c.label.text,
              {
                className: cLabelClass,
                fill: c.label.fill,
                fontSize: c.label.fontSize,
                fontWeight: c.label.fontWeight,
                fontFamily: c.label.fontFamily,
                textAnchor: c.label.textAnchor || 'start',
                dominantBaseline: c.label.dominantBaseline || 'middle',
                maxWidth: c.label.maxWidth ?? sw - compartmentPadding * 2,
                lineHeight: c.label.lineHeight,
                verticalAlign: c.label.verticalAlign,
                overflow: c.label.overflow,
              }
            ).replace(
              '<text ',
              `<text data-viz-role="compartment-label" data-compartment="${c.id}" `
            );

            content += cLabelSvg;
          }
        }

        // Collapse indicator
        const firstCompSvg = node.compartments![0]!;
        const indicatorOptsSvg = node.collapseIndicator;
        const indicatorHiddenSvg =
          indicatorOptsSvg === false ||
          (typeof indicatorOptsSvg === 'object' &&
            indicatorOptsSvg.visible === false);
        const isCollapsibleSvg = isCollapsedSvg || !!firstCompSvg.onClick;
        if (
          isCollapsibleSvg &&
          !indicatorHiddenSvg &&
          node.compartments!.length > 1
        ) {
          const indicatorSize = 6;
          const ix = x + sw / 2 - compartmentPadding - indicatorSize;
          const firstCompH = node.compartments![0]!.height;
          const iy = nodeTop + firstCompH / 2;
          const indicatorColorSvg =
            (typeof indicatorOptsSvg === 'object'
              ? indicatorOptsSvg.color
              : undefined) ??
            node.style?.stroke ??
            '#111';
          const customRenderSvg =
            typeof indicatorOptsSvg === 'object'
              ? indicatorOptsSvg.render
              : undefined;
          if (customRenderSvg) {
            content += customRenderSvg(isCollapsedSvg);
          } else if (isCollapsedSvg) {
            content += `<polygon data-viz-role="collapse-indicator" class="viz-collapse-indicator" points="${ix},${iy - indicatorSize} ${ix + indicatorSize},${iy} ${ix},${iy + indicatorSize}" fill="${indicatorColorSvg}" />`;
          } else {
            content += `<polygon data-viz-role="collapse-indicator" class="viz-collapse-indicator" points="${ix},${iy - indicatorSize / 2} ${ix + indicatorSize * 2},${iy - indicatorSize / 2} ${ix + indicatorSize},${iy + indicatorSize / 2}" fill="${indicatorColorSvg}" />`;
          }
        }
      }

      // Label (suppressed when compartments are present)
      if (node.label && !hasCompartments) {
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

        const nodeLabelSvg = renderSvgText(
          lx,
          ly,
          node.label.rich ?? node.label.text,
          {
            className: labelClass,
            fill: node.label.fill,
            fontSize: node.label.fontSize,
            fontWeight: node.label.fontWeight,
            fontFamily: node.label.fontFamily,
            textAnchor: node.label.textAnchor || 'middle',
            dominantBaseline: node.label.dominantBaseline || 'middle',
            maxWidth: node.label.maxWidth,
            lineHeight: node.label.lineHeight,
            verticalAlign: node.label.verticalAlign,
            overflow: node.label.overflow,
          }
        );

        const augmentedSvg = nodeLabelSvg.replace(
          '<text ',
          '<text data-viz-role="node-label" '
        );
        content += augmentedSvg;
      }

      // Badges — small text indicators pinned to node corners
      if (node.badges && node.badges.length > 0) {
        const bbox = getNodeBoundingBox(shape);
        const hw = bbox.width / 2;
        const hh = bbox.height / 2;

        for (const badge of node.badges) {
          const fs = badge.fontSize ?? 10;
          const pad = 3;
          const pillH = fs + pad * 2;
          const pillW = Math.max(fs * badge.text.length * 0.7 + pad * 2, pillH);

          let bx: number;
          let by: number;
          if (badge.position === 'top-left') {
            bx = x - hw - pillW / 4;
            by = y - hh - pillH / 4;
          } else if (badge.position === 'top-right') {
            bx = x + hw - (pillW * 3) / 4;
            by = y - hh - pillH / 4;
          } else if (badge.position === 'bottom-left') {
            bx = x - hw - pillW / 4;
            by = y + hh - (pillH * 3) / 4;
          } else {
            bx = x + hw - (pillW * 3) / 4;
            by = y + hh - (pillH * 3) / 4;
          }

          content += '<g class="viz-badge" data-viz-role="badge">';
          if (badge.background) {
            const safeBg = escapeXmlAttr(badge.background);
            content += `<rect x="${bx}" y="${by}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${safeBg}" />`;
          }
          const safeFill = badge.fill
            ? ` fill="${escapeXmlAttr(badge.fill)}"`
            : '';
          const safeText = badge.text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          content += `<text x="${bx + pillW / 2}" y="${by + pillH / 2}" text-anchor="middle" dominant-baseline="central" font-size="${fs}"${safeFill}>${safeText}</text>`;
          content += '</g>';
        }
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
    exportNodes.forEach((node) => {
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
            scene: exportScene,
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

export function viz(): VizBuilder {
  return new VizBuilderImpl();
}
