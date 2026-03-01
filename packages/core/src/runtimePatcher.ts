import type {
  VizScene,
  VizEdge,
  EdgeMarkerType,
  EdgePathResolver,
} from './types';
import { applyShapeGeometry, effectivePos, effectiveShape } from './shapes';
import {
  computeEdgePath,
  computeEdgeEndpoints,
  computeSelfLoop,
} from './edgePaths';
import { resolveEdgeLabelPosition, collectEdgeLabels } from './edgeLabels';
import { resolveDasharray } from './edgeStyles';

const svgNS = 'http://www.w3.org/2000/svg';

const SHADOW_DEFAULTS = {
  dx: 2,
  dy: 2,
  blur: 4,
  color: 'rgba(0,0,0,0.2)',
} as const;

function resolveShadow(shadow: {
  dx?: number;
  dy?: number;
  blur?: number;
  color?: string;
}): { dx: number; dy: number; blur: number; color: string } {
  return {
    dx: shadow.dx ?? SHADOW_DEFAULTS.dx,
    dy: shadow.dy ?? SHADOW_DEFAULTS.dy,
    blur: shadow.blur ?? SHADOW_DEFAULTS.blur,
    color: shadow.color ?? SHADOW_DEFAULTS.color,
  };
}

function shadowFilterId(cfg: {
  dx: number;
  dy: number;
  blur: number;
  color: string;
}): string {
  const colorSuffix = cfg.color.replace(/[^a-zA-Z0-9]/g, '_');
  return `viz-shadow-${cfg.dx}-${cfg.dy}-${cfg.blur}-${colorSuffix}`;
}

/** Lazily ensure a shadow `<filter>` definition exists in `<defs>`. */
function ensureShadowFilter(
  svg: SVGSVGElement,
  shadow: { dx?: number; dy?: number; blur?: number; color?: string }
): string {
  const cfg = resolveShadow(shadow);
  const fid = shadowFilterId(cfg);
  if (!svg.querySelector(`#${CSS.escape(fid)}`)) {
    const defs = svg.querySelector('defs');
    if (defs) {
      const filter = document.createElementNS(svgNS, 'filter');
      filter.setAttribute('id', fid);
      filter.setAttribute('x', '-50%');
      filter.setAttribute('y', '-50%');
      filter.setAttribute('width', '200%');
      filter.setAttribute('height', '200%');
      const drop = document.createElementNS(svgNS, 'feDropShadow');
      drop.setAttribute('dx', String(cfg.dx));
      drop.setAttribute('dy', String(cfg.dy));
      drop.setAttribute('stdDeviation', String(cfg.blur));
      drop.setAttribute('flood-color', cfg.color);
      drop.setAttribute('flood-opacity', '1');
      filter.appendChild(drop);
      defs.appendChild(filter);
    }
  }
  return fid;
}

function sketchFilterId(seed: number): string {
  return `viz-sketch-${seed}`;
}

/** Simple seeded float in [0, 1) derived from a seed via xorshift-like mix. */
function sketchRand(seed: number, salt: number): number {
  let s = ((seed ^ (salt * 2654435761)) >>> 0) | 1;
  s ^= s << 13;
  s ^= s >>> 17;
  s ^= s << 5;
  return (s >>> 0) / 4294967296;
}

/** Lerp a value between min and max using a seeded random. */
function sketchLerp(
  seed: number,
  salt: number,
  min: number,
  max: number
): number {
  return min + sketchRand(seed, salt) * (max - min);
}

/** Lazily ensure a sketch `<filter>` definition exists in `<defs>`. */
function ensureSketchFilter(svg: SVGSVGElement, seed: number): string {
  const fid = sketchFilterId(seed);
  if (!svg.querySelector(`#${CSS.escape(fid)}`)) {
    const defs = svg.querySelector('defs');
    if (defs) {
      const filter = document.createElementNS(svgNS, 'filter');
      filter.setAttribute('id', fid);
      filter.setAttribute('filterUnits', 'userSpaceOnUse');
      filter.setAttribute('x', '-10000');
      filter.setAttribute('y', '-10000');
      filter.setAttribute('width', '20000');
      filter.setAttribute('height', '20000');

      const s2 = seed + 37;
      // Derive unique per-seed parameters
      const freq2 = sketchLerp(seed, 1, 0.009, 0.015).toFixed(4);
      const scale1 = sketchLerp(seed, 2, 2.5, 4).toFixed(1);
      const scale2 = sketchLerp(seed, 3, 3, 5).toFixed(1);
      const dx = sketchLerp(seed, 4, 0.3, 1.6).toFixed(2);
      const dy = sketchLerp(seed, 5, 0.2, 1.3).toFixed(2);

      // First noise
      const turb1 = document.createElementNS(svgNS, 'feTurbulence');
      turb1.setAttribute('type', 'fractalNoise');
      turb1.setAttribute('baseFrequency', '0.008');
      turb1.setAttribute('numOctaves', '2');
      turb1.setAttribute('seed', String(seed));
      turb1.setAttribute('result', 'n1');
      filter.appendChild(turb1);

      // Second noise (different seed + frequency)
      const turb2 = document.createElementNS(svgNS, 'feTurbulence');
      turb2.setAttribute('type', 'fractalNoise');
      turb2.setAttribute('baseFrequency', freq2);
      turb2.setAttribute('numOctaves', '2');
      turb2.setAttribute('seed', String(s2));
      turb2.setAttribute('result', 'n2');
      filter.appendChild(turb2);

      // First stroke pass
      const disp1 = document.createElementNS(svgNS, 'feDisplacementMap');
      disp1.setAttribute('in', 'SourceGraphic');
      disp1.setAttribute('in2', 'n1');
      disp1.setAttribute('scale', scale1);
      disp1.setAttribute('xChannelSelector', 'R');
      disp1.setAttribute('yChannelSelector', 'G');
      disp1.setAttribute('result', 's1');
      filter.appendChild(disp1);

      // Second stroke pass (different channels)
      const disp2 = document.createElementNS(svgNS, 'feDisplacementMap');
      disp2.setAttribute('in', 'SourceGraphic');
      disp2.setAttribute('in2', 'n2');
      disp2.setAttribute('scale', scale2);
      disp2.setAttribute('xChannelSelector', 'G');
      disp2.setAttribute('yChannelSelector', 'R');
      disp2.setAttribute('result', 's2');
      filter.appendChild(disp2);

      // Offset second pass — variable gap
      const offset = document.createElementNS(svgNS, 'feOffset');
      offset.setAttribute('in', 's2');
      offset.setAttribute('dx', dx);
      offset.setAttribute('dy', dy);
      offset.setAttribute('result', 's2off');
      filter.appendChild(offset);

      // Merge both passes
      const comp = document.createElementNS(svgNS, 'feComposite');
      comp.setAttribute('in', 's1');
      comp.setAttribute('in2', 's2off');
      comp.setAttribute('operator', 'over');
      filter.appendChild(comp);

      defs.appendChild(filter);
    }
  }
  return fid;
}

/** Resolve the effective sketch seed for a node, falling back to the hash of its id. */
function resolveSketchSeed(
  nodeStyle: { sketchSeed?: number } | undefined,
  id: string
): number {
  if (nodeStyle?.sketchSeed !== undefined) return nodeStyle.sketchSeed;
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

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

  /** Optional hook to override how edge SVG paths are computed. */
  edgePathResolver?: EdgePathResolver | null;

  nodeGroupsById: Map<string, SVGGElement>;
  nodeShapesById: Map<string, SVGElement>;
  nodeLabelsById: Map<string, SVGTextElement>;
  nodeImagesById: Map<string, SVGImageElement>;
  nodeIconsById: Map<string, SVGGElement>;
  nodeSvgsById: Map<string, SVGGElement>;

  edgeGroupsById: Map<string, SVGGElement>;
  edgeLinesById: Map<string, SVGPathElement>;
  edgeHitsById: Map<string, SVGPathElement>;
  edgeLabelsById: Map<string, SVGTextElement[]>;
}

export function createRuntimePatchCtx(
  svg: SVGSVGElement,
  opts?: { edgePathResolver?: EdgePathResolver | null }
): RuntimePatchCtx {
  const nodeGroupsById = new Map<string, SVGGElement>();
  const nodeShapesById = new Map<string, SVGElement>();
  const nodeLabelsById = new Map<string, SVGTextElement>();
  const nodeImagesById = new Map<string, SVGImageElement>();
  const nodeIconsById = new Map<string, SVGGElement>();
  const nodeSvgsById = new Map<string, SVGGElement>();

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

      const image =
        group.querySelector<SVGImageElement>('[data-viz-role="node-image"]') ||
        group.querySelector<SVGImageElement>('.viz-node-image');
      if (image) nodeImagesById.set(id, image);

      const icon =
        group.querySelector<SVGGElement>('[data-viz-role="node-icon"]') ||
        group.querySelector<SVGGElement>('.viz-node-icon');
      if (icon) nodeIconsById.set(id, icon);

      const svgGroup =
        group.querySelector<SVGGElement>('[data-viz-role="node-svg"]') ||
        group.querySelector<SVGGElement>('.viz-node-svg');
      if (svgGroup) nodeSvgsById.set(id, svgGroup);
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
    edgePathResolver: opts?.edgePathResolver ?? null,
    nodeGroupsById,
    nodeShapesById,
    nodeLabelsById,
    nodeImagesById,
    nodeIconsById,
    nodeSvgsById,
    edgeGroupsById,
    edgeLinesById,
    edgeHitsById,
    edgeLabelsById,
  };
}

function effectiveShapeDims(shape: unknown): { w: number; h: number } {
  let w = 0;
  let h = 0;
  if (shape && typeof shape === 'object') {
    const s = shape as Record<string, unknown>;
    if (typeof s.w === 'number') w = s.w;
    else if (typeof s.r === 'number') w = s.r * 2;
    else if (typeof s.rx === 'number' && typeof s.ry === 'number') {
      w = (s.rx as number) * 2;
      h = (s.ry as number) * 2;
    } else if (typeof s.size === 'number') w = s.size;
    else if (typeof s.outerR === 'number') w = (s.outerR as number) * 2;

    if (typeof s.h === 'number') h = s.h;
    else if (h === 0) h = w;
  }
  return { w, h };
}

function mediaTopLeftAt(
  cx: number,
  cy: number,
  nodeW: number,
  nodeH: number,
  mediaW: number,
  mediaH: number,
  opts?: { position?: string; dx?: number; dy?: number }
): { x: number; y: number } {
  const position = (opts?.position ?? 'center') as
    | 'center'
    | 'above'
    | 'below'
    | 'left'
    | 'right';
  const dx = opts?.dx ?? 0;
  const dy = opts?.dy ?? 0;

  let ox = 0;
  let oy = 0;
  switch (position) {
    case 'above':
      oy = -nodeH / 2 - mediaH / 2;
      break;
    case 'below':
      oy = nodeH / 2 + mediaH / 2;
      break;
    case 'left':
      ox = -nodeW / 2 - mediaW / 2;
      break;
    case 'right':
      ox = nodeW / 2 + mediaW / 2;
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

    // Embedded media positions (image/icon/svg)
    const { w: nodeW, h: nodeH } = effectiveShapeDims(finalShape);
    if (nodeW > 0 && nodeH > 0) {
      const imgEl = ctx.nodeImagesById.get(node.id);
      if (imgEl && node.image) {
        const tl = mediaTopLeftAt(
          x,
          y,
          nodeW,
          nodeH,
          node.image.width,
          node.image.height,
          {
            position: node.image.position,
            dx: node.image.dx,
            dy: node.image.dy,
          }
        );
        imgEl.setAttribute('x', String(tl.x));
        imgEl.setAttribute('y', String(tl.y));
      }

      const iconEl = ctx.nodeIconsById.get(node.id);
      if (iconEl && node.icon) {
        const tl = mediaTopLeftAt(
          x,
          y,
          nodeW,
          nodeH,
          node.icon.size,
          node.icon.size,
          {
            position: node.icon.position,
            dx: node.icon.dx,
            dy: node.icon.dy,
          }
        );
        iconEl.setAttribute('transform', `translate(${tl.x} ${tl.y})`);
      }

      const svgEl = ctx.nodeSvgsById.get(node.id);
      if (svgEl && node.svgContent) {
        const tl = mediaTopLeftAt(
          x,
          y,
          nodeW,
          nodeH,
          node.svgContent.width,
          node.svgContent.height,
          {
            position: node.svgContent.position,
            dx: node.svgContent.dx,
            dy: node.svgContent.dy,
          }
        );
        svgEl.setAttribute('transform', `translate(${tl.x} ${tl.y})`);
      }
    }

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
      const tspans = label.querySelectorAll('tspan[data-viz-role="text-line"]');
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

    // NOTE: strokeDasharray is a static base style — written exclusively by
    // _renderSceneToDOM via setSvgAttributes.  patchRuntime must NOT duplicate
    // that write to avoid the stale-context overwrite described in #81.

    if (node.style?.shadow) {
      const fid = ensureShadowFilter(ctx.svg, node.style.shadow);
      shape.setAttribute('filter', `url(#${fid})`);
    } else {
      shape.removeAttribute('filter');
    }

    const nodeSketched = node.style?.sketch || scene.sketch?.enabled;
    if (nodeSketched) {
      const seed = resolveSketchSeed(node.style, node.id);
      const fid = ensureSketchFilter(ctx.svg, seed);
      group.setAttribute('filter', `url(#${fid})`);
      if (!group.classList.contains('viz-sketch')) {
        group.classList.add('viz-sketch');
      }
    } else {
      if (group.classList.contains('viz-sketch')) {
        group.classList.remove('viz-sketch');
      }
      // Only remove group filter if it was a sketch filter
      const cur = group.getAttribute('filter');
      if (cur && cur.startsWith('url(#viz-sketch-')) {
        group.removeAttribute('filter');
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

  const edgePathResolver = ctx.edgePathResolver;

  // Edges: patch endpoints + runtime props (opacity, strokeDashoffset) + label + hit.
  for (const edge of scene.edges) {
    const group = ctx.edgeGroupsById.get(edge.id);
    const line = ctx.edgeLinesById.get(edge.id);
    if (!group || !line) continue;

    const start = nodesById.get(edge.from);
    const end = nodesById.get(edge.to);
    if (!start || !end) continue;

    let edgePath;
    if (start === end) {
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

    if (edgePathResolver) {
      const defaultResolver = (e: VizEdge): string => {
        const s = nodesById.get(e.from);
        const t = nodesById.get(e.to);
        if (!s || !t) return '';
        if (s === t) return computeSelfLoop(s, e).d;
        const endpoints = computeEdgeEndpoints(s, t, e);
        return computeEdgePath(
          endpoints.start,
          endpoints.end,
          e.routing,
          e.waypoints
        ).d;
      };

      try {
        const d = edgePathResolver(edge, scene, defaultResolver);
        if (typeof d === 'string' && d) edgePath.d = d;
      } catch (err) {
        console.warn(
          `RuntimePatcher: edge path resolver threw for edge ${edge.id}`,
          err
        );
      }
    }

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

        const tspans = el.querySelectorAll('tspan[data-viz-role="text-line"]');
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

    const edgeSketched = edge.style?.sketch || scene.sketch?.enabled;
    if (edgeSketched) {
      let h = 0;
      for (let i = 0; i < edge.id.length; i++) {
        h = (Math.imul(31, h) + edge.id.charCodeAt(i)) | 0;
      }
      const seed = Math.abs(h);
      const fid = ensureSketchFilter(ctx.svg, seed);
      line.setAttribute('filter', `url(#${fid})`);
      if (!group.classList.contains('viz-sketch')) {
        group.classList.add('viz-sketch');
      }
    } else {
      const cur = line.getAttribute('filter');
      if (cur && cur.startsWith('url(#viz-sketch-')) {
        line.removeAttribute('filter');
      }
      if (group.classList.contains('viz-sketch')) {
        group.classList.remove('viz-sketch');
      }
    }
  }

  // Ensure DOM order matches zIndex order for node layer children
  // We use insertBefore to minimize DOM thrashing in the animation loop
  const rootNodesDOM = [];
  const childrenByParentDOM = new Map<string, typeof scene.nodes>();

  for (const n of scene.nodes) {
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
  }

  rootNodesDOM.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

  const nodeLayer =
    ctx.svg.querySelector('[data-viz-layer="nodes"]') ||
    ctx.svg.querySelector('.viz-layer-nodes');

  if (nodeLayer) {
    let currentDOMNode = nodeLayer.firstElementChild;
    for (const node of rootNodesDOM) {
      const group = ctx.nodeGroupsById.get(node.id);
      if (!group) continue;

      if (currentDOMNode !== group) {
        nodeLayer.insertBefore(group, currentDOMNode);
      } else {
        currentDOMNode = currentDOMNode.nextElementSibling;
      }
    }
  }

  for (const [parentId, children] of childrenByParentDOM.entries()) {
    children.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    const parentGroup = ctx.nodeGroupsById.get(parentId);
    if (!parentGroup) continue;

    const childrenGroup = parentGroup.querySelector(
      ':scope > [data-viz-role="container-children"]'
    );
    if (childrenGroup) {
      let currentDOMNode = childrenGroup.firstElementChild;
      for (const child of children) {
        const childGroup = ctx.nodeGroupsById.get(child.id);
        if (!childGroup) continue;

        if (currentDOMNode !== childGroup) {
          childrenGroup.insertBefore(childGroup, currentDOMNode);
        } else {
          currentDOMNode = currentDOMNode.nextElementSibling;
        }
      }
    }
  }
}
