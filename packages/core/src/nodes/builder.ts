import type {
  VizNode,
  VizNodeCompartment,
  NodeLabel,
  AnimationConfig,
  ContainerConfig,
  NodeOptions,
  EdgeOptions,
  OverlayId,
  OverlayParams,
  VizScene,
  SvgExportOptions,
  TooltipContent,
  BadgePosition,
} from '../types';
import type {
  VizBuilder,
  RichLabelBuilder,
  NodeBuilder,
  EdgeBuilder,
  CompartmentBuilder,
} from '../builder';
import { RichLabelBuilderImpl } from '../builder';
import type {
  AnimatableProps,
  TweenOptions,
  AnimationBuilder,
} from '../animation/builder';
import type { OverlayBuilder } from '../overlays/builder';

/** Apply a `NodeOptions` object to a `NodeBuilder` (sugar over chaining). */
export function applyNodeOptions(nb: NodeBuilder, opts: NodeOptions): void {
  if (opts.at) nb.at(opts.at.x, opts.at.y);
  if (opts.cell) nb.cell(opts.cell.col, opts.cell.row, opts.cell.align);

  // Shape (first match wins)
  if (opts.circle) nb.circle(opts.circle.r);
  else if (opts.rect) nb.rect(opts.rect.w, opts.rect.h, opts.rect.rx);
  else if (opts.diamond) nb.diamond(opts.diamond.w, opts.diamond.h);
  else if (opts.cylinder)
    nb.cylinder(opts.cylinder.w, opts.cylinder.h, opts.cylinder.arcHeight);
  else if (opts.hexagon) nb.hexagon(opts.hexagon.r, opts.hexagon.orientation);
  else if (opts.ellipse) nb.ellipse(opts.ellipse.rx, opts.ellipse.ry);
  else if (opts.arc)
    nb.arc(opts.arc.r, opts.arc.startAngle, opts.arc.endAngle, opts.arc.closed);
  else if (opts.blockArrow)
    nb.blockArrow(
      opts.blockArrow.length,
      opts.blockArrow.bodyWidth,
      opts.blockArrow.headWidth,
      opts.blockArrow.headLength,
      opts.blockArrow.direction
    );
  else if (opts.callout)
    nb.callout(opts.callout.w, opts.callout.h, {
      rx: opts.callout.rx,
      pointerSide: opts.callout.pointerSide,
      pointerHeight: opts.callout.pointerHeight,
      pointerWidth: opts.callout.pointerWidth,
      pointerPosition: opts.callout.pointerPosition,
    });
  else if (opts.cloud) nb.cloud(opts.cloud.w, opts.cloud.h);
  else if (opts.cross) nb.cross(opts.cross.size, opts.cross.barWidth);
  else if (opts.cube) nb.cube(opts.cube.w, opts.cube.h, opts.cube.depth);
  else if (opts.path) nb.path(opts.path.d, opts.path.w, opts.path.h);
  else if (opts.document)
    nb.document(opts.document.w, opts.document.h, opts.document.waveHeight);
  else if (opts.note) nb.note(opts.note.w, opts.note.h, opts.note.foldSize);
  else if (opts.parallelogram)
    nb.parallelogram(
      opts.parallelogram.w,
      opts.parallelogram.h,
      opts.parallelogram.skew
    );
  else if (opts.star)
    nb.star(opts.star.points, opts.star.outerR, opts.star.innerR);
  else if (opts.trapezoid)
    nb.trapezoid(opts.trapezoid.topW, opts.trapezoid.bottomW, opts.trapezoid.h);
  else if (opts.triangle)
    nb.triangle(opts.triangle.w, opts.triangle.h, opts.triangle.direction);

  // Styling
  if (opts.fill) nb.fill(opts.fill);
  if (opts.stroke) {
    if (typeof opts.stroke === 'string') nb.stroke(opts.stroke);
    else nb.stroke(opts.stroke.color, opts.stroke.width);
  }
  if (opts.opacity !== undefined) nb.opacity(opts.opacity);
  if (opts.dash) nb.dash(opts.dash);
  if (opts.shadow !== undefined && opts.shadow !== false) {
    nb.shadow(opts.shadow === true ? {} : opts.shadow);
  }
  if (opts.sketch !== undefined && opts.sketch !== false) {
    nb.sketch(opts.sketch === true ? {} : opts.sketch);
  }
  if (opts.className) nb.class(opts.className);
  if (opts.zIndex !== undefined) nb.zIndex(opts.zIndex);

  // Label & Image
  if (opts.label) {
    if (typeof opts.label === 'string') nb.label(opts.label);
    else {
      const text =
        'text' in opts.label && typeof opts.label.text === 'string'
          ? opts.label.text
          : '';
      nb.label(text, opts.label as Partial<NodeLabel>);
    }
  }

  if (opts.image) {
    nb.image(opts.image.href, opts.image.w, opts.image.h, {
      dx: opts.image.dx,
      dy: opts.image.dy,
      position: opts.image.position,
      preserveAspectRatio: opts.image.preserveAspectRatio,
    });
  }
  if (opts.icon) {
    nb.icon(opts.icon.id, {
      size: opts.icon.size,
      color: opts.icon.color,
      dx: opts.icon.dx,
      dy: opts.icon.dy,
      position: opts.icon.position,
    });
  }
  if (opts.svgContent) {
    nb.svgContent(
      opts.svgContent.content,
      opts.svgContent.w,
      opts.svgContent.h,
      {
        dx: opts.svgContent.dx,
        dy: opts.svgContent.dy,
        position: opts.svgContent.position,
      }
    );
  }

  // Extras
  if (opts.data !== undefined) nb.data(opts.data);
  if (opts.onClick) nb.onClick(opts.onClick);
  if (opts.tooltip !== undefined) nb.tooltip(opts.tooltip);

  // Badges
  if (opts.badges) {
    for (const b of opts.badges) {
      nb.badge(b.text, {
        position: b.position,
        fill: b.fill,
        background: b.background,
        fontSize: b.fontSize,
      });
    }
  }

  // Ports
  if (opts.ports) {
    for (const p of opts.ports) nb.port(p.id, p.offset, p.direction);
  }

  // Containment
  if (opts.container) nb.container(opts.container);
  if (opts.parent) nb.parent(opts.parent);

  // Compartments (declarative)
  if (opts.compartments) {
    for (const c of opts.compartments) {
      nb.compartment(c.id, (cb) => {
        if (c.label) {
          if (typeof c.label === 'string') cb.label(c.label);
          else {
            const { text, ...rest } = c.label;
            cb.label(text, rest);
          }
        }
        if (c.height !== undefined) cb.height(c.height);
      });
    }
  }
}

/** Default height for a compartment when no explicit height is provided and no label is set. */
const DEFAULT_COMPARTMENT_HEIGHT = 30;
/** Default per-line height used to estimate auto-sizing from label text. */
const COMPARTMENT_LINE_HEIGHT = 16;
/** Vertical padding inside each compartment. */
const COMPARTMENT_PADDING_Y = 10;

/** Pending compartment definition before y/height are computed. */
interface PendingCompartment {
  id: string;
  label?: NodeLabel;
  explicitHeight?: number;
}

/**
 * Estimate the height needed for a compartment based on its label text content.
 * Counts explicit newlines so multi-line labels auto-size correctly.
 */
function estimateCompartmentHeight(c: PendingCompartment): number {
  if (c.explicitHeight !== undefined) return c.explicitHeight;
  if (!c.label) return DEFAULT_COMPARTMENT_HEIGHT;
  const lineCount = (c.label.text.match(/\n/g)?.length ?? 0) + 1;
  const fontSize =
    typeof c.label.fontSize === 'number'
      ? c.label.fontSize
      : COMPARTMENT_LINE_HEIGHT;
  return (
    lineCount * fontSize * (c.label.lineHeight ?? 1.2) +
    COMPARTMENT_PADDING_Y * 2
  );
}

/**
 * Resolve pending compartment definitions to finalized `VizNodeCompartment[]`,
 * computing `y` offsets and auto-sized heights. Also adjusts the node's shape
 * height to fit all compartments.
 */
export function resolveCompartments(
  pending: PendingCompartment[],
  nodeDef: Partial<VizNode>
): VizNodeCompartment[] {
  const nonEmpty = pending.filter(
    (c) => c.label || c.explicitHeight !== undefined
  );
  if (nonEmpty.length === 0) return [];

  let y = 0;
  const result: VizNodeCompartment[] = nonEmpty.map((c) => {
    const height = estimateCompartmentHeight(c);
    const compartment: VizNodeCompartment = { id: c.id, y, height };
    if (c.label) compartment.label = c.label;
    y += height;
    return compartment;
  });

  // Auto-size node height to fit compartments
  const totalHeight = y;
  if (nodeDef.shape && 'h' in nodeDef.shape) {
    const shape = nodeDef.shape as { h: number };
    if (shape.h === 0 || totalHeight > shape.h) {
      shape.h = totalHeight;
    }
  }

  return result;
}

class CompartmentBuilderImpl implements CompartmentBuilder {
  _pending: PendingCompartment;

  constructor(id: string) {
    this._pending = { id };
  }

  label(text: string, opts?: Partial<NodeLabel>): CompartmentBuilder {
    this._pending.label = {
      text,
      ...opts,
      textAnchor: opts?.textAnchor ?? 'start',
    };
    return this;
  }

  height(h: number): CompartmentBuilder {
    this._pending.explicitHeight = h;
    return this;
  }
}

export class NodeBuilderImpl implements NodeBuilder {
  private _builder: VizBuilder;
  private nodeDef: Partial<VizNode>;
  private _pendingCompartments: PendingCompartment[] = [];

  constructor(parent: VizBuilder, nodeDef: Partial<VizNode>) {
    this._builder = parent;
    this.nodeDef = nodeDef;
  }

  at(x: number, y: number): NodeBuilder {
    this.nodeDef.pos = { x, y };
    return this;
  }

  cell(
    col: number,
    row: number,
    align: 'center' | 'start' | 'end' = 'center'
  ): NodeBuilder {
    const grid = this._builder._getGridConfig();
    if (!grid) {
      console.warn(
        'VizBuilder: .cell() called but no grid configured. Use .grid() first.'
      );
      return this;
    }

    const view = this._builder._getViewBox();
    const availableW = view.w - grid.padding.x * 2;
    const availableH = view.h - grid.padding.y * 2;

    const cellW = availableW / grid.cols;
    const cellH = availableH / grid.rows;

    let x = grid.padding.x + col * cellW;
    let y = grid.padding.y + row * cellH;

    // Alignment adjustments
    if (align === 'center') {
      x += cellW / 2;
      y += cellH / 2;
    } else if (align === 'end') {
      x += cellW;
      y += cellH;
    }

    this.nodeDef.pos = { x, y };
    return this;
  }

  circle(r: number): NodeBuilder {
    this.nodeDef.shape = { kind: 'circle', r };
    return this;
  }

  rect(w: number, h: number, rx?: number): NodeBuilder {
    this.nodeDef.shape = { kind: 'rect', w, h, rx };
    return this;
  }

  diamond(w: number, h: number): NodeBuilder {
    this.nodeDef.shape = { kind: 'diamond', w, h };
    return this;
  }

  cylinder(w: number, h: number, arcHeight?: number): NodeBuilder {
    this.nodeDef.shape = { kind: 'cylinder', w, h, arcHeight };
    return this;
  }

  hexagon(r: number, orientation?: 'pointy' | 'flat'): NodeBuilder {
    this.nodeDef.shape = { kind: 'hexagon', r, orientation };
    return this;
  }

  ellipse(rx: number, ry: number): NodeBuilder {
    this.nodeDef.shape = { kind: 'ellipse', rx, ry };
    return this;
  }

  arc(
    r: number,
    startAngle: number,
    endAngle: number,
    closed?: boolean
  ): NodeBuilder {
    this.nodeDef.shape = { kind: 'arc', r, startAngle, endAngle, closed };
    return this;
  }

  blockArrow(
    length: number,
    bodyWidth: number,
    headWidth: number,
    headLength: number,
    direction?: 'right' | 'left' | 'up' | 'down'
  ): NodeBuilder {
    this.nodeDef.shape = {
      kind: 'blockArrow',
      length,
      bodyWidth,
      headWidth,
      headLength,
      direction,
    };
    return this;
  }

  callout(
    w: number,
    h: number,
    opts?: {
      rx?: number;
      pointerSide?: 'bottom' | 'top' | 'left' | 'right';
      pointerHeight?: number;
      pointerWidth?: number;
      pointerPosition?: number;
    }
  ): NodeBuilder {
    this.nodeDef.shape = {
      kind: 'callout',
      w,
      h,
      rx: opts?.rx,
      pointerSide: opts?.pointerSide,
      pointerHeight: opts?.pointerHeight,
      pointerWidth: opts?.pointerWidth,
      pointerPosition: opts?.pointerPosition,
    };
    return this;
  }

  cloud(w: number, h: number): NodeBuilder {
    this.nodeDef.shape = { kind: 'cloud', w, h };
    return this;
  }

  cross(size: number, barWidth?: number): NodeBuilder {
    this.nodeDef.shape = { kind: 'cross', size, barWidth };
    return this;
  }

  cube(w: number, h: number, depth?: number): NodeBuilder {
    this.nodeDef.shape = { kind: 'cube', w, h, depth };
    return this;
  }

  path(d: string, w: number, h: number): NodeBuilder {
    this.nodeDef.shape = { kind: 'path', d, w, h };
    return this;
  }

  document(w: number, h: number, waveHeight?: number): NodeBuilder {
    this.nodeDef.shape = { kind: 'document', w, h, waveHeight };
    return this;
  }

  note(w: number, h: number, foldSize?: number): NodeBuilder {
    this.nodeDef.shape = { kind: 'note', w, h, foldSize };
    return this;
  }

  parallelogram(w: number, h: number, skew?: number): NodeBuilder {
    this.nodeDef.shape = { kind: 'parallelogram', w, h, skew };
    return this;
  }

  star(points: number, outerR: number, innerR?: number): NodeBuilder {
    this.nodeDef.shape = { kind: 'star', points, outerR, innerR };
    return this;
  }

  trapezoid(topW: number, bottomW: number, h: number): NodeBuilder {
    this.nodeDef.shape = { kind: 'trapezoid', topW, bottomW, h };
    return this;
  }

  triangle(
    w: number,
    h: number,
    direction?: 'up' | 'down' | 'left' | 'right'
  ): NodeBuilder {
    this.nodeDef.shape = { kind: 'triangle', w, h, direction };
    return this;
  }

  image(
    href: string,
    wOrOpts:
      | number
      | {
          w: number;
          h: number;
          dx?: number;
          dy?: number;
          position?: 'center' | 'above' | 'below' | 'left' | 'right';
          preserveAspectRatio?: string;
        },
    h?: number,
    opts?: {
      dx?: number;
      dy?: number;
      position?: 'center' | 'above' | 'below' | 'left' | 'right';
      preserveAspectRatio?: string;
    }
  ): NodeBuilder {
    const parsed =
      typeof wOrOpts === 'number'
        ? {
            width: wOrOpts,
            height: h ?? wOrOpts,
            dx: opts?.dx,
            dy: opts?.dy,
            position: opts?.position,
            preserveAspectRatio: opts?.preserveAspectRatio,
          }
        : {
            width: wOrOpts.w,
            height: wOrOpts.h,
            dx: wOrOpts.dx,
            dy: wOrOpts.dy,
            position: wOrOpts.position,
            preserveAspectRatio: wOrOpts.preserveAspectRatio,
          };

    const image = {
      href,
      width: parsed.width,
      height: parsed.height,
    } as NonNullable<VizNode['image']>;
    if (parsed.dx !== undefined) image.dx = parsed.dx;
    if (parsed.dy !== undefined) image.dy = parsed.dy;
    if (parsed.position !== undefined) image.position = parsed.position;
    if (parsed.preserveAspectRatio !== undefined)
      image.preserveAspectRatio = parsed.preserveAspectRatio;
    this.nodeDef.image = image;
    return this;
  }

  icon(
    id: string,
    opts: {
      size: number;
      color?: string;
      dx?: number;
      dy?: number;
      position?: 'center' | 'above' | 'below' | 'left' | 'right';
    }
  ): NodeBuilder {
    const icon = {
      id,
      size: opts.size,
    } as NonNullable<VizNode['icon']>;
    if (opts.color !== undefined) icon.color = opts.color;
    if (opts.dx !== undefined) icon.dx = opts.dx;
    if (opts.dy !== undefined) icon.dy = opts.dy;
    if (opts.position !== undefined) icon.position = opts.position;
    this.nodeDef.icon = icon;
    return this;
  }

  svgContent(
    content: string,
    wOrOpts:
      | number
      | {
          w: number;
          h: number;
          dx?: number;
          dy?: number;
          position?: 'center' | 'above' | 'below' | 'left' | 'right';
        },
    h?: number,
    opts?: {
      dx?: number;
      dy?: number;
      position?: 'center' | 'above' | 'below' | 'left' | 'right';
    }
  ): NodeBuilder {
    const parsed =
      typeof wOrOpts === 'number'
        ? {
            width: wOrOpts,
            height: h ?? wOrOpts,
            dx: opts?.dx,
            dy: opts?.dy,
            position: opts?.position,
          }
        : {
            width: wOrOpts.w,
            height: wOrOpts.h,
            dx: wOrOpts.dx,
            dy: wOrOpts.dy,
            position: wOrOpts.position,
          };

    const svgContent = {
      content,
      width: parsed.width,
      height: parsed.height,
    } as NonNullable<VizNode['svgContent']>;
    if (parsed.dx !== undefined) svgContent.dx = parsed.dx;
    if (parsed.dy !== undefined) svgContent.dy = parsed.dy;
    if (parsed.position !== undefined) svgContent.position = parsed.position;
    this.nodeDef.svgContent = svgContent;
    return this;
  }

  label(text: string, opts?: Partial<NodeLabel>): NodeBuilder {
    this.nodeDef.label = { text, ...opts };
    return this;
  }

  richLabel(
    cb: (l: RichLabelBuilder) => unknown,
    opts?: Partial<Omit<NodeLabel, 'text' | 'rich'>>
  ): NodeBuilder {
    const b = new RichLabelBuilderImpl();
    cb(b);
    this.nodeDef.label = { text: '', ...opts, rich: b.build() };
    return this;
  }

  fill(color: string): NodeBuilder {
    this.nodeDef.style = {
      ...(this.nodeDef.style || {}),
      fill: color,
    };
    return this;
  }

  stroke(color: string, width?: number): NodeBuilder {
    this.nodeDef.style = {
      ...(this.nodeDef.style || {}),
      stroke: color,
      strokeWidth: width ?? this.nodeDef.style?.strokeWidth,
    };
    return this;
  }

  opacity(value: number): NodeBuilder {
    this.nodeDef.style = {
      ...(this.nodeDef.style || {}),
      opacity: value,
    };
    return this;
  }

  dashed(): NodeBuilder {
    this.nodeDef.style = {
      ...(this.nodeDef.style || {}),
      strokeDasharray: 'dashed',
    };
    return this;
  }

  dotted(): NodeBuilder {
    this.nodeDef.style = {
      ...(this.nodeDef.style || {}),
      strokeDasharray: 'dotted',
    };
    return this;
  }

  dash(
    pattern: 'solid' | 'dashed' | 'dotted' | 'dash-dot' | string
  ): NodeBuilder {
    this.nodeDef.style = {
      ...(this.nodeDef.style || {}),
      strokeDasharray: pattern,
    };
    return this;
  }

  shadow(config?: {
    dx?: number;
    dy?: number;
    blur?: number;
    color?: string;
  }): NodeBuilder {
    this.nodeDef.style = {
      ...(this.nodeDef.style || {}),
      shadow: config ?? {},
    };
    return this;
  }

  sketch(config?: { seed?: number }): NodeBuilder {
    this.nodeDef.style = {
      ...(this.nodeDef.style || {}),
      sketch: true,
      sketchSeed: config?.seed,
    };
    return this;
  }

  class(name: string): NodeBuilder {
    if (this.nodeDef.className) {
      this.nodeDef.className += ` ${name}`;
    } else {
      this.nodeDef.className = name;
    }
    return this;
  }

  zIndex(value: number): NodeBuilder {
    this.nodeDef.zIndex = value;
    return this;
  }

  animate(type: string, config?: AnimationConfig): NodeBuilder;
  animate(cb: (anim: AnimationBuilder) => unknown): NodeBuilder;
  animate(
    typeOrCb: string | ((anim: AnimationBuilder) => unknown),
    config?: AnimationConfig
  ): NodeBuilder {
    if (typeof typeOrCb === 'string') {
      if (!this.nodeDef.animations) {
        this.nodeDef.animations = [];
      }
      this.nodeDef.animations.push({ id: typeOrCb, params: config });
      return this;
    }

    const id = this.nodeDef.id;
    if (!id) {
      throw new Error('NodeBuilder.animate(cb): node has no id');
    }

    // Compile to a portable AnimationSpec and store on the scene via the parent builder.
    this._builder.animate((anim) => {
      anim.node(id);
      typeOrCb(anim);
    });

    return this;
  }

  animateTo(props: AnimatableProps, opts: TweenOptions): NodeBuilder {
    return this.animate((anim) => {
      anim.to(props, opts);
    });
  }

  data(payload: unknown): NodeBuilder {
    this.nodeDef.data = payload;
    return this;
  }

  onClick(handler: (id: string, node: VizNode) => void): NodeBuilder {
    this.nodeDef.onClick = handler;
    return this;
  }

  container(config?: ContainerConfig): NodeBuilder {
    this.nodeDef.container = config ?? { layout: 'free' };
    return this;
  }

  compartment(
    id: string,
    cb?: (c: CompartmentBuilder) => unknown
  ): NodeBuilder {
    const builder = new CompartmentBuilderImpl(id);
    if (cb) cb(builder);
    this._pendingCompartments.push(builder._pending);
    return this;
  }

  port(
    id: string,
    offset: { x: number; y: number },
    direction?: number
  ): NodeBuilder {
    if (!this.nodeDef.ports) {
      this.nodeDef.ports = [];
    }
    this.nodeDef.ports.push({ id, offset, direction });
    return this;
  }

  parent(parentId: string): NodeBuilder {
    this.nodeDef.parentId = parentId;
    return this;
  }

  tooltip(content: TooltipContent): NodeBuilder {
    this.nodeDef.tooltip = content;
    return this;
  }

  badge(
    text: string,
    opts?: {
      position?: BadgePosition;
      fill?: string;
      background?: string;
      fontSize?: number;
    }
  ): NodeBuilder {
    if (!this.nodeDef.badges) {
      this.nodeDef.badges = [];
    }
    this.nodeDef.badges.push({
      text,
      position: opts?.position ?? 'top-left',
      fill: opts?.fill,
      background: opts?.background,
      fontSize: opts?.fontSize,
    });
    return this;
  }

  /** Resolve pending compartments into finalized VizNodeCompartment[]. */
  private _resolveCompartments(): void {
    if (this._pendingCompartments.length === 0) return;
    this.nodeDef.compartments = resolveCompartments(
      this._pendingCompartments,
      this.nodeDef
    );
  }

  done(): VizBuilder {
    this._resolveCompartments();
    return this._builder;
  }

  // Chaining
  node(id: string): NodeBuilder;
  node(id: string, opts: NodeOptions): VizBuilder;
  node(id: string, opts?: NodeOptions): NodeBuilder | VizBuilder {
    this._resolveCompartments();
    return this._builder.node(id, opts as NodeOptions);
  }
  edge(from: string, to: string, id?: string): EdgeBuilder;
  edge(from: string, to: string, opts: EdgeOptions): VizBuilder;
  edge(
    from: string,
    to: string,
    idOrOpts?: string | EdgeOptions
  ): EdgeBuilder | VizBuilder {
    this._resolveCompartments();
    return this._builder.edge(from, to, idOrOpts as string);
  }
  danglingEdge(id: string, opts?: EdgeOptions): EdgeBuilder;
  danglingEdge(id: string, opts: EdgeOptions): VizBuilder;
  danglingEdge(id: string, opts?: EdgeOptions): EdgeBuilder | VizBuilder {
    this._resolveCompartments();
    return this._builder.danglingEdge(id, opts as EdgeOptions);
  }
  overlay<K extends OverlayId>(
    id: K,
    params: OverlayParams<K>,
    key?: string
  ): VizBuilder;
  overlay(cb: (overlay: OverlayBuilder) => unknown): VizBuilder;
  overlay<T>(id: string, params: T, key?: string): VizBuilder;
  overlay(
    arg1: string | ((overlay: OverlayBuilder) => unknown),
    arg2?: unknown,
    arg3?: string
  ): VizBuilder {
    this._resolveCompartments();
    if (typeof arg1 === 'function') return this._builder.overlay(arg1);
    return this._builder.overlay(
      arg1 as string,
      arg2,
      arg3 as string | undefined
    );
  }
  build(): VizScene {
    this._resolveCompartments();
    return this._builder.build();
  }
  svg(opts?: SvgExportOptions): string {
    this._resolveCompartments();
    return this._builder.svg(opts);
  }
}
