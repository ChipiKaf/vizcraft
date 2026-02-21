import type { VizScene } from './types';
import { applyShapeGeometry, effectivePos } from './shapes';
import { computeEdgePath, computeEdgeEndpoints } from './edgePaths';

export interface RuntimePatchCtx {
  svg: SVGSVGElement;

  nodeGroupsById: Map<string, SVGGElement>;
  nodeShapesById: Map<string, SVGElement>;
  nodeLabelsById: Map<string, SVGTextElement>;

  edgeGroupsById: Map<string, SVGGElement>;
  edgeLinesById: Map<string, SVGPathElement>;
  edgeHitsById: Map<string, SVGPathElement>;
  edgeLabelsById: Map<string, SVGTextElement>;
}

export function createRuntimePatchCtx(svg: SVGSVGElement): RuntimePatchCtx {
  const nodeGroupsById = new Map<string, SVGGElement>();
  const nodeShapesById = new Map<string, SVGElement>();
  const nodeLabelsById = new Map<string, SVGTextElement>();

  const edgeGroupsById = new Map<string, SVGGElement>();
  const edgeLinesById = new Map<string, SVGPathElement>();
  const edgeHitsById = new Map<string, SVGPathElement>();
  const edgeLabelsById = new Map<string, SVGTextElement>();

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

      const label =
        group.querySelector<SVGTextElement>('[data-viz-role="edge-label"]') ||
        group.querySelector<SVGTextElement>('.viz-edge-label');
      if (label) edgeLabelsById.set(id, label);
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
      line.style.color = edge.style.stroke;
    }
    if (edge.style?.strokeWidth !== undefined)
      line.style.strokeWidth = String(edge.style.strokeWidth);
    if (edge.style?.fill !== undefined) line.style.fill = edge.style.fill;
    if (edge.style?.opacity !== undefined)
      line.style.opacity = String(edge.style.opacity);

    const hit = ctx.edgeHitsById.get(edge.id);
    if (hit) {
      hit.setAttribute('d', edgePath.d);
    }

    const label = ctx.edgeLabelsById.get(edge.id);
    if (label && edge.label) {
      const mx = edgePath.mid.x + (edge.label.dx || 0);
      const my = edgePath.mid.y + (edge.label.dy || 0);
      label.setAttribute('x', String(mx));
      label.setAttribute('y', String(my));
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
