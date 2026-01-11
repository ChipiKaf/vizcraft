
import type { VizNode, VizEdge, VizOverlaySpec, VizScene } from './types';

export interface CoreOverlayRenderContext<T = any> {
    spec: VizOverlaySpec<T>;
    nodesById: Map<string, VizNode>;
    edgesById: Map<string, VizEdge>;
    scene: VizScene;
}

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
export const coreSignalOverlay: CoreOverlayRenderer<{
    from: string;
    to: string;
    progress: number;
    magnitude?: number;
}> = {
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

        const className = spec.className ?? "viz-signal";

        return `
            <g transform="translate(${x}, ${y})">
                <g class="${className}">
                    <circle r="10" fill="transparent" stroke="none" />
                    <circle r="${r}" class="viz-signal-shape" />
                </g>
            </g>
        `;
    }
};

// Built-in Overlay: Grid Labels
export const coreGridLabelsOverlay: CoreOverlayRenderer<{
    colLabels?: Record<number, string>;
    rowLabels?: Record<number, string>;
    yOffset?: number;
    xOffset?: number;
}> = {
    render: ({ spec, scene }) => {
        const grid = scene.grid;
        if (!grid) return '';

        const { w, h } = scene.viewBox;
        const { colLabels, rowLabels, yOffset = 20, xOffset = 20 } = spec.params;

        // Safer string rendering for overlay to avoid weird spacing if grid missing
        const cellW = (w - (grid.padding.x * 2)) / grid.cols;
        const cellH = (h - (grid.padding.y * 2)) / grid.rows;

        let output = '';

        if (colLabels) {
            Object.entries(colLabels).forEach(([colStr, text]) => {
                const col = parseInt(colStr, 10);
                const x = grid.padding.x + (col * cellW) + (cellW / 2);
                const cls = spec.className || "viz-grid-label";
                output += `<text x="${x}" y="${yOffset}" class="${cls}" text-anchor="middle">${text}</text>`;
            });
        }

        if (rowLabels) {
            Object.entries(rowLabels).forEach(([rowStr, text]) => {
                const row = parseInt(rowStr, 10);
                const y = grid.padding.y + (row * cellH) + (cellH / 2);
                const cls = spec.className || "viz-grid-label";
                output += `<text x="${xOffset}" y="${y}" dy=".35em" class="${cls}" text-anchor="middle">${text}</text>`;
            });
        }

        return output;
    }
};

// ... (OverlayRegistry and other exports remain unchanged) ...

// Built-in Overlay: Data Points
export const coreDataPointOverlay: CoreOverlayRenderer<{
    points: { id: string; currentNodeId: string; [key: string]: any }[];
}> = {
    render: ({ spec, nodesById }) => {
        const { points } = spec.params;
        let output = '';

        points.forEach(point => {
            const node = nodesById.get(point.currentNodeId);
            if (!node) return;

            const idNum = parseInt(point.id.split('-')[1] || '0', 10);
            const offsetX = ((idNum % 5) - 2) * 10;
            const offsetY = ((idNum % 3) - 1) * 10;

            const x = node.pos.x + offsetX;
            const y = node.pos.y + offsetY;
            
            const cls = spec.className ?? "viz-data-point";
            // Important: Add data-id so we can find it later in update()
            output += `<circle data-id="${point.id}" cx="${x}" cy="${y}" r="6" class="${cls}" />`;
        });

        return output;
    },
    update: ({ spec, nodesById }, container) => {
        const { points } = spec.params;
        const svgNS = "http://www.w3.org/2000/svg";
        
        // 1. Map existing elements by data-id
        const existingMap = new Map<string, SVGElement>();
        Array.from(container.children).forEach(child => {
            if (child.tagName === 'circle') {
                const id = child.getAttribute('data-id');
                if (id) existingMap.set(id, child as SVGElement);
            }
        });

        const processedIds = new Set<string>();

        // 2. Create or Update Points
        points.forEach(point => {
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
                 circle = document.createElementNS(svgNS, "circle");
                 circle.setAttribute("data-id", point.id);
                 circle.setAttribute("r", "6");
                 container.appendChild(circle);
             }

             // Update attrs (this triggers CSS transition if class has it)
             circle.setAttribute("cx", String(x));
             circle.setAttribute("cy", String(y));
             
             const cls = spec.className ?? "viz-data-point";
             // Only set class if different to avoid potential re-flows (though usually fine)
             if (circle.getAttribute("class") !== cls) {
                 circle.setAttribute("class", cls);
             }
        });

        // 3. Remove stale points
        existingMap.forEach((el, id) => {
            if (!processedIds.has(id)) {
                el.remove();
            }
        });
    }
};

export const defaultCoreOverlayRegistry = new CoreOverlayRegistry()
    .register("signal", coreSignalOverlay)
    .register("grid-labels", coreGridLabelsOverlay)
    .register("data-points", coreDataPointOverlay);
