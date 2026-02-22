import type { VizScene, EdgeMarkerType } from './types';
import { applyShapeGeometry, effectivePos, effectiveShape } from './shapes';
import { computeEdgePath, computeEdgeEndpoints } from './edgePaths';
import { resolveEdgeLabelPosition, collectEdgeLabels } from './edgeLabels';
import { resolveDasharray } from './edgeStyles';

const svgNS = 'http://www.w3.org/2000/svg';

/** Sanitise a CSS color for use as a marker ID suffix. */
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
 * Create the SVG content element(s) for a marker type.
 */
function createMarkerContent(
  markerType: EdgeMarkerType,
  color: string
): SVGElement | null {
  switch (markerType) {
    case 'arrow': {
      const p = document.createElementNS(svgNS, 'polygon');
      p.setAttribute('points', '0,2 10,5 0,8');
      p.setAttribute('fill', color);
      return p;
    }
    case 'arrowOpen': {
      const p = document.createElementNS(svgNS, 'polyline');
      p.setAttribute('points', '0,2 10,5 0,8');
      p.setAttribute('fill', 'white');
      p.setAttribute('stroke', color);
      p.setAttribute('stroke-width', '1.5');
      p.setAttribute('stroke-linejoin', 'miter');
      return p;
    }
    case 'diamond': {
      const p = document.createElementNS(svgNS, 'polygon');
      p.setAttribute('points', '0,5 5,2 10,5 5,8');
      p.setAttribute('fill', color);
      return p;
    }
    case 'diamondOpen': {
      const p = document.createElementNS(svgNS, 'polygon');
      p.setAttribute('points', '0,5 5,2 10,5 5,8');
      p.setAttribute('fill', 'white');
      p.setAttribute('stroke', color);
      p.setAttribute('stroke-width', '1.5');
      return p;
    }
    case 'circle': {
      const c = document.createElementNS(svgNS, 'circle');
      c.setAttribute('cx', '5');
      c.setAttribute('cy', '5');
      c.setAttribute('r', '3');
      c.setAttribute('fill', color);
      return c;
    }
    case 'circleOpen': {
      const c = document.createElementNS(svgNS, 'circle');
      c.setAttribute('cx', '5');
      c.setAttribute('cy', '5');
      c.setAttribute('r', '3');
      c.setAttribute('fill', 'white');
      c.setAttribute('stroke', color);
      c.setAttribute('stroke-width', '1.5');
      return c;
    }
    case 'square': {
      const r = document.createElementNS(svgNS, 'rect');
      r.setAttribute('x', '2');
      r.setAttribute('y', '2');
      r.setAttribute('width', '6');
      r.setAttribute('height', '6');
      r.setAttribute('fill', color);
      return r;
    }
    case 'bar': {
      const l = document.createElementNS(svgNS, 'line');
      l.setAttribute('x1', '5');
      l.setAttribute('y1', '1');
      l.setAttribute('x2', '5');
      l.setAttribute('y2', '9');
      l.setAttribute('stroke', color);
      l.setAttribute('stroke-width', '2');
      l.setAttribute('stroke-linecap', 'round');
      return l;
    }
    case 'halfArrow': {
      const p = document.createElementNS(svgNS, 'polygon');
      p.setAttribute('points', '0,2 10,5 0,5');
      p.setAttribute('fill', color);
      return p;
    }
    default:
      return null;
  }
}

/**
 * Ensure a `<marker>` for the given color and type exists inside `<defs>`.
 * Creates one on the fly when the RuntimePatcher encounters a new stroke color or marker type.
 */
function ensureColoredMarker(
  svg: SVGSVGElement,
  color: string,
  markerType: EdgeMarkerType = 'arrow',
  position: 'start' | 'end' = 'end'
): string {
  const mid = markerIdFor(markerType, color, position);
  if (!mid) return '';
  if (!svg.querySelector(`#${CSS.escape(mid)}`)) {
    const defs = svg.querySelector('defs');
    if (defs) {
      const m = document.createElementNS(svgNS, 'marker');
      m.setAttribute('id', mid);
      m.setAttribute('viewBox', '0 0 10 10');
      m.setAttribute('markerWidth', '10');
      m.setAttribute('markerHeight', '10');
      m.setAttribute('refX', '9');
      m.setAttribute('refY', '5');
      m.setAttribute(
        'orient',
        position === 'start' ? 'auto-start-reverse' : 'auto'
      );
      const content = createMarkerContent(markerType, color);
      if (content) {
        m.appendChild(content);
      }
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
    const finalShape = effectiveShape(node);
    applyShapeGeometry(shape, finalShape, { x, y });

    // Container header line (update position if present)
    if (
      node.container?.headerHeight &&
      'w' in finalShape &&
      'h' in finalShape
    ) {
      const headerLine = group.querySelector<SVGLineElement>(
        '[data-viz-role="container-header"]'
      );
      if (headerLine) {
        const sw = (finalShape as { w: number }).w;
        const sh = (finalShape as { h: number }).h;
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
      if (node.container?.headerHeight && 'h' in finalShape && !node.label.dy) {
        const sh = (finalShape as { h: number }).h;
        ly = y - sh / 2 + node.container.headerHeight / 2;
        lx = x + (node.label.dx || 0);
      }

      label.setAttribute('x', String(lx));
      label.setAttribute('y', String(ly));

      // SVG text wrapping uses <tspan> which have hardcoded `x` coords.
      // We must sync the x value so multi-line text follows the animation horizontally.
      const tspans = label.querySelectorAll('tspan');
      for (let i = 0; i < tspans.length; i++) {
        tspans[i]?.setAttribute('x', String(lx));
      }
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

    // Port positions follow the node
    if (node.ports) {
      const portEls = group.querySelectorAll<SVGCircleElement>(
        '[data-viz-role="port"]'
      );
      portEls.forEach((portEl) => {
        const portId = portEl.getAttribute('data-port');
        const port = node.ports!.find((p) => p.id === portId);
        if (port) {
          portEl.setAttribute('cx', String(x + port.offset.x));
          portEl.setAttribute('cy', String(y + port.offset.y));
        }
      });
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
    if (edge.style?.strokeDasharray !== undefined)
      line.style.strokeDasharray = resolveDasharray(edge.style.strokeDasharray);

    // Update marker-end and marker-start to match edge stroke color
    if (edge.markerEnd && edge.markerEnd !== 'none') {
      const mid = edge.style?.stroke
        ? ensureColoredMarker(ctx.svg, edge.style.stroke, edge.markerEnd, 'end')
        : markerIdFor(edge.markerEnd, undefined, 'end');
      line.setAttribute('marker-end', `url(#${mid})`);
    } else {
      line.removeAttribute('marker-end');
    }

    if (edge.markerStart && edge.markerStart !== 'none') {
      const mid = edge.style?.stroke
        ? ensureColoredMarker(
            ctx.svg,
            edge.style.stroke,
            edge.markerStart,
            'start'
          )
        : markerIdFor(edge.markerStart, undefined, 'start');
      line.setAttribute('marker-start', `url(#${mid})`);
    } else {
      line.removeAttribute('marker-start');
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

        const tspans = el.querySelectorAll('tspan');
        for (let j = 0; j < tspans.length; j++) {
          tspans[j]?.setAttribute('x', String(pos.x));
        }
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
