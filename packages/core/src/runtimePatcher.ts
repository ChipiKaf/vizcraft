import type { VizEdge, VizNode, VizScene } from './types';
import { applyShapeGeometry, computeNodeAnchor, effectivePos } from './shapes';

export interface RuntimePatchCtx {
  svg: SVGSVGElement;

  nodeGroupsById: Map<string, SVGGElement>;
  nodeShapesById: Map<string, SVGElement>;
  nodeLabelsById: Map<string, SVGTextElement>;

  edgeGroupsById: Map<string, SVGGElement>;
  edgeLinesById: Map<string, SVGLineElement>;
  edgeHitsById: Map<string, SVGLineElement>;
  edgeLabelsById: Map<string, SVGTextElement>;
}

function computeEdgeEndpoints(start: VizNode, end: VizNode, edge: VizEdge) {
  const anchor = edge.anchor ?? 'boundary';
  const startPos = effectivePos(start);
  const endPos = effectivePos(end);

  const startAnchor = computeNodeAnchor(start, endPos, anchor);
  const endAnchor = computeNodeAnchor(end, startPos, anchor);
  return { start: startAnchor, end: endAnchor };
}

export function createRuntimePatchCtx(svg: SVGSVGElement): RuntimePatchCtx {
  const nodeGroupsById = new Map<string, SVGGElement>();
  const nodeShapesById = new Map<string, SVGElement>();
  const nodeLabelsById = new Map<string, SVGTextElement>();

  const edgeGroupsById = new Map<string, SVGGElement>();
  const edgeLinesById = new Map<string, SVGLineElement>();
  const edgeHitsById = new Map<string, SVGLineElement>();
  const edgeLabelsById = new Map<string, SVGTextElement>();

  const nodeLayer = svg.querySelector('.viz-layer-nodes');
  if (nodeLayer) {
    const groups = Array.from(
      nodeLayer.querySelectorAll<SVGGElement>('g[data-id]')
    );
    for (const group of groups) {
      const id = group.getAttribute('data-id');
      if (!id) continue;
      nodeGroupsById.set(id, group);

      const shape = group.querySelector<SVGElement>('.viz-node-shape');
      if (shape) nodeShapesById.set(id, shape);

      const label = group.querySelector<SVGTextElement>('.viz-node-label');
      if (label) nodeLabelsById.set(id, label);
    }
  }

  const edgeLayer = svg.querySelector('.viz-layer-edges');
  if (edgeLayer) {
    const groups = Array.from(
      edgeLayer.querySelectorAll<SVGGElement>('g[data-id]')
    );
    for (const group of groups) {
      const id = group.getAttribute('data-id');
      if (!id) continue;
      edgeGroupsById.set(id, group);

      const line = group.querySelector<SVGLineElement>('.viz-edge');
      if (line) edgeLinesById.set(id, line);

      const hit = group.querySelector<SVGLineElement>('.viz-edge-hit');
      if (hit) edgeHitsById.set(id, hit);

      const label = group.querySelector<SVGTextElement>('.viz-edge-label');
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

  // Nodes: patch geometry + label position + runtime transforms/opacity.
  for (const node of scene.nodes) {
    const group = ctx.nodeGroupsById.get(node.id);
    const shape = ctx.nodeShapesById.get(node.id);
    if (!group || !shape) continue;

    const { x, y } = effectivePos(node);

    // Geometry
    applyShapeGeometry(shape, node.shape, { x, y });

    // Label position
    const label = ctx.nodeLabelsById.get(node.id);
    if (label && node.label) {
      const lx = x + (node.label.dx || 0);
      const ly = y + (node.label.dy || 0);
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

    // Endpoints
    line.setAttribute('x1', String(endpoints.start.x));
    line.setAttribute('y1', String(endpoints.start.y));
    line.setAttribute('x2', String(endpoints.end.x));
    line.setAttribute('y2', String(endpoints.end.y));

    const hit = ctx.edgeHitsById.get(edge.id);
    if (hit) {
      hit.setAttribute('x1', String(endpoints.start.x));
      hit.setAttribute('y1', String(endpoints.start.y));
      hit.setAttribute('x2', String(endpoints.end.x));
      hit.setAttribute('y2', String(endpoints.end.y));
    }

    const label = ctx.edgeLabelsById.get(edge.id);
    if (label && edge.label) {
      const mx =
        (endpoints.start.x + endpoints.end.x) / 2 + (edge.label.dx || 0);
      const my =
        (endpoints.start.y + endpoints.end.y) / 2 + (edge.label.dy || 0);
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
