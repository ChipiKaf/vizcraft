import type { NodeShape, Vec2, VizNode } from './types';

export type AnchorMode = 'center' | 'boundary';

export interface ShapeBehavior<K extends NodeShape['kind']> {
  kind: K;
  tagName: 'circle' | 'rect' | 'polygon';
  applyGeometry(
    el: SVGElement,
    shape: Extract<NodeShape, { kind: K }>,
    pos: Vec2
  ): void;
  svgMarkup(
    shape: Extract<NodeShape, { kind: K }>,
    pos: Vec2,
    attrs: string
  ): string;
  anchorBoundary(
    pos: Vec2,
    target: Vec2,
    shape: Extract<NodeShape, { kind: K }>
  ): Vec2;
}

export function effectivePos(node: VizNode): Vec2 {
  return {
    x: node.runtime?.x ?? node.pos.x,
    y: node.runtime?.y ?? node.pos.y,
  };
}

function diamondPoints(pos: Vec2, w: number, h: number): string {
  const hw = w / 2;
  const hh = h / 2;
  return `${pos.x},${pos.y - hh} ${pos.x + hw},${pos.y} ${pos.x},${pos.y + hh} ${pos.x - hw},${pos.y}`;
}

const circleBehavior: ShapeBehavior<'circle'> = {
  kind: 'circle',
  tagName: 'circle',
  applyGeometry(el, shape, pos) {
    el.setAttribute('cx', String(pos.x));
    el.setAttribute('cy', String(pos.y));
    el.setAttribute('r', String(shape.r));
  },
  svgMarkup(shape, pos, attrs) {
    return `<circle cx="${pos.x}" cy="${pos.y}" r="${shape.r}" class="viz-node-shape" data-viz-role="node-shape"${attrs} />`;
  },
  anchorBoundary(pos, target, shape) {
    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    if (dx === 0 && dy === 0) return { x: pos.x, y: pos.y };
    const dist = Math.hypot(dx, dy) || 1;
    const scale = shape.r / dist;
    return {
      x: pos.x + dx * scale,
      y: pos.y + dy * scale,
    };
  },
};

const rectBehavior: ShapeBehavior<'rect'> = {
  kind: 'rect',
  tagName: 'rect',
  applyGeometry(el, shape, pos) {
    el.setAttribute('x', String(pos.x - shape.w / 2));
    el.setAttribute('y', String(pos.y - shape.h / 2));
    el.setAttribute('width', String(shape.w));
    el.setAttribute('height', String(shape.h));
    if (shape.rx !== undefined) {
      el.setAttribute('rx', String(shape.rx));
    }
  },
  svgMarkup(shape, pos, attrs) {
    return `<rect x="${pos.x - shape.w / 2}" y="${pos.y - shape.h / 2}" width="${shape.w}" height="${shape.h}" rx="${shape.rx || 0}" class="viz-node-shape" data-viz-role="node-shape"${attrs} />`;
  },
  anchorBoundary(pos, target, shape) {
    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    if (dx === 0 && dy === 0) return { x: pos.x, y: pos.y };
    const hw = shape.w / 2;
    const hh = shape.h / 2;
    const scale = Math.min(
      hw / Math.abs(dx || 1e-6),
      hh / Math.abs(dy || 1e-6)
    );
    return {
      x: pos.x + dx * scale,
      y: pos.y + dy * scale,
    };
  },
};

const diamondBehavior: ShapeBehavior<'diamond'> = {
  kind: 'diamond',
  tagName: 'polygon',
  applyGeometry(el, shape, pos) {
    el.setAttribute('points', diamondPoints(pos, shape.w, shape.h));
  },
  svgMarkup(shape, pos, attrs) {
    const pts = diamondPoints(pos, shape.w, shape.h);
    return `<polygon points="${pts}" class="viz-node-shape" data-viz-role="node-shape"${attrs} />`;
  },
  anchorBoundary(pos, target, shape) {
    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    if (dx === 0 && dy === 0) return { x: pos.x, y: pos.y };
    const hw = shape.w / 2;
    const hh = shape.h / 2;
    const denom = Math.abs(dx) / hw + Math.abs(dy) / hh;
    const scale = denom === 0 ? 0 : 1 / denom;
    return {
      x: pos.x + dx * scale,
      y: pos.y + dy * scale,
    };
  },
};

const shapeBehaviorRegistry: {
  [K in NodeShape['kind']]: ShapeBehavior<K>;
} = {
  circle: circleBehavior,
  rect: rectBehavior,
  diamond: diamondBehavior,
};

export function getShapeBehavior(shape: NodeShape) {
  return shapeBehaviorRegistry[shape.kind];
}

export function applyShapeGeometry(
  el: SVGElement,
  shape: NodeShape,
  pos: Vec2
) {
  const behavior = getShapeBehavior(shape);
  behavior.applyGeometry(el, shape as never, pos);
}

export function shapeSvgMarkup(shape: NodeShape, pos: Vec2, attrs: string) {
  const behavior = getShapeBehavior(shape);
  return behavior.svgMarkup(shape as never, pos, attrs);
}

export function computeNodeAnchor(
  node: VizNode,
  target: Vec2,
  anchor: AnchorMode
): Vec2 {
  const pos = effectivePos(node);
  if (anchor === 'center') {
    return { x: pos.x, y: pos.y };
  }
  const behavior = getShapeBehavior(node.shape);
  return behavior.anchorBoundary(pos, target, node.shape as never);
}
