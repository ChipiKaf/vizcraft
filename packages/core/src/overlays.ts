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
};

export type CircleOverlayParams = {
  x: number;
  y: number;
  r: number;
  opacity?: number;
};

export type TextOverlayParams = {
  x: number;
  y: number;
  text: string;
  opacity?: number;
  fontSize?: number;
  fontWeight?: string | number;
  textAnchor?: 'start' | 'middle' | 'end';
  dominantBaseline?: string;
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
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface CoreOverlayRenderContext<T = any> {
  spec: VizOverlaySpec<T>;
  nodesById: Map<string, VizNode>;
  edgesById: Map<string, VizEdge>;
  scene: VizScene;
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
    const { x, y, w, h, rx, ry, opacity } = spec.params;
    const cls = spec.className ?? 'viz-overlay-rect';
    const rxAttr = rx !== undefined ? ` rx="${rx}"` : '';
    const ryAttr = ry !== undefined ? ` ry="${ry}"` : '';
    const opAttr = opacity !== undefined ? ` opacity="${opacity}"` : '';
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(59, 130, 246, 0.12)" stroke="rgba(59, 130, 246, 0.9)" stroke-width="3"${rxAttr}${ryAttr}${opAttr} class="${cls}" />`;
  },
  update: ({ spec }, container) => {
    const svgNS = 'http://www.w3.org/2000/svg';
    const { x, y, w, h, rx, ry, opacity } = spec.params;
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
    rect.setAttribute('fill', 'rgba(59, 130, 246, 0.12)');
    rect.setAttribute('stroke', 'rgba(59, 130, 246, 0.9)');
    rect.setAttribute('stroke-width', '3');
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
    const { x, y, r, opacity } = spec.params;
    const cls = spec.className ?? 'viz-overlay-circle';
    const opAttr = opacity !== undefined ? ` opacity="${opacity}"` : '';
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="rgba(59, 130, 246, 0.12)" stroke="rgba(59, 130, 246, 0.9)" stroke-width="3"${opAttr} class="${cls}" />`;
  },
  update: ({ spec }, container) => {
    const svgNS = 'http://www.w3.org/2000/svg';
    const { x, y, r, opacity } = spec.params;
    const cls = spec.className ?? 'viz-overlay-circle';

    let circle = container.querySelector('circle');
    if (!circle) {
      circle = document.createElementNS(svgNS, 'circle');
      container.appendChild(circle);
    }

    circle.setAttribute('cx', String(x));
    circle.setAttribute('cy', String(y));
    circle.setAttribute('r', String(r));
    circle.setAttribute('fill', 'rgba(59, 130, 246, 0.12)');
    circle.setAttribute('stroke', 'rgba(59, 130, 246, 0.9)');
    circle.setAttribute('stroke-width', '3');
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
    return `<text x="${x}" y="${y}" fill="#111"${opAttr}${fsAttr}${fwAttr}${taAttr}${dbAttr} class="${cls}">${text}</text>`;
  },
  update: ({ spec }, container) => {
    const svgNS = 'http://www.w3.org/2000/svg';
    const {
      x,
      y,
      text,
      opacity,
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
    el.setAttribute('fill', '#111');
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

export const defaultCoreOverlayRegistry = new CoreOverlayRegistry()
  .register('signal', coreSignalOverlay)
  .register('grid-labels', coreGridLabelsOverlay)
  .register('data-points', coreDataPointOverlay)
  // Generic primitives
  .register('rect', coreRectOverlay)
  .register('circle', coreCircleOverlay)
  .register('text', coreTextOverlay);
