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
} from './types';
import { OVERLAY_RUNTIME_DIRTY } from './types';
import { DEFAULT_VIZ_CSS } from './styles';
import { defaultCoreAnimationRegistry } from './animations';
import { defaultCoreOverlayRegistry } from './overlays';
import { OverlayBuilder } from './overlayBuilder';
import {
  createRuntimePatchCtx,
  patchRuntime,
  type RuntimePatchCtx,
} from './runtimePatcher';
import { computeEdgePath, computeEdgeEndpoints } from './edgePaths';

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

const runtimePatchCtxBySvg = new WeakMap<SVGSVGElement, RuntimePatchCtx>();

const autoplayControllerByContainer = new WeakMap<
  HTMLElement,
  PlaybackController
>();

import {
  applyShapeGeometry,
  effectivePos,
  getShapeBehavior,
  shapeSvgMarkup,
} from './shapes';

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

interface VizBuilder {
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
  node(id: string): NodeBuilder;
  edge(from: string, to: string, id?: string): EdgeBuilder;
  build(): VizScene;

  // Internal helper for NodeBuilder to access grid config
  _getGridConfig(): VizGridConfig | null;
  _getViewBox(): { w: number; h: number };
  svg(): string;
  mount(container: HTMLElement): void;
  mount(
    container: HTMLElement,
    opts: { autoplay?: boolean; css?: string | string[] }
  ): void;

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
   * Applies runtime-only patches (node.runtime / edge.runtime) to the mounted SVG.
   * This avoids full DOM reconciliation and is intended for animation frame updates.
   */
  patchRuntime(container: HTMLElement): void;
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
  animate(type: string, config?: AnimationConfig): NodeBuilder;
  animate(cb: (anim: AnimationBuilder) => unknown): NodeBuilder;

  /** Sugar for `animate(a => a.to(...))`. */
  animateTo(props: AnimatableProps, opts: TweenOptions): NodeBuilder;
  data(payload: unknown): NodeBuilder;
  onClick(handler: (id: string, node: VizNode) => void): NodeBuilder;
  container(config?: ContainerConfig): NodeBuilder;
  parent(parentId: string): NodeBuilder;
  done(): VizBuilder;

  // Seamless chaining extensions
  node(id: string): NodeBuilder;
  edge(from: string, to: string, id?: string): EdgeBuilder;
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
  arrow(enabled?: boolean): EdgeBuilder;
  connect(anchor: 'center' | 'boundary'): EdgeBuilder;
  /** Sets the fill color of the edge path. */
  fill(color: string): EdgeBuilder;
  /** Sets the stroke color and optional width of the edge path. */
  stroke(color: string, width?: number): EdgeBuilder;
  /** Sets the opacity of the edge. */
  opacity(value: number): EdgeBuilder;
  class(name: string): EdgeBuilder;
  hitArea(px: number): EdgeBuilder;
  animate(type: string, config?: AnimationConfig): EdgeBuilder;
  animate(cb: (anim: AnimationBuilder) => unknown): EdgeBuilder;

  /** Sugar for `animate(a => a.to(...))`. */
  animateTo(props: AnimatableProps, opts: TweenOptions): EdgeBuilder;
  data(payload: unknown): EdgeBuilder;
  onClick(handler: (id: string, edge: VizEdge) => void): EdgeBuilder;
  done(): VizBuilder;

  // Seamless chaining extensions
  node(id: string): NodeBuilder;
  edge(from: string, to: string, id?: string): EdgeBuilder;
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
   * @param id The ID of the node
   * @returns The node builder
   */
  node(id: string): NodeBuilder {
    if (!this._nodes.has(id)) {
      // Set default position and shape
      this._nodes.set(id, {
        id,
        pos: { x: 0, y: 0 },
        shape: { kind: 'circle', r: 10 },
      });
      this._nodeOrder.push(id);
    }
    return new NodeBuilderImpl(this, this._nodes.get(id)!); // The ! asserts that the node exists, because we just added it
  }

  /**
   * Creates an edge between two nodes.
   * @param from The source node
   * @param to The target node
   * @param id The ID of the edge
   * @returns The edge builder
   */
  edge(from: string, to: string, id?: string): EdgeBuilder {
    const edgeId = id || `${from}->${to}`;
    if (!this._edges.has(edgeId)) {
      this._edges.set(edgeId, { id: edgeId, from, to });
      this._edgeOrder.push(edgeId);
    }
    return new EdgeBuilderImpl(this, this._edges.get(edgeId)!);
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

    return {
      viewBox: this._viewBox,
      grid: this._gridConfig ?? undefined,
      nodes,
      edges,
      overlays: this._overlays,
      animationSpecs:
        this._animationSpecs.length > 0 ? [...this._animationSpecs] : undefined,
    };
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
    opts?: { autoplay?: boolean; css?: string | string[] }
  ) {
    const scene = this.build();
    this._renderSceneToDOM(scene, container);
    this._mountedContainer = container;

    const svg = container.querySelector('svg') as SVGSVGElement | null;
    if (svg && opts?.css) this._injectCssIntoMountedSvg(svg, opts.css);

    if (opts?.autoplay) this.play(container, scene.animationSpecs ?? []);
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

      // Defs
      const defs = document.createElementNS(svgNS, 'defs');
      const marker = document.createElementNS(svgNS, 'marker');
      marker.setAttribute('id', 'viz-arrow');
      marker.setAttribute('markerWidth', '10');
      marker.setAttribute('markerHeight', '7');
      marker.setAttribute('refX', '9');
      marker.setAttribute('refY', '3.5');
      marker.setAttribute('orient', 'auto');
      const poly = document.createElementNS(svgNS, 'polygon');
      poly.setAttribute('points', '0 0, 10 3.5, 0 7');
      poly.setAttribute('fill', 'currentColor');
      marker.appendChild(poly);
      defs.appendChild(marker);
      svg.appendChild(defs);

      // Layers
      const edgeLayer = document.createElementNS(svgNS, 'g');
      edgeLayer.setAttribute('class', 'viz-layer-edges');
      edgeLayer.setAttribute('data-viz-layer', 'edges');
      svg.appendChild(edgeLayer);

      const nodeLayer = document.createElementNS(svgNS, 'g');
      nodeLayer.setAttribute('class', 'viz-layer-nodes');
      nodeLayer.setAttribute('data-viz-layer', 'nodes');
      svg.appendChild(nodeLayer);

      const overlayLayer = document.createElementNS(svgNS, 'g');
      overlayLayer.setAttribute('class', 'viz-layer-overlays');
      overlayLayer.setAttribute('data-viz-layer', 'overlays');
      svg.appendChild(overlayLayer);

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
      const endpoints = computeEdgeEndpoints(start, end, edge);
      const edgePath = computeEdgePath(
        endpoints.start,
        endpoints.end,
        edge.routing,
        edge.waypoints
      );

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
      if (edge.markerEnd === 'arrow') {
        line.setAttribute('marker-end', 'url(#viz-arrow)');
      } else {
        line.removeAttribute('marker-end');
      }

      // Per-edge style overrides (inline style wins over CSS class defaults)
      if (edge.style?.stroke !== undefined)
        line.style.stroke = edge.style.stroke;
      else line.style.removeProperty('stroke');
      if (edge.style?.strokeWidth !== undefined)
        line.style.strokeWidth = String(edge.style.strokeWidth);
      else line.style.removeProperty('stroke-width');
      if (edge.style?.fill !== undefined) line.style.fill = edge.style.fill;
      else line.style.removeProperty('fill');
      if (edge.style?.opacity !== undefined)
        line.style.opacity = String(edge.style.opacity);
      else line.style.removeProperty('opacity');

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

      // Label (Recreate vs Update)
      const oldLabel =
        group.querySelector('[data-viz-role="edge-label"]') ||
        group.querySelector('.viz-edge-label');
      if (oldLabel) oldLabel.remove();

      if (edge.label) {
        const text = document.createElementNS(svgNS, 'text');
        const mx = edgePath.mid.x + (edge.label.dx || 0);
        const my = edgePath.mid.y + (edge.label.dy || 0);
        text.setAttribute('x', String(mx));
        text.setAttribute('y', String(my));
        text.setAttribute(
          'class',
          `viz-edge-label ${edge.label.className || ''}`
        );
        text.setAttribute('data-viz-role', 'edge-label');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.textContent = edge.label.text;
        group.appendChild(text);
      }
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
        parentGroup.appendChild(group);
      } else if (group.parentElement !== parentGroup) {
        // Re-parent if the node moved to/from a container
        parentGroup.appendChild(group);
      }

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

      // Label
      let label =
        (group.querySelector(
          '[data-viz-role="node-label"]'
        ) as SVGTextElement | null) ||
        (group.querySelector('.viz-node-label') as SVGTextElement | null);
      if (!label && node.label) {
        label = document.createElementNS(svgNS, 'text');
        label.setAttribute('class', 'viz-node-label');
        label.setAttribute('data-viz-role', 'node-label');
        group.appendChild(label);
      }

      if (node.label) {
        let lx = x + (node.label.dx || 0);
        let ly = y + (node.label.dy || 0);

        // If container with headerHeight, center label in header area
        if (
          isContainer &&
          node.container!.headerHeight &&
          'h' in node.shape &&
          !node.label.dy
        ) {
          const sh = (node.shape as { h: number }).h;
          ly = y - sh / 2 + node.container!.headerHeight / 2;
          lx = x + (node.label.dx || 0);
        }

        label!.setAttribute('x', String(lx));
        label!.setAttribute('y', String(ly));
        label!.setAttribute('text-anchor', node.label.textAnchor || 'middle');
        label!.setAttribute(
          'dominant-baseline',
          node.label.dominantBaseline || 'middle'
        );
        label!.setAttribute(
          'class',
          `viz-node-label ${node.label.className || ''}`
        );
        label!.setAttribute('data-viz-role', 'node-label');
        setSvgAttributes(label!, {
          fill: node.label.fill,
          'font-size': node.label.fontSize,
          'font-weight': node.label.fontWeight,
        });
        label!.textContent = node.label.text;
      } else if (label) {
        label.remove();
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

    // Defs (Arrow Marker)
    svgContent += `
        <defs>
          <marker id="viz-arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
          </marker>
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
        edge.markerEnd === 'arrow' ? 'marker-end="url(#viz-arrow)"' : '';

      const endpoints = computeEdgeEndpoints(start, end, edge);
      const edgePath = computeEdgePath(
        endpoints.start,
        endpoints.end,
        edge.routing,
        edge.waypoints
      );

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
      svgContent += `<path d="${edgePath.d}" class="viz-edge" data-viz-role="edge-line" ${markerEnd} style="${edgeInlineStyle}"${lineRuntimeAttrs} />`;

      // Edge Label
      if (edge.label) {
        const mx = edgePath.mid.x + (edge.label.dx || 0);
        const my = edgePath.mid.y + (edge.label.dy || 0);
        const labelClass = `viz-edge-label ${edge.label.className || ''}`;
        svgContent += `<text x="${mx}" y="${my}" class="${labelClass}" data-viz-role="edge-label" text-anchor="middle" dominant-baseline="middle">${edge.label.text}</text>`;
      }
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
        const labelAttrs = svgAttributeString({
          fill: node.label.fill,
          'font-size': node.label.fontSize,
          'font-weight': node.label.fontWeight,
          'text-anchor': node.label.textAnchor || 'middle',
          'dominant-baseline': node.label.dominantBaseline || 'middle',
        });
        content += `<text x="${lx}" y="${ly}" class="${labelClass}" data-viz-role="node-label"${labelAttrs}>${node.label.text}</text>`;
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

  class(name: string): NodeBuilder {
    if (this.nodeDef.className) {
      this.nodeDef.className += ` ${name}`;
    } else {
      this.nodeDef.className = name;
    }
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

  parent(parentId: string): NodeBuilder {
    this.nodeDef.parentId = parentId;
    return this;
  }

  done(): VizBuilder {
    return this._builder;
  }

  // Chaining
  node(id: string): NodeBuilder {
    return this._builder.node(id);
  }
  edge(from: string, to: string, id?: string): EdgeBuilder {
    return this._builder.edge(from, to, id);
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
    this.edgeDef.label = { position: 'mid', text, dy: -10, ...opts };
    return this;
  }

  arrow(enabled: boolean = true): EdgeBuilder {
    this.edgeDef.markerEnd = enabled ? 'arrow' : 'none';
    return this;
  }

  connect(anchor: 'center' | 'boundary'): EdgeBuilder {
    this.edgeDef.anchor = anchor;
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

  done(): VizBuilder {
    return this.parent;
  }

  // Chaining
  node(id: string): NodeBuilder {
    return this.parent.node(id);
  }
  /**
   * Defines an edge between two nodes.
   * @param from id of the source node
   * @param to id of the target node
   * @param id (optional) id of the edge. If not provided, defaults to "from->to"
   */
  edge(from: string, to: string, id?: string): EdgeBuilder {
    return this.parent.edge(from, to, id || `${from}->${to}`); // Default ID to from->to
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
