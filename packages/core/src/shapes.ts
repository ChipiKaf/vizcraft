import type { NodeShape, Vec2, VizNode } from './types';

export type AnchorMode = 'center' | 'boundary';

export interface ShapeBehavior<K extends NodeShape['kind']> {
  kind: K;
  tagName: 'circle' | 'rect' | 'polygon' | 'g' | 'ellipse' | 'path';
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

function cylinderGeometry(
  shape: Extract<NodeShape, { kind: 'cylinder' }>,
  pos: Vec2
) {
  const rx = shape.w / 2;
  const ry = shape.arcHeight ?? Math.round(shape.h * 0.15);
  const topY = pos.y - shape.h / 2;
  const bottomY = pos.y + shape.h / 2;
  const x0 = pos.x - rx;
  const x1 = pos.x + rx;
  const bodyD = `M ${x0} ${topY} A ${rx} ${ry} 0 0 1 ${x1} ${topY} V ${bottomY} A ${rx} ${ry} 0 0 1 ${x0} ${bottomY} V ${topY} Z`;
  return { rx, ry, topY, bottomY, x0, x1, bodyD };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

const cylinderBehavior: ShapeBehavior<'cylinder'> = {
  kind: 'cylinder',
  tagName: 'g',
  applyGeometry(el, shape, pos) {
    const { rx, ry, topY, bodyD } = cylinderGeometry(shape, pos);

    // Get or create body path
    let body = el.querySelector(
      '[data-viz-cyl="body"]'
    ) as SVGPathElement | null;
    if (!body) {
      body = document.createElementNS(SVG_NS, 'path');
      body.setAttribute('data-viz-cyl', 'body');
      el.appendChild(body);
    }
    body.setAttribute('d', bodyD);

    // Get or create top cap ellipse (drawn on top for 3D effect)
    let cap = el.querySelector(
      '[data-viz-cyl="cap"]'
    ) as SVGEllipseElement | null;
    if (!cap) {
      cap = document.createElementNS(SVG_NS, 'ellipse');
      cap.setAttribute('data-viz-cyl', 'cap');
      el.appendChild(cap);
    }
    cap.setAttribute('cx', String(pos.x));
    cap.setAttribute('cy', String(topY));
    cap.setAttribute('rx', String(rx));
    cap.setAttribute('ry', String(ry));
  },
  svgMarkup(shape, pos, attrs) {
    const { rx, ry, topY, bodyD } = cylinderGeometry(shape, pos);
    const end = '</g>';
    return (
      `<g class="viz-node-shape" data-viz-role="node-shape"${attrs}>` +
      `<path d="${bodyD}" data-viz-cyl="body"/>` +
      `<ellipse cx="${pos.x}" cy="${topY}" rx="${rx}" ry="${ry}" data-viz-cyl="cap"/>` +
      end
    );
  },
  anchorBoundary(pos, target, shape) {
    // Approximate as rectangle bounding box
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

function hexagonPoints(
  pos: Vec2,
  r: number,
  orientation: 'pointy' | 'flat'
): string {
  const pts: string[] = [];
  // pointy-top: first vertex at top (angle offset -90°)
  // flat-top: first vertex at right (angle offset 0°)
  const angleOffset = orientation === 'pointy' ? -Math.PI / 2 : 0;
  for (let i = 0; i < 6; i++) {
    const angle = angleOffset + (Math.PI / 3) * i;
    const px = pos.x + r * Math.cos(angle);
    const py = pos.y + r * Math.sin(angle);
    pts.push(`${px},${py}`);
  }
  return pts.join(' ');
}

const hexagonBehavior: ShapeBehavior<'hexagon'> = {
  kind: 'hexagon',
  tagName: 'polygon',
  applyGeometry(el, shape, pos) {
    const orientation = shape.orientation ?? 'pointy';
    el.setAttribute('points', hexagonPoints(pos, shape.r, orientation));
  },
  svgMarkup(shape, pos, attrs) {
    const orientation = shape.orientation ?? 'pointy';
    const pts = hexagonPoints(pos, shape.r, orientation);
    return `<polygon points="${pts}" class="viz-node-shape" data-viz-role="node-shape"${attrs} />`;
  },
  anchorBoundary(pos, target, shape) {
    // Use the circumscribed circle as the boundary approximation
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

const ellipseBehavior: ShapeBehavior<'ellipse'> = {
  kind: 'ellipse',
  tagName: 'ellipse',
  applyGeometry(el, shape, pos) {
    el.setAttribute('cx', String(pos.x));
    el.setAttribute('cy', String(pos.y));
    el.setAttribute('rx', String(shape.rx));
    el.setAttribute('ry', String(shape.ry));
  },
  svgMarkup(shape, pos, attrs) {
    return `<ellipse cx="${pos.x}" cy="${pos.y}" rx="${shape.rx}" ry="${shape.ry}" class="viz-node-shape" data-viz-role="node-shape"${attrs} />`;
  },
  anchorBoundary(pos, target, shape) {
    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    if (dx === 0 && dy === 0) return { x: pos.x, y: pos.y };
    const denom =
      Math.sqrt(
        shape.rx * shape.rx * dy * dy + shape.ry * shape.ry * dx * dx
      ) || 1;
    return {
      x: pos.x + (shape.rx * shape.ry * dx) / denom,
      y: pos.y + (shape.rx * shape.ry * dy) / denom,
    };
  },
};

function arcPathD(
  shape: Extract<NodeShape, { kind: 'arc' }>,
  pos: Vec2
): string {
  const toRad = Math.PI / 180;
  const s = shape.startAngle * toRad;
  const e = shape.endAngle * toRad;
  const r = shape.r;
  const sx = pos.x + r * Math.cos(s);
  const sy = pos.y + r * Math.sin(s);
  const ex = pos.x + r * Math.cos(e);
  const ey = pos.y + r * Math.sin(e);
  const sweep = shape.endAngle - shape.startAngle;
  const largeArc = ((sweep % 360) + 360) % 360 > 180 ? 1 : 0;
  const closed = shape.closed !== false;
  if (closed) {
    return `M ${pos.x} ${pos.y} L ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey} Z`;
  }
  return `M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey}`;
}

const arcBehavior: ShapeBehavior<'arc'> = {
  kind: 'arc',
  tagName: 'path',
  applyGeometry(el, shape, pos) {
    el.setAttribute('d', arcPathD(shape, pos));
  },
  svgMarkup(shape, pos, attrs) {
    const d = arcPathD(shape, pos);
    return `<path d="${d}" class="viz-node-shape" data-viz-role="node-shape"${attrs} />`;
  },
  anchorBoundary(pos, target, shape) {
    // Approximate as circumscribed circle
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

function blockArrowPoints(
  shape: Extract<NodeShape, { kind: 'blockArrow' }>,
  pos: Vec2
): string {
  const halfBody = shape.bodyWidth / 2;
  const halfHead = shape.headWidth / 2;
  const halfLen = shape.length / 2;
  const neckX = halfLen - shape.headLength;
  const dir = shape.direction ?? 'right';
  const angle =
    dir === 'left'
      ? Math.PI
      : dir === 'up'
        ? -Math.PI / 2
        : dir === 'down'
          ? Math.PI / 2
          : 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const basePts: [number, number][] = [
    [-halfLen, -halfBody],
    [neckX, -halfBody],
    [neckX, -halfHead],
    [halfLen, 0],
    [neckX, halfHead],
    [neckX, halfBody],
    [-halfLen, halfBody],
  ];

  return basePts
    .map(([px, py]) => {
      const rx = px * cos - py * sin;
      const ry = px * sin + py * cos;
      return `${pos.x + rx},${pos.y + ry}`;
    })
    .join(' ');
}

const blockArrowBehavior: ShapeBehavior<'blockArrow'> = {
  kind: 'blockArrow',
  tagName: 'polygon',
  applyGeometry(el, shape, pos) {
    el.setAttribute('points', blockArrowPoints(shape, pos));
  },
  svgMarkup(shape, pos, attrs) {
    const pts = blockArrowPoints(shape, pos);
    return `<polygon points="${pts}" class="viz-node-shape" data-viz-role="node-shape"${attrs} />`;
  },
  anchorBoundary(pos, target, shape) {
    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    if (dx === 0 && dy === 0) return { x: pos.x, y: pos.y };
    const dir = shape.direction ?? 'right';
    const hw =
      dir === 'up' || dir === 'down' ? shape.headWidth / 2 : shape.length / 2;
    const hh =
      dir === 'up' || dir === 'down' ? shape.length / 2 : shape.headWidth / 2;
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

function calloutPathD(
  shape: Extract<NodeShape, { kind: 'callout' }>,
  pos: Vec2
): string {
  const hw = shape.w / 2;
  const hh = shape.h / 2;
  const r = Math.min(shape.rx ?? 0, hw, hh);
  const side = shape.pointerSide ?? 'bottom';
  const pH = shape.pointerHeight ?? Math.round(shape.h * 0.25);
  const pW = shape.pointerWidth ?? Math.round(shape.w * 0.2);
  const pp = shape.pointerPosition ?? 0.3;

  const left = pos.x - hw;
  const right = pos.x + hw;
  const top = pos.y - hh;
  const bottom = pos.y + hh;

  // pointer base coords along the side (0..sideLen)
  const segments: string[] = [];
  const arc = (cx: number, cy: number, startAngle: number) => {
    if (r === 0) return '';
    const s = startAngle;
    const e = s + Math.PI / 2;
    const ex = cx + r * Math.cos(e);
    const ey = cy + r * Math.sin(e);
    return `A ${r} ${r} 0 0 1 ${ex} ${ey}`;
  };

  // build CW from top-left
  // top-left corner
  segments.push(`M ${left + r} ${top}`);
  // top edge
  if (side === 'top') {
    const sideLen = shape.w - 2 * r;
    const b1 = left + r + sideLen * pp;
    const b2 = b1 + pW;
    segments.push(`L ${b1} ${top}`);
    segments.push(`L ${(b1 + b2) / 2} ${top - pH}`);
    segments.push(`L ${Math.min(b2, right - r)} ${top}`);
  }
  segments.push(`L ${right - r} ${top}`);
  // top-right corner
  segments.push(arc(right - r, top + r, -Math.PI / 2));
  // right edge
  if (side === 'right') {
    const sideLen = shape.h - 2 * r;
    const b1 = top + r + sideLen * pp;
    const b2 = b1 + pW;
    segments.push(`L ${right} ${b1}`);
    segments.push(`L ${right + pH} ${(b1 + b2) / 2}`);
    segments.push(`L ${right} ${Math.min(b2, bottom - r)}`);
  }
  segments.push(`L ${right} ${bottom - r}`);
  // bottom-right corner
  segments.push(arc(right - r, bottom - r, 0));
  // bottom edge
  if (side === 'bottom') {
    const sideLen = shape.w - 2 * r;
    const b2 = right - r - sideLen * pp;
    const b1 = b2 - pW;
    segments.push(`L ${b2} ${bottom}`);
    segments.push(`L ${(b1 + b2) / 2} ${bottom + pH}`);
    segments.push(`L ${Math.max(b1, left + r)} ${bottom}`);
  }
  segments.push(`L ${left + r} ${bottom}`);
  // bottom-left corner
  segments.push(arc(left + r, bottom - r, Math.PI / 2));
  // left edge
  if (side === 'left') {
    const sideLen = shape.h - 2 * r;
    const b2 = bottom - r - sideLen * pp;
    const b1 = b2 - pW;
    segments.push(`L ${left} ${b2}`);
    segments.push(`L ${left - pH} ${(b1 + b2) / 2}`);
    segments.push(`L ${left} ${Math.max(b1, top + r)}`);
  }
  segments.push(`L ${left} ${top + r}`);
  // close back to top-left (arc for last corner)
  segments.push(arc(left + r, top + r, Math.PI));
  segments.push('Z');

  return segments.filter(Boolean).join(' ');
}

const calloutBehavior: ShapeBehavior<'callout'> = {
  kind: 'callout',
  tagName: 'path',
  applyGeometry(el, shape, pos) {
    el.setAttribute('d', calloutPathD(shape, pos));
  },
  svgMarkup(shape, pos, attrs) {
    const d = calloutPathD(shape, pos);
    return `<path d="${d}" class="viz-node-shape" data-viz-role="node-shape"${attrs} />`;
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

/**
 * Compute the SVG path for a cloud shape that fits within a w×h bounding box
 * centered at `pos`. The outline is built from 6 cubic Bézier bumps.
 */
function cloudPathD(
  shape: Extract<NodeShape, { kind: 'cloud' }>,
  pos: Vec2
): string {
  const hw = shape.w / 2;
  const hh = shape.h / 2;
  const cx = pos.x;
  const cy = pos.y;

  // 6 control-point "bumps" expressed as fractions of half-width / half-height.
  // Each bump: [startX, startY, cp1x, cp1y, cp2x, cp2y, endX, endY]
  const bumps: [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ][] = [
    [-0.35, -0.85, -0.75, -1.2, -1.1, -0.5, -0.95, -0.2],
    [-0.95, -0.2, -1.2, 0.3, -0.9, 0.9, -0.45, 0.85],
    [-0.45, 0.85, -0.15, 1.15, 0.35, 1.15, 0.55, 0.8],
    [0.55, 0.8, 0.85, 0.95, 1.15, 0.45, 1.0, 0.05],
    [1.0, 0.05, 1.2, -0.45, 0.85, -0.95, 0.4, -0.85],
    [0.4, -0.85, 0.05, -1.2, -0.45, -1.1, -0.35, -0.85],
  ];

  const parts: string[] = [
    `M ${cx + bumps[0]![0] * hw} ${cy + bumps[0]![1] * hh}`,
  ];
  for (const [, , c1x, c1y, c2x, c2y, ex, ey] of bumps) {
    parts.push(
      `C ${cx + c1x * hw} ${cy + c1y * hh} ${cx + c2x * hw} ${cy + c2y * hh} ${cx + ex * hw} ${cy + ey * hh}`
    );
  }
  parts.push('Z');
  return parts.join(' ');
}

const cloudBehavior: ShapeBehavior<'cloud'> = {
  kind: 'cloud',
  tagName: 'path',
  applyGeometry(el, shape, pos) {
    el.setAttribute('d', cloudPathD(shape, pos));
  },
  svgMarkup(shape, pos, attrs) {
    const d = cloudPathD(shape, pos);
    return `<path d="${d}" class="viz-node-shape" data-viz-role="node-shape"${attrs} />`;
  },
  anchorBoundary(pos, target, shape) {
    // Bounding-ellipse approximation
    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    if (dx === 0 && dy === 0) return { x: pos.x, y: pos.y };
    const a = shape.w / 2;
    const b = shape.h / 2;
    const denom = Math.sqrt(a * a * dy * dy + b * b * dx * dx) || 1;
    return {
      x: pos.x + (a * b * dx) / denom,
      y: pos.y + (a * b * dy) / denom,
    };
  },
};

const shapeBehaviorRegistry: {
  [K in NodeShape['kind']]: ShapeBehavior<K>;
} = {
  circle: circleBehavior,
  rect: rectBehavior,
  diamond: diamondBehavior,
  cylinder: cylinderBehavior,
  hexagon: hexagonBehavior,
  ellipse: ellipseBehavior,
  arc: arcBehavior,
  blockArrow: blockArrowBehavior,
  callout: calloutBehavior,
  cloud: cloudBehavior,
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
