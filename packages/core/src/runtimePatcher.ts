import type { VizScene } from './types';
import { applyShapeGeometry, effectivePos } from './shapes';
import { computeEdgePath, computeEdgeEndpoints } from './edgePaths';
import { resolveEdgeLabelPosition, collectEdgeLabels } from './edgeLabels';

const svgNS = 'http://www.w3.org/2000/svg';

/** Sanitise a CSS color for use as a marker ID suffix. */
function arrowMarkerIdFor(stroke: string | undefined): string {
  return stroke
    ? `viz-arrow-${stroke.replace(/[^a-zA-Z0-9]/g, '_')}`
    : 'viz-arrow';
}

/**
 * Ensure a `<marker>` for the given color exists inside `<defs>`.
 * Creates one on the fly when the RuntimePatcher encounters a new stroke color.
 */
function ensureColoredMarker(svg: SVGSVGElement, color: string): string {
  const mid = arrowMarkerIdFor(color);
  if (!svg.querySelector(`#${CSS.escape(mid)}`)) {
    const defs = svg.querySelector('defs');
    if (defs) {
      const m = document.createElementNS(svgNS, 'marker');
      m.setAttribute('id', mid);
      m.setAttribute('markerWidth', '10');
      m.setAttribute('markerHeight', '7');
      m.setAttribute('refX', '9');
      m.setAttribute('refY', '3.5');
      m.setAttribute('orient', 'auto');
      const p = document.createElementNS(svgNS, 'polygon');
      p.setAttribute('points', '0 0, 10 3.5, 0 7');
      p.setAttribute('fill', color);
      m.appendChild(p);
      defs.appendChild(m);
    }
  }
  return mid;
}

export interface RuntimePatchCtx {
  svg: SVGSVGElement;

  nodeGroupsById: Map<string, SVGGElement>;
  nodeShapesById: Map<string, SVGElement>;
  nodeLabelsById: Map<string, SVGTextElement>;

  edgeGroupsById: Map<string, SVGGElement>;
  edgeLinesById: Map<string, SVGPathElement>;
  edgeHitsById: Map<string, SVGPathElement>;
  edgeLabelsById: Map<string, SVGTextElement[]>;
}

export function createRuntimePatchCtx(svg: SVGSVGElement): RuntimePatchCtx {
  const nodeGroupsById = new Map<string, SVGGElement>();
  const nodeShapesById = new Map<string, SVGElement>();
  const nodeLabelsById = new Map<string, SVGTextElement>();

  const edgeGroupsById = new Map<string, SVGGElement>();
  const edgeLinesById = new Map<string, SVGPathElement>();
  const edgeHitsById = new Map<string, SVGPathElement>();
  const edgeLabelsById = new Map<string, SVGTextElement[]>();

  const nodeLayer =
    svg.querySelector('[data-viz-layer="nodes"]') ||
    svg.querySelector('.viz-layer-nodes');
  if (nodeLayer) {
    const groups = Array.from(
      nodeLayer.querySelectorAll<SVGGElement>('g[data-id]')
    );
    for (const group of groups) {
      const id = group.getAttribute('data-id');
      if (!id) continue;
      nodeGroupsById.set(id, group);

      const shape =
        group.querySelector<SVGElement>('[data-viz-role="node-shape"]') ||
        group.querySelector<SVGElement>('.viz-node-shape');
      if (shape) nodeShapesById.set(id, shape);

      const label =
        group.querySelector<SVGTextElement>('[data-viz-role="node-label"]') ||
        group.querySelector<SVGTextElement>('.viz-node-label');
      if (label) nodeLabelsById.set(id, label);
    }
  }

  const edgeLayer =
    svg.querySelector('[data-viz-layer="edges"]') ||
    svg.querySelector('.viz-layer-edges');
  if (edgeLayer) {
    const groups = Array.from(
      edgeLayer.querySelectorAll<SVGGElement>('g[data-id]')
    );
    for (const group of groups) {
      const id = group.getAttribute('data-id');
      if (!id) continue;
      edgeGroupsById.set(id, group);

      const line =
        group.querySelector<SVGPathElement>('[data-viz-role="edge-line"]') ||
        group.querySelector<SVGPathElement>('.viz-edge');
      if (line) edgeLinesById.set(id, line);

      const hit =
        group.querySelector<SVGPathElement>('[data-viz-role="edge-hit"]') ||
        group.querySelector<SVGPathElement>('.viz-edge-hit');
      if (hit) edgeHitsById.set(id, hit);

      const labels = Array.from(
        group.querySelectorAll<SVGTextElement>(
          '[data-viz-role="edge-label"],.viz-edge-label'
        )
      );
      if (labels.length > 0) edgeLabelsById.set(id, labels);
    }
  }

  return {
    svg,
    nodeGroupsById,
    nodeShapesById,
    nodeLabelsById,
    edgeGroupsById,
    edgeLinesById,
    edgeHitsById,
    edgeLabelsById,
  };
}

export function patchRuntime(scene: VizScene, ctx: RuntimePatchCtx) {
  const nodesById = new Map(scene.nodes.map((n) => [n.id, n] as const));

  // Pre-compute parent position deltas for container propagation.
  // When a container node moves via runtime, children should follow.
  const parentDeltas = new Map<string, { dx: number; dy: number }>();
  for (const node of scene.nodes) {
    if (node.container) {
      const dx = (node.runtime?.x ?? node.pos.x) - node.pos.x;
      const dy = (node.runtime?.y ?? node.pos.y) - node.pos.y;
      if (dx !== 0 || dy !== 0) {
        parentDeltas.set(node.id, { dx, dy });
      }
    }
  }

  // Nodes: patch geometry + label position + runtime transforms/opacity.
  for (const node of scene.nodes) {
    const group = ctx.nodeGroupsById.get(node.id);
    const shape = ctx.nodeShapesById.get(node.id);
    if (!group || !shape) continue;

    let { x, y } = effectivePos(node);

    // Apply parent container offset so children follow the container
    if (node.parentId) {
      const delta = parentDeltas.get(node.parentId);
      if (delta) {
        x += delta.dx;
        y += delta.dy;
      }
    }

    // Geometry
    applyShapeGeometry(shape, node.shape, { x, y });

    // Container header line (update position if present)
    if (
      node.container?.headerHeight &&
      'w' in node.shape &&
      'h' in node.shape
    ) {
      const headerLine = group.querySelector<SVGLineElement>(
        '[data-viz-role="container-header"]'
      );
      if (headerLine) {
        const sw = (node.shape as { w: number }).w;
        const sh = (node.shape as { h: number }).h;
        const headerY = y - sh / 2 + node.container.headerHeight;
        headerLine.setAttribute('x1', String(x - sw / 2));
        headerLine.setAttribute('y1', String(headerY));
        headerLine.setAttribute('x2', String(x + sw / 2));
        headerLine.setAttribute('y2', String(headerY));
      }
    }

    // Label position
    const label = ctx.nodeLabelsById.get(node.id);
    if (label && node.label) {
      let lx = x + (node.label.dx || 0);
      let ly = y + (node.label.dy || 0);

      // Container header label centering
      if (node.container?.headerHeight && 'h' in node.shape && !node.label.dy) {
        const sh = (node.shape as { h: number }).h;
        ly = y - sh / 2 + node.container.headerHeight / 2;
        lx = x + (node.label.dx || 0);
      }

      label.setAttribute('x', String(lx));
      label.setAttribute('y', String(ly));
    }

    // Opacity conflict rule: runtime wins (inline), else revert to base.
    if (node.runtime?.opacity !== undefined) {
      group.style.opacity = String(node.runtime.opacity);
      shape.removeAttribute('opacity');
    } else {
      group.style.removeProperty('opacity');
      if (node.style?.opacity !== undefined) {
        shape.setAttribute('opacity', String(node.style.opacity));
      } else {
        shape.removeAttribute('opacity');
      }
    }

    // Transform conflict rule: runtime wins if it writes transform.
    const scale = node.runtime?.scale;
    const rotation = node.runtime?.rotation;
    if (scale !== undefined || rotation !== undefined) {
      const s = scale ?? 1;
      const r = rotation ?? 0;
      group.setAttribute(
        'transform',
        `translate(${x} ${y}) rotate(${r}) scale(${s}) translate(${-x} ${-y})`
      );
    } else {
      group.removeAttribute('transform');
    }
  }

  // Edges: patch endpoints + runtime props (opacity, strokeDashoffset) + label + hit.
  for (const edge of scene.edges) {
    const group = ctx.edgeGroupsById.get(edge.id);
    const line = ctx.edgeLinesById.get(edge.id);
    if (!group || !line) continue;

    const start = nodesById.get(edge.from);
    const end = nodesById.get(edge.to);
    if (!start || !end) continue;

    const endpoints = computeEdgeEndpoints(start, end, edge);
    const edgePath = computeEdgePath(
      endpoints.start,
      endpoints.end,
      edge.routing,
      edge.waypoints
    );

    // Path
    line.setAttribute('d', edgePath.d);

    // Per-edge style overrides (inline style wins over CSS class defaults)
    if (edge.style?.stroke !== undefined) {
      line.style.stroke = edge.style.stroke;
    }
    if (edge.style?.strokeWidth !== undefined)
      line.style.strokeWidth = String(edge.style.strokeWidth);
    if (edge.style?.fill !== undefined) line.style.fill = edge.style.fill;
    if (edge.style?.opacity !== undefined)
      line.style.opacity = String(edge.style.opacity);

    // Update marker-end to match edge stroke color
    if (edge.markerEnd === 'arrow') {
      const mid = edge.style?.stroke
        ? ensureColoredMarker(ctx.svg, edge.style.stroke)
        : 'viz-arrow';
      line.setAttribute('marker-end', `url(#${mid})`);
    }

    const hit = ctx.edgeHitsById.get(edge.id);
    if (hit) {
      hit.setAttribute('d', edgePath.d);
    }

    const labelEls = ctx.edgeLabelsById.get(edge.id);
    if (labelEls) {
      const allLabels = collectEdgeLabels(edge);
      labelEls.forEach((el, idx) => {
        const lbl = allLabels[idx];
        if (!lbl) return;
        const pos = resolveEdgeLabelPosition(lbl, edgePath);
        el.setAttribute('x', String(pos.x));
        el.setAttribute('y', String(pos.y));
      });
    }

    // Runtime overrides
    if (edge.runtime?.opacity !== undefined) {
      group.style.opacity = String(edge.runtime.opacity);
    } else {
      group.style.removeProperty('opacity');
    }

    if (edge.runtime?.strokeDashoffset !== undefined) {
      line.style.strokeDashoffset = String(edge.runtime.strokeDashoffset);
      line.setAttribute(
        'stroke-dashoffset',
        String(edge.runtime.strokeDashoffset)
      );
    } else {
      line.style.removeProperty('stroke-dashoffset');
      line.removeAttribute('stroke-dashoffset');
    }
  }
}
