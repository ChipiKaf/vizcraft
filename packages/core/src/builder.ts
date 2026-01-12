import type {
  VizScene,
  VizNode,
  VizEdge,
  NodeLabel,
  EdgeLabel,
  AnimationConfig,
  VizOverlaySpec,
  VizGridConfig,
} from './types';
import { DEFAULT_VIZ_CSS } from './styles';
import { defaultCoreAnimationRegistry } from './animations';
import { defaultCoreOverlayRegistry } from './overlays';

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

// Helper to determine effective position (runtime vs static)
function effectivePos(node: VizNode) {
  return {
    x: node.runtime?.x ?? node.pos.x,
    y: node.runtime?.y ?? node.pos.y,
  };
}

function computeNodeAnchor(
  node: VizNode,
  target: { x: number; y: number },
  anchor: 'center' | 'boundary'
) {
  const pos = effectivePos(node);
  if (anchor === 'center') {
    return { x: pos.x, y: pos.y };
  }

  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  if (dx === 0 && dy === 0) {
    return { x: pos.x, y: pos.y };
  }

  if (node.shape.kind === 'circle') {
    const dist = Math.hypot(dx, dy) || 1;
    const scale = node.shape.r / dist;
    return {
      x: pos.x + dx * scale,
      y: pos.y + dy * scale,
    };
  }

  if (node.shape.kind === 'rect') {
    const hw = node.shape.w / 2;
    const hh = node.shape.h / 2;
    const scale = Math.min(
      hw / Math.abs(dx || 1e-6),
      hh / Math.abs(dy || 1e-6)
    );
    return {
      x: pos.x + dx * scale,
      y: pos.y + dy * scale,
    };
  }

  const hw = node.shape.w / 2;
  const hh = node.shape.h / 2;
  const denom = Math.abs(dx) / hw + Math.abs(dy) / hh;
  const scale = denom === 0 ? 0 : 1 / denom;
  return {
    x: pos.x + dx * scale,
    y: pos.y + dy * scale,
  };
}

function computeEdgeEndpoints(start: VizNode, end: VizNode, edge: VizEdge) {
  const anchor = edge.anchor ?? 'boundary';
  // Use effective positions of start/end nodes to calculate anchors
  const startPos = effectivePos(start);
  const endPos = effectivePos(end);

  const startAnchor = computeNodeAnchor(start, endPos, anchor);
  const endAnchor = computeNodeAnchor(end, startPos, anchor);
  return { start: startAnchor, end: endAnchor };
}

interface VizBuilder {
  view(w: number, h: number): VizBuilder;
  grid(
    cols: number,
    rows: number,
    padding?: { x: number; y: number }
  ): VizBuilder;
  overlay<T>(id: string, params: T, key?: string): VizBuilder;
  node(id: string): NodeBuilder;
  edge(from: string, to: string, id?: string): EdgeBuilder;
  build(): VizScene;

  // Internal helper for NodeBuilder to access grid config
  _getGridConfig(): VizGridConfig | null;
  _getViewBox(): { w: number; h: number };
  svg(): string;
  mount(container: HTMLElement): void;
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
  label(text: string, opts?: Partial<NodeLabel>): NodeBuilder;
  fill(color: string): NodeBuilder;
  stroke(color: string, width?: number): NodeBuilder;
  opacity(value: number): NodeBuilder;
  class(name: string): NodeBuilder;
  animate(type: string, config?: AnimationConfig): NodeBuilder;
  data(payload: unknown): NodeBuilder;
  onClick(handler: (id: string, node: VizNode) => void): NodeBuilder;
  done(): VizBuilder;

  // Seamless chaining extensions
  node(id: string): NodeBuilder;
  edge(from: string, to: string, id?: string): EdgeBuilder;
  overlay<T>(id: string, params: T, key?: string): VizBuilder;
  build(): VizScene;
  svg(): string;
}

interface EdgeBuilder {
  straight(): EdgeBuilder;
  label(text: string, opts?: Partial<EdgeLabel>): EdgeBuilder;
  arrow(enabled?: boolean): EdgeBuilder;
  connect(anchor: 'center' | 'boundary'): EdgeBuilder;
  class(name: string): EdgeBuilder;
  hitArea(px: number): EdgeBuilder;
  animate(type: string, config?: AnimationConfig): EdgeBuilder;
  data(payload: unknown): EdgeBuilder;
  onClick(handler: (id: string, edge: VizEdge) => void): EdgeBuilder;
  done(): VizBuilder;

  // Seamless chaining extensions
  node(id: string): NodeBuilder;
  edge(from: string, to: string, id?: string): EdgeBuilder;
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
  overlay<T>(id: string, params: T, key?: string): VizBuilder {
    this._overlays.push({ id, params, key });
    return this;
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
      grid: this._gridConfig || undefined,
      nodes,
      edges,
      overlays: this._overlays,
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
  mount(container: HTMLElement) {
    const scene = this.build();
    this._renderSceneToDOM(scene, container);
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
      svg.appendChild(edgeLayer);

      const nodeLayer = document.createElementNS(svgNS, 'g');
      nodeLayer.setAttribute('class', 'viz-layer-nodes');
      svg.appendChild(nodeLayer);

      const overlayLayer = document.createElementNS(svgNS, 'g');
      overlayLayer.setAttribute('class', 'viz-layer-overlays');
      svg.appendChild(overlayLayer);

      container.appendChild(svg);
    }

    // Update ViewBox
    svg.setAttribute('viewBox', `0 0 ${viewBox.w} ${viewBox.h}`);

    const edgeLayer = svg.querySelector('.viz-layer-edges')!;
    const nodeLayer = svg.querySelector('.viz-layer-nodes')!;
    const overlayLayer = svg.querySelector('.viz-layer-overlays')!;

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
        edgeLayer.appendChild(group);

        // Initial creation of children
        const line = document.createElementNS(svgNS, 'line');
        line.setAttribute('class', 'viz-edge');
        group.appendChild(line);

        // Optional parts created on demand later, but structure expected
      }

      // Compute Classes & Styles
      let classes = `viz-edge-group ${edge.className || ''}`;
      // Reset styles
      group.removeAttribute('style');

      if (edge.animations) {
        edge.animations.forEach((spec) => {
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
          }
        });
      }
      group.setAttribute('class', classes);

      // Use effective positions (handles runtime overrides internally via helper)
      const endpoints = computeEdgeEndpoints(start, end, edge);

      // Apply Edge Runtime Overrides
      if (edge.runtime?.opacity !== undefined) {
        group.style.opacity = String(edge.runtime.opacity);
      } else {
        group.style.removeProperty('opacity');
      }

      // Update Line
      const line = group.querySelector('.viz-edge') as SVGLineElement;

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
      line.setAttribute('x1', String(endpoints.start.x));
      line.setAttribute('y1', String(endpoints.start.y));
      line.setAttribute('x2', String(endpoints.end.x));
      line.setAttribute('y2', String(endpoints.end.y));
      line.setAttribute('stroke', 'currentColor');
      if (edge.markerEnd === 'arrow') {
        line.setAttribute('marker-end', 'url(#viz-arrow)');
      } else {
        line.removeAttribute('marker-end');
      }

      const oldHit = group.querySelector('.viz-edge-hit');
      if (oldHit) oldHit.remove();

      if (edge.hitArea || edge.onClick) {
        const hit = document.createElementNS(svgNS, 'line');
        hit.setAttribute('class', 'viz-edge-hit'); // Add class for selection
        hit.setAttribute('x1', String(endpoints.start.x));
        hit.setAttribute('y1', String(endpoints.start.y));
        hit.setAttribute('x2', String(endpoints.end.x));
        hit.setAttribute('y2', String(endpoints.end.y));
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
      const oldLabel = group.querySelector('.viz-edge-label');
      if (oldLabel) oldLabel.remove();

      if (edge.label) {
        const text = document.createElementNS(svgNS, 'text');
        const mx =
          (endpoints.start.x + endpoints.end.x) / 2 + (edge.label.dx || 0);
        const my =
          (endpoints.start.y + endpoints.end.y) / 2 + (edge.label.dy || 0);
        text.setAttribute('x', String(mx));
        text.setAttribute('y', String(my));
        text.setAttribute(
          'class',
          `viz-edge-label ${edge.label.className || ''}`
        );
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
    const existingNodeGroups = Array.from(nodeLayer.children).filter(
      (el) => el.tagName === 'g'
    ) as SVGGElement[];
    const existingNodesMap = new Map<string, SVGGElement>();
    existingNodeGroups.forEach((el) => {
      const id = el.getAttribute('data-id');
      if (id) existingNodesMap.set(id, el);
    });

    const processedNodeIds = new Set<string>();

    nodes.forEach((node) => {
      processedNodeIds.add(node.id);

      let group = existingNodesMap.get(node.id);

      if (!group) {
        group = document.createElementNS(svgNS, 'g');
        group.setAttribute('data-id', node.id);
        nodeLayer.appendChild(group);
      }

      // Calculate Anim Classes
      let classes = `viz-node-group ${node.className || ''}`;
      group.removeAttribute('style');

      if (node.animations) {
        node.animations.forEach((spec) => {
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

      // Ideally we reuse the shape element if the kind hasn't changed.
      // Assuming kind rarely changes for same ID.
      let shape = group.querySelector('.viz-node-shape') as SVGElement;

      // If shape doesn't exist or kind changed (simplified check: just recreate if kind mismatch logic needed,
      // but here we just check tag name for simplicity or assume kind is stable).
      const kindMap: Record<string, string> = {
        circle: 'circle',
        rect: 'rect',
        diamond: 'polygon',
      };
      const expectedTag = kindMap[node.shape.kind];

      if (!shape || shape.tagName !== expectedTag) {
        if (shape) shape.remove();
        if (node.shape.kind === 'circle') {
          shape = document.createElementNS(svgNS, 'circle');
        } else if (node.shape.kind === 'rect') {
          shape = document.createElementNS(svgNS, 'rect');
        } else if (node.shape.kind === 'diamond') {
          shape = document.createElementNS(svgNS, 'polygon');
        }
        shape!.setAttribute('class', 'viz-node-shape');
        group.prepend(shape!); // Shape always at bottom
      }

      // Update Shape Attributes
      if (node.shape.kind === 'circle') {
        shape!.setAttribute('cx', String(x));
        shape!.setAttribute('cy', String(y));
        shape!.setAttribute('r', String(node.shape.r));
      } else if (node.shape.kind === 'rect') {
        shape!.setAttribute('x', String(x - node.shape.w / 2));
        shape!.setAttribute('y', String(y - node.shape.h / 2));
        shape!.setAttribute('width', String(node.shape.w));
        shape!.setAttribute('height', String(node.shape.h));
        if (node.shape.rx) shape!.setAttribute('rx', String(node.shape.rx));
      } else if (node.shape.kind === 'diamond') {
        const hw = node.shape.w / 2;
        const hh = node.shape.h / 2;
        const pts = `${x},${y - hh} ${x + hw},${y} ${x},${y + hh} ${x - hw},${y}`;
        shape!.setAttribute('points', pts);
      }

      setSvgAttributes(shape!, {
        fill: node.style?.fill ?? 'none',
        stroke: node.style?.stroke ?? '#111',
        'stroke-width': node.style?.strokeWidth ?? 2,
        opacity: node.runtime?.opacity ?? node.style?.opacity,
      });

      // Label (Recreate for simplicity as usually just text/pos changes)
      let label = group.querySelector('.viz-node-label') as SVGTextElement;
      if (!label && node.label) {
        label = document.createElementNS(svgNS, 'text');
        label.setAttribute('class', 'viz-node-label');
        group.appendChild(label);
      }

      if (node.label) {
        const lx = x + (node.label.dx || 0);
        const ly = y + (node.label.dy || 0);
        label!.setAttribute('x', String(lx));
        label!.setAttribute('y', String(ly));
        label!.setAttribute('text-anchor', node.label.textAnchor || 'middle');
        label!.setAttribute(
          'dominant-baseline',
          node.label.dominantBaseline || 'middle'
        );

        // Update class carefully to preserve 'viz-node-label'
        label!.setAttribute(
          'class',
          `viz-node-label ${node.label.className || ''}`
        );
        setSvgAttributes(label!, {
          fill: node.label.fill,
          'font-size': node.label.fontSize,
          'font-weight': node.label.fontWeight,
        });
        label!.textContent = node.label.text;
      } else if (label) {
        label.remove();
      }
    });

    // Remove stale nodes
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
            group.setAttribute('class', `viz-overlay-${spec.id}`);
            overlayLayer.appendChild(group);
          }

          const ctx = {
            spec,
            nodesById,
            edgesById: new Map(edges.map((e) => [e.id, e])),
            scene,
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
    svgContent += '<g class="viz-layer-edges">';
    edges.forEach((edge) => {
      const start = nodesById.get(edge.from);
      const end = nodesById.get(edge.to);
      if (!start || !end) return;

      // Animations
      let animClasses = '';
      let animStyleStr = '';

      if (edge.animations) {
        edge.animations.forEach((spec) => {
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
          }
        });
      }

      const markerEnd =
        edge.markerEnd === 'arrow' ? 'marker-end="url(#viz-arrow)"' : '';

      const endpoints = computeEdgeEndpoints(start, end, edge);

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

      svgContent += `<g class="viz-edge-group ${edge.className || ''} ${animClasses}" style="${animStyleStr}${runtimeStyle}">`;
      svgContent += `<line x1="${endpoints.start.x}" y1="${endpoints.start.y}" x2="${endpoints.end.x}" y2="${endpoints.end.y}" class="viz-edge" ${markerEnd} stroke="currentColor" style="${lineRuntimeStyle}"${lineRuntimeAttrs} />`;

      // Edge Label
      if (edge.label) {
        const mx =
          (endpoints.start.x + endpoints.end.x) / 2 + (edge.label.dx || 0);
        const my =
          (endpoints.start.y + endpoints.end.y) / 2 + (edge.label.dy || 0);
        const labelClass = `viz-edge-label ${edge.label.className || ''}`;
        svgContent += `<text x="${mx}" y="${my}" class="${labelClass}" text-anchor="middle" dominant-baseline="middle">${edge.label.text}</text>`;
      }
      svgContent += '</g>';
    });
    svgContent += '</g>';

    // Render Nodes
    svgContent += '<g class="viz-layer-nodes">';
    nodes.forEach((node) => {
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
          }
        });
      }

      const className = `viz-node-group ${node.className || ''} ${animClasses}`;

      svgContent += `<g class="${className}" style="${animStyleStr}">`;

      const shapeStyleAttrs = svgAttributeString({
        fill: node.style?.fill ?? 'none',
        stroke: node.style?.stroke ?? '#111',
        'stroke-width': node.style?.strokeWidth ?? 2,
        opacity: node.style?.opacity,
      });

      // Shape
      if (shape.kind === 'circle') {
        svgContent += `<circle cx="${x}" cy="${y}" r="${shape.r}" class="viz-node-shape"${shapeStyleAttrs} />`;
      } else if (shape.kind === 'rect') {
        svgContent += `<rect x="${x - shape.w / 2}" y="${y - shape.h / 2}" width="${shape.w}" height="${shape.h}" rx="${shape.rx || 0}" class="viz-node-shape"${shapeStyleAttrs} />`;
      } else if (shape.kind === 'diamond') {
        const hw = shape.w / 2;
        const hh = shape.h / 2;
        const pts = `${x},${y - hh} ${x + hw},${y} ${x},${y + hh} ${x - hw},${y}`;
        svgContent += `<polygon points="${pts}" class="viz-node-shape"${shapeStyleAttrs} />`;
      }

      // Label
      if (node.label) {
        const lx = x + (node.label.dx || 0);
        const ly = y + (node.label.dy || 0);
        const labelClass = `viz-node-label ${node.label.className || ''}`;
        const labelAttrs = svgAttributeString({
          fill: node.label.fill,
          'font-size': node.label.fontSize,
          'font-weight': node.label.fontWeight,
          'text-anchor': node.label.textAnchor || 'middle',
          'dominant-baseline': node.label.dominantBaseline || 'middle',
        });
        svgContent += `<text x="${lx}" y="${ly}" class="${labelClass}"${labelAttrs}>${node.label.text}</text>`;
      }

      svgContent += '</g>';
    });
    svgContent += '</g>';

    // Render Overlays
    if (overlays && overlays.length > 0) {
      svgContent += '<g class="viz-layer-overlays">';
      overlays.forEach((spec) => {
        const renderer = defaultCoreOverlayRegistry.get(spec.id);
        if (renderer) {
          svgContent += renderer.render({ spec, nodesById, edgesById, scene });
        }
      });
      svgContent += '</g>';
    }

    svgContent += '</svg>';
    return svgContent;
  }
}

class NodeBuilderImpl implements NodeBuilder {
  private parent: VizBuilder;
  private nodeDef: Partial<VizNode>;

  constructor(parent: VizBuilder, nodeDef: Partial<VizNode>) {
    this.parent = parent;
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
    const grid = this.parent._getGridConfig();
    if (!grid) {
      console.warn(
        'VizBuilder: .cell() called but no grid configured. Use .grid() first.'
      );
      return this;
    }

    const view = this.parent._getViewBox();
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

  animate(type: string, config?: AnimationConfig): NodeBuilder {
    if (!this.nodeDef.animations) {
      this.nodeDef.animations = [];
    }
    this.nodeDef.animations.push({ id: type, params: config });
    return this;
  }

  data(payload: unknown): NodeBuilder {
    this.nodeDef.data = payload;
    return this;
  }

  onClick(handler: (id: string, node: VizNode) => void): NodeBuilder {
    this.nodeDef.onClick = handler;
    return this;
  }

  done(): VizBuilder {
    return this.parent;
  }

  // Chaining
  node(id: string): NodeBuilder {
    return this.parent.node(id);
  }
  edge(from: string, to: string, id?: string): EdgeBuilder {
    return this.parent.edge(from, to, id);
  }
  overlay<T>(id: string, params: T, key?: string): VizBuilder {
    return this.parent.overlay(id, params, key);
  }
  build(): VizScene {
    return this.parent.build();
  }
  svg(): string {
    return this.parent.svg();
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
    // No-op for now as it is default
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

  class(name: string): EdgeBuilder {
    if (this.edgeDef.className) {
      this.edgeDef.className += ` ${name}`;
    } else {
      this.edgeDef.className = name;
    }
    return this;
  }

  animate(type: string, config?: AnimationConfig): EdgeBuilder {
    if (!this.edgeDef.animations) {
      this.edgeDef.animations = [];
    }
    this.edgeDef.animations.push({ id: type, params: config });
    return this;
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
  edge(from: string, to: string, id?: string): EdgeBuilder {
    return this.parent.edge(from, to, id);
  }
  overlay<T>(id: string, params: T, key?: string): VizBuilder {
    return this.parent.overlay(id, params, key);
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
