import type { VizNode, VizEdge, VizOverlaySpec, VizScene } from './types';

export type SignalOverlayParams = {
  from: string;
  to: string;
  progress: number;
  magnitude?: number;
};

export type GridLabelsOverlayParams = {
  colLabels?: Record<number, string>;
  rowLabels?: Record<number, string>;
  yOffset?: number;
  xOffset?: number;
};

export interface DataPoint {
  id: string;
  currentNodeId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export type DataPointsOverlayParams = {
  points: DataPoint[];
};

export type RectOverlayParams = {
  x: number;
  y: number;
  w: number;
  h: number;
  rx?: number;
  ry?: number;
  opacity?: number;
  /** SVG fill (defaults to a visible blue). Can be overridden by CSS via className. */
  fill?: string;
  /** SVG stroke (defaults to a visible blue). Can be overridden by CSS via className. */
  stroke?: string;
  /** SVG stroke-width (defaults to 3). Can be overridden by CSS via className. */
  strokeWidth?: number;
};

export type CircleOverlayParams = {
  x: number;
  y: number;
  r: number;
  opacity?: number;
  /** SVG fill (defaults to a visible blue). Can be overridden by CSS via className. */
  fill?: string;
  /** SVG stroke (defaults to a visible blue). Can be overridden by CSS via className. */
  stroke?: string;
  /** SVG stroke-width (defaults to 3). Can be overridden by CSS via className. */
  strokeWidth?: number;
};

export type TextOverlayParams = {
  x: number;
  y: number;
  text: string;
  opacity?: number;
  /** SVG fill color (defaults to #111). Can be overridden by CSS via className. */
  fill?: string;
  fontSize?: number;
  fontWeight?: string | number;
  textAnchor?: 'start' | 'middle' | 'end';
  dominantBaseline?: string;
};

export type GroupOverlayParams = {
  /**
   * Translate (group-local origin).
   *
   * If `from`/`to` are provided, these act as an additional offset.
   */
  x?: number;
  y?: number;

  /**
   * Optional node ids used to drive the group's position via `progress`.
   *
   * When set, the group will translate along the line from `from` to `to`.
   */
  from?: string;
  to?: string;
  /** Interpolation 0..1 used when `from`/`to` are set. */
  progress?: number;

  /**
   * Optional "pulse" value 0..1.
   *
   * When provided, it scales the group slightly (in addition to `scale`).
   */
  magnitude?: number;
  /** Scale around group origin. */
  scale?: number;
  /** Rotate (degrees) around group origin. */
  rotation?: number;
  /** Group opacity (multiplies with child opacity). */
  opacity?: number;
  /** Child overlays rendered inside this group. Coordinates are group-local. */
  children: VizOverlaySpec[];
};

declare module './types' {
  interface OverlayKindRegistry {
    signal: SignalOverlayParams;
    'grid-labels': GridLabelsOverlayParams;
    'data-points': DataPointsOverlayParams;

    /** Generic overlay primitives (no custom registry needed). */
    rect: RectOverlayParams;
    circle: CircleOverlayParams;
    text: TextOverlayParams;

    /** Overlay container that can hold child overlays and be animated as a unit. */
    group: GroupOverlayParams;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface CoreOverlayRenderContext<T = any> {
  spec: VizOverlaySpec<T>;
  nodesById: Map<string, VizNode>;
  edgesById: Map<string, VizEdge>;
  scene: VizScene;
  /** Registry reference (useful for composite overlays like `group`). */
  registry?: CoreOverlayRegistry;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface CoreOverlayRenderer<T = any> {
  render: (ctx: CoreOverlayRenderContext<T>) => string;
  update?: (ctx: CoreOverlayRenderContext<T>, container: SVGGElement) => void;
}

export class CoreOverlayRegistry {
  private overlays = new Map<string, CoreOverlayRenderer>();

  register(id: string, renderer: CoreOverlayRenderer) {
    this.overlays.set(id, renderer);
    return this;
  }

  get(id: string) {
    return this.overlays.get(id);
  }
}

// Built-in Overlay: Signal
export const coreSignalOverlay: CoreOverlayRenderer<SignalOverlayParams> = {
  render: ({ spec, nodesById }) => {
    const { from, to, progress } = spec.params;
    const start = nodesById.get(from);
    const end = nodesById.get(to);

    if (!start || !end) return '';

    const x = start.pos.x + (end.pos.x - start.pos.x) * progress;
    const y = start.pos.y + (end.pos.y - start.pos.y) * progress;

    let v = Math.abs(spec.params.magnitude ?? 1);
    if (v > 1) v = 1;
    const r = 2 + v * 4;

    const className = spec.className ?? 'viz-signal';

    return `
            <g transform="translate(${x}, ${y})">
                <g class="${className}">
                    <circle r="10" fill="transparent" stroke="none" />
                    <circle r="${r}" class="viz-signal-shape" />
                </g>
            </g>
        `;
  },
};

// Built-in Overlay: Grid Labels
export const coreGridLabelsOverlay: CoreOverlayRenderer<GridLabelsOverlayParams> =
  {
    render: ({ spec, scene }) => {
      const grid = scene.grid;
      if (!grid) return '';

      const { w, h } = scene.viewBox;
      const { colLabels, rowLabels, yOffset = 20, xOffset = 20 } = spec.params;

      // Safer string rendering for overlay to avoid weird spacing if grid missing
      const cellW = (w - grid.padding.x * 2) / grid.cols;
      const cellH = (h - grid.padding.y * 2) / grid.rows;

      let output = '';

      if (colLabels) {
        Object.entries(colLabels).forEach(([colStr, text]) => {
          const col = parseInt(colStr, 10);
          const x = grid.padding.x + col * cellW + cellW / 2;
          const cls = spec.className || 'viz-grid-label';
          output += `<text x="${x}" y="${yOffset}" class="${cls}" text-anchor="middle">${text}</text>`;
        });
      }

      if (rowLabels) {
        Object.entries(rowLabels).forEach(([rowStr, text]) => {
          const row = parseInt(rowStr, 10);
          const y = grid.padding.y + row * cellH + cellH / 2;
          const cls = spec.className || 'viz-grid-label';
          output += `<text x="${xOffset}" y="${y}" dy=".35em" class="${cls}" text-anchor="middle">${text}</text>`;
        });
      }

      return output;
    },
  };

// ... (OverlayRegistry and other exports remain unchanged) ...

// Built-in Overlay: Data Points
export const coreDataPointOverlay: CoreOverlayRenderer<DataPointsOverlayParams> =
  {
    render: ({ spec, nodesById }) => {
      const { points } = spec.params;
      let output = '';

      points.forEach((point) => {
        const node = nodesById.get(point.currentNodeId);
        if (!node) return;

        const idNum = parseInt(point.id.split('-')[1] || '0', 10);
        const offsetX = ((idNum % 5) - 2) * 10;
        const offsetY = ((idNum % 3) - 1) * 10;

        const x = node.pos.x + offsetX;
        const y = node.pos.y + offsetY;

        const cls = spec.className ?? 'viz-data-point';
        // Important: Add data-id so we can find it later in update()
        output += `<circle data-id="${point.id}" cx="${x}" cy="${y}" r="6" class="${cls}" />`;
      });

      return output;
    },
    update: ({ spec, nodesById }, container) => {
      const { points } = spec.params;
      const svgNS = 'http://www.w3.org/2000/svg';

      // 1. Map existing elements by data-id
      const existingMap = new Map<string, SVGElement>();
      Array.from(container.children).forEach((child) => {
        if (child.tagName === 'circle') {
          const id = child.getAttribute('data-id');
          if (id) existingMap.set(id, child as SVGElement);
        }
      });

      const processedIds = new Set<string>();

      // 2. Create or Update Points
      points.forEach((point) => {
        const node = nodesById.get(point.currentNodeId);
        if (!node) return;

        processedIds.add(point.id);

        const idNum = parseInt(point.id.split('-')[1] || '0', 10);
        const offsetX = ((idNum % 5) - 2) * 10;
        const offsetY = ((idNum % 3) - 1) * 10;

        const x = node.pos.x + offsetX;
        const y = node.pos.y + offsetY;

        let circle = existingMap.get(point.id);

        if (!circle) {
          // Create new
          circle = document.createElementNS(svgNS, 'circle');
          circle.setAttribute('data-id', point.id);
          circle.setAttribute('r', '6');
          container.appendChild(circle);
        }

        // Update attrs (this triggers CSS transition if class has it)
        circle.setAttribute('cx', String(x));
        circle.setAttribute('cy', String(y));

        const cls = spec.className ?? 'viz-data-point';
        // Only set class if different to avoid potential re-flows (though usually fine)
        if (circle.getAttribute('class') !== cls) {
          circle.setAttribute('class', cls);
        }
      });

      // 3. Remove stale points
      existingMap.forEach((el, id) => {
        if (!processedIds.has(id)) {
          el.remove();
        }
      });
    },
  };

// Generic Overlay: Rect
export const coreRectOverlay: CoreOverlayRenderer<RectOverlayParams> = {
  render: ({ spec }) => {
    const { x, y, w, h, rx, ry, opacity, fill, stroke, strokeWidth } =
      spec.params;
    const cls = spec.className ?? 'viz-overlay-rect';
    const rxAttr = rx !== undefined ? ` rx="${rx}"` : '';
    const ryAttr = ry !== undefined ? ` ry="${ry}"` : '';
    const opAttr = opacity !== undefined ? ` opacity="${opacity}"` : '';
    const usingDefaultFill = fill === undefined;
    const usingDefaultStroke = stroke === undefined;
    const resolvedFill = fill ?? '#3b82f6';
    const resolvedStroke = stroke ?? '#3b82f6';
    const resolvedStrokeWidth = strokeWidth ?? 3;
    const fillOpacityAttr = usingDefaultFill ? ' fill-opacity="0.12"' : '';
    const strokeOpacityAttr = usingDefaultStroke ? ' stroke-opacity="0.9"' : '';
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${resolvedFill}"${fillOpacityAttr} stroke="${resolvedStroke}"${strokeOpacityAttr} stroke-width="${resolvedStrokeWidth}"${rxAttr}${ryAttr}${opAttr} class="${cls}" />`;
  },
  update: ({ spec }, container) => {
    const svgNS = 'http://www.w3.org/2000/svg';
    const { x, y, w, h, rx, ry, opacity, fill, stroke, strokeWidth } =
      spec.params;
    const cls = spec.className ?? 'viz-overlay-rect';

    let rect = container.querySelector('rect');
    if (!rect) {
      rect = document.createElementNS(svgNS, 'rect');
      container.appendChild(rect);
    }

    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(w));
    rect.setAttribute('height', String(h));
    if (fill === undefined) {
      rect.setAttribute('fill', '#3b82f6');
      rect.setAttribute('fill-opacity', '0.12');
    } else {
      rect.setAttribute('fill', fill);
      rect.removeAttribute('fill-opacity');
    }

    if (stroke === undefined) {
      rect.setAttribute('stroke', '#3b82f6');
      rect.setAttribute('stroke-opacity', '0.9');
    } else {
      rect.setAttribute('stroke', stroke);
      rect.removeAttribute('stroke-opacity');
    }
    rect.setAttribute('stroke-width', String(strokeWidth ?? 3));
    if (rx !== undefined) rect.setAttribute('rx', String(rx));
    else rect.removeAttribute('rx');
    if (ry !== undefined) rect.setAttribute('ry', String(ry));
    else rect.removeAttribute('ry');
    if (opacity !== undefined) rect.setAttribute('opacity', String(opacity));
    else rect.removeAttribute('opacity');
    rect.setAttribute('class', cls);
  },
};

// Generic Overlay: Circle
export const coreCircleOverlay: CoreOverlayRenderer<CircleOverlayParams> = {
  render: ({ spec }) => {
    const { x, y, r, opacity, fill, stroke, strokeWidth } = spec.params;
    const cls = spec.className ?? 'viz-overlay-circle';
    const opAttr = opacity !== undefined ? ` opacity="${opacity}"` : '';
    const usingDefaultFill = fill === undefined;
    const usingDefaultStroke = stroke === undefined;
    const resolvedFill = fill ?? '#3b82f6';
    const resolvedStroke = stroke ?? '#3b82f6';
    const resolvedStrokeWidth = strokeWidth ?? 3;
    const fillOpacityAttr = usingDefaultFill ? ' fill-opacity="0.12"' : '';
    const strokeOpacityAttr = usingDefaultStroke ? ' stroke-opacity="0.9"' : '';
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${resolvedFill}"${fillOpacityAttr} stroke="${resolvedStroke}"${strokeOpacityAttr} stroke-width="${resolvedStrokeWidth}"${opAttr} class="${cls}" />`;
  },
  update: ({ spec }, container) => {
    const svgNS = 'http://www.w3.org/2000/svg';
    const { x, y, r, opacity, fill, stroke, strokeWidth } = spec.params;
    const cls = spec.className ?? 'viz-overlay-circle';

    let circle = container.querySelector('circle');
    if (!circle) {
      circle = document.createElementNS(svgNS, 'circle');
      container.appendChild(circle);
    }

    circle.setAttribute('cx', String(x));
    circle.setAttribute('cy', String(y));
    circle.setAttribute('r', String(r));
    if (fill === undefined) {
      circle.setAttribute('fill', '#3b82f6');
      circle.setAttribute('fill-opacity', '0.12');
    } else {
      circle.setAttribute('fill', fill);
      circle.removeAttribute('fill-opacity');
    }

    if (stroke === undefined) {
      circle.setAttribute('stroke', '#3b82f6');
      circle.setAttribute('stroke-opacity', '0.9');
    } else {
      circle.setAttribute('stroke', stroke);
      circle.removeAttribute('stroke-opacity');
    }
    circle.setAttribute('stroke-width', String(strokeWidth ?? 3));
    if (opacity !== undefined) circle.setAttribute('opacity', String(opacity));
    else circle.removeAttribute('opacity');
    circle.setAttribute('class', cls);
  },
};

// Generic Overlay: Text
export const coreTextOverlay: CoreOverlayRenderer<TextOverlayParams> = {
  render: ({ spec }) => {
    const {
      x,
      y,
      text,
      opacity,
      fill,
      fontSize,
      fontWeight,
      textAnchor,
      dominantBaseline,
    } = spec.params;
    const cls = spec.className ?? 'viz-overlay-text';
    const opAttr = opacity !== undefined ? ` opacity="${opacity}"` : '';
    const fsAttr = fontSize !== undefined ? ` font-size="${fontSize}"` : '';
    const fwAttr =
      fontWeight !== undefined ? ` font-weight="${fontWeight}"` : '';
    const taAttr =
      textAnchor !== undefined ? ` text-anchor="${textAnchor}"` : '';
    const dbAttr =
      dominantBaseline !== undefined
        ? ` dominant-baseline="${dominantBaseline}"`
        : '';

    // Basic text rendering; users should avoid untrusted HTML here.
    const resolvedFill = fill ?? '#111';
    return `<text x="${x}" y="${y}" fill="${resolvedFill}"${opAttr}${fsAttr}${fwAttr}${taAttr}${dbAttr} class="${cls}">${text}</text>`;
  },
  update: ({ spec }, container) => {
    const svgNS = 'http://www.w3.org/2000/svg';
    const {
      x,
      y,
      text,
      opacity,
      fill,
      fontSize,
      fontWeight,
      textAnchor,
      dominantBaseline,
    } = spec.params;
    const cls = spec.className ?? 'viz-overlay-text';

    let el = container.querySelector('text');
    if (!el) {
      el = document.createElementNS(svgNS, 'text');
      container.appendChild(el);
    }

    el.setAttribute('x', String(x));
    el.setAttribute('y', String(y));
    el.setAttribute('fill', fill ?? '#111');
    if (opacity !== undefined) el.setAttribute('opacity', String(opacity));
    else el.removeAttribute('opacity');
    if (fontSize !== undefined) el.setAttribute('font-size', String(fontSize));
    else el.removeAttribute('font-size');
    if (fontWeight !== undefined)
      el.setAttribute('font-weight', String(fontWeight));
    else el.removeAttribute('font-weight');
    if (textAnchor !== undefined) el.setAttribute('text-anchor', textAnchor);
    else el.removeAttribute('text-anchor');
    if (dominantBaseline !== undefined)
      el.setAttribute('dominant-baseline', dominantBaseline);
    else el.removeAttribute('dominant-baseline');

    el.setAttribute('class', cls);
    el.textContent = text;
  },
};

function groupTransform(params: {
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
}): string {
  const tx = params.x ?? 0;
  const ty = params.y ?? 0;
  const s = params.scale ?? 1;
  const r = params.rotation ?? 0;
  // translate first so scale/rotation occur around the group origin.
  const parts: string[] = [`translate(${tx}, ${ty})`];
  if (r) parts.push(`rotate(${r})`);
  if (s !== 1) parts.push(`scale(${s})`);
  return parts.join(' ');
}

function clamp01(v: number) {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function effectiveNodePos(node: VizNode) {
  return {
    x: node.runtime?.x ?? node.pos.x,
    y: node.runtime?.y ?? node.pos.y,
  };
}

function resolveGroupTransformInputs(
  params: GroupOverlayParams,
  nodesById: Map<string, VizNode>
): { x: number; y: number; scale: number; rotation: number } {
  const baseX = params.x ?? 0;
  const baseY = params.y ?? 0;

  let x = baseX;
  let y = baseY;

  if (params.from && params.to) {
    const start = nodesById.get(params.from);
    const end = nodesById.get(params.to);
    if (start && end) {
      const p = clamp01(params.progress ?? 0);
      const a = effectiveNodePos(start);
      const b = effectiveNodePos(end);
      x = a.x + (b.x - a.x) * p + baseX;
      y = a.y + (b.y - a.y) * p + baseY;
    }
  }

  const userScale = params.scale ?? 1;
  const m = params.magnitude;
  const magScale = m === undefined ? 1 : 0.85 + 0.3 * clamp01(Math.abs(m));
  const scale = userScale * magScale;

  return {
    x,
    y,
    scale,
    rotation: params.rotation ?? 0,
  };
}

// Composite Overlay: Group
export const coreGroupOverlay: CoreOverlayRenderer<GroupOverlayParams> = {
  render: ({ spec, nodesById, edgesById, scene, registry }) => {
    const { children, opacity } = spec.params;
    const inputs = resolveGroupTransformInputs(spec.params, nodesById);
    const tr = groupTransform(inputs);
    const opAttr = opacity !== undefined ? ` opacity="${opacity}"` : '';

    const reg = registry;
    if (!reg) {
      // Best-effort render even if registry is missing.
      return `<g transform="${tr}"${opAttr}></g>`;
    }

    let output = `<g transform="${tr}"${opAttr}>`;
    children.forEach((childSpec, idx) => {
      const renderer = reg.get(childSpec.id);
      if (!renderer) return;

      const childCtx = {
        spec: childSpec,
        nodesById,
        edgesById,
        scene,
        registry: reg,
      };

      // Wrap children in their own <g> so update() has stable containers.
      const key = childSpec.key
        ? `key:${childSpec.key}`
        : `idx:${idx}:${childSpec.id}`;
      output += `<g data-viz-role="overlay-child" data-overlay-child-id="${key}">`;
      output += renderer.render(childCtx);
      output += '</g>';
    });
    output += '</g>';
    return output;
  },
  update: ({ spec, nodesById, edgesById, scene, registry }, container) => {
    const reg = registry;
    if (!reg) return;

    const { children, opacity } = spec.params;

    const inputs = resolveGroupTransformInputs(spec.params, nodesById);
    container.setAttribute('transform', groupTransform(inputs));
    if (opacity !== undefined) {
      container.setAttribute('opacity', String(opacity));
    } else {
      container.removeAttribute('opacity');
    }

    const svgNS = 'http://www.w3.org/2000/svg';

    const existing = new Map<string, SVGGElement>();
    Array.from(container.children).forEach((child) => {
      if (child instanceof SVGGElement) {
        const id = child.getAttribute('data-overlay-child-id');
        if (id) existing.set(id, child);
      }
    });

    const keep = new Set<string>();

    children.forEach((childSpec, idx) => {
      const renderer = reg.get(childSpec.id);
      if (!renderer) return;

      const key = childSpec.key
        ? `key:${childSpec.key}`
        : `idx:${idx}:${childSpec.id}`;
      keep.add(key);

      let childGroup = existing.get(key);
      if (!childGroup) {
        childGroup = document.createElementNS(svgNS, 'g') as SVGGElement;
        childGroup.setAttribute('data-viz-role', 'overlay-child');
        childGroup.setAttribute('data-overlay-child-id', key);
        container.appendChild(childGroup);
      }

      const childCtx = {
        spec: childSpec,
        nodesById,
        edgesById,
        scene,
        registry: reg,
      };

      if (renderer.update) {
        renderer.update(childCtx, childGroup);
      } else {
        childGroup.innerHTML = renderer.render(childCtx);
      }
    });

    existing.forEach((el, id) => {
      if (!keep.has(id)) el.remove();
    });
  },
};

export const defaultCoreOverlayRegistry = new CoreOverlayRegistry()
  .register('signal', coreSignalOverlay)
  .register('grid-labels', coreGridLabelsOverlay)
  .register('data-points', coreDataPointOverlay)
  // Generic primitives
  .register('rect', coreRectOverlay)
  .register('circle', coreCircleOverlay)
  .register('text', coreTextOverlay)
  // Composite overlays
  .register('group', coreGroupOverlay);
