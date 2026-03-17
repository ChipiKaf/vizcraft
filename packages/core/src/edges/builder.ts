import type {
  Vec2,
  VizEdge,
  EdgeLabel,
  EdgeRouting,
  EdgeMarkerType,
  AnimationConfig,
  NodeOptions,
  EdgeOptions,
  OverlayId,
  OverlayParams,
  VizScene,
  SvgExportOptions,
  TooltipContent,
} from '../types';
import type {
  VizBuilder,
  RichLabelBuilder,
  NodeBuilder,
  EdgeBuilder,
} from '../builder';
import { RichLabelBuilderImpl } from '../builder';
import type {
  AnimatableProps,
  TweenOptions,
  AnimationBuilder,
} from '../animation/builder';
import type { OverlayBuilder } from '../overlays/builder';

/** Apply an `EdgeOptions` object to an `EdgeBuilder` (sugar over chaining). */
export function applyEdgeOptions(eb: EdgeBuilder, opts: EdgeOptions): void {
  if (opts.from) eb.from(opts.from);
  if (opts.to) eb.to(opts.to);
  if (opts.fromAt) eb.fromAt(opts.fromAt);
  if (opts.toAt) eb.toAt(opts.toAt);

  // Routing
  if (opts.routing) eb.routing(opts.routing);
  if (opts.waypoints) {
    for (const wp of opts.waypoints) eb.via(wp.x, wp.y);
  }

  // Markers
  if (opts.arrow !== undefined) eb.arrow(opts.arrow);
  if (opts.markerStart) eb.markerStart(opts.markerStart);
  if (opts.markerEnd) eb.markerEnd(opts.markerEnd);

  if (opts.loopSide) eb.loopSide(opts.loopSide);
  if (opts.loopSize) eb.loopSize(opts.loopSize);

  // Style
  if (opts.stroke) {
    if (typeof opts.stroke === 'string') eb.stroke(opts.stroke);
    else eb.stroke(opts.stroke.color, opts.stroke.width);
  }
  if (opts.fill) eb.fill(opts.fill);
  if (opts.opacity !== undefined) eb.opacity(opts.opacity);
  if (opts.dash) eb.dash(opts.dash);
  if (opts.sketch) eb.sketch();
  if (opts.className) eb.class(opts.className);

  // Anchor & ports
  if (opts.anchor) eb.connect(opts.anchor);
  if (opts.fromPort) eb.fromPort(opts.fromPort);
  if (opts.toPort) eb.toPort(opts.toPort);
  if (opts.fromAngle !== undefined) eb.fromAngle(opts.fromAngle);
  if (opts.toAngle !== undefined) eb.toAngle(opts.toAngle);

  // Labels
  if (opts.label) {
    if (typeof opts.label === 'string') {
      eb.label(opts.label);
    } else if (Array.isArray(opts.label)) {
      for (const lbl of opts.label) {
        const text =
          typeof (lbl as { text?: unknown }).text === 'string'
            ? (lbl as { text: string }).text
            : '';
        eb.label(text, lbl as Partial<EdgeLabel>);
      }
    } else {
      const text =
        'text' in opts.label && typeof opts.label.text === 'string'
          ? opts.label.text
          : '';
      eb.label(text, opts.label as Partial<EdgeLabel>);
    }
  }
  // Hit area
  if (opts.hitArea !== undefined) eb.hitArea(opts.hitArea);

  // Extras
  if (opts.meta !== undefined) eb.meta(opts.meta);
  if (opts.data !== undefined) eb.data(opts.data);
  if (opts.onClick) eb.onClick(opts.onClick);
  if (opts.tooltip !== undefined) eb.tooltip(opts.tooltip);
}

export class EdgeBuilderImpl implements EdgeBuilder {
  private parent: VizBuilder;
  private edgeDef: Partial<VizEdge>;

  constructor(parent: VizBuilder, edgeDef: Partial<VizEdge>) {
    this.parent = parent;
    this.edgeDef = edgeDef;
  }

  straight(): EdgeBuilder {
    this.edgeDef.routing = 'straight';
    return this;
  }

  curved(): EdgeBuilder {
    this.edgeDef.routing = 'curved';
    return this;
  }

  orthogonal(): EdgeBuilder {
    this.edgeDef.routing = 'orthogonal';
    return this;
  }

  routing(mode: EdgeRouting): EdgeBuilder {
    this.edgeDef.routing = mode;
    return this;
  }

  via(x: number, y: number): EdgeBuilder {
    if (!this.edgeDef.waypoints) {
      this.edgeDef.waypoints = [];
    }
    this.edgeDef.waypoints.push({ x, y });
    return this;
  }

  from(nodeId: string): EdgeBuilder {
    this.edgeDef.from = nodeId;
    return this;
  }

  to(nodeId: string): EdgeBuilder {
    this.edgeDef.to = nodeId;
    return this;
  }

  fromAt(pos: Vec2): EdgeBuilder {
    this.edgeDef.fromAt = pos;
    return this;
  }

  toAt(pos: Vec2): EdgeBuilder {
    this.edgeDef.toAt = pos;
    return this;
  }

  label(text: string, opts?: Partial<EdgeLabel>): EdgeBuilder {
    const lbl: EdgeLabel = { position: 'mid', text, dy: -10, ...opts };
    // Accumulate into the labels array
    if (!this.edgeDef.labels) {
      this.edgeDef.labels = [];
    }
    this.edgeDef.labels.push(lbl);
    // Backwards compat: keep the first mid label in `label`
    if (lbl.position === 'mid' && !this.edgeDef.label) {
      this.edgeDef.label = lbl;
    }
    return this;
  }

  richLabel(
    cb: (l: RichLabelBuilder) => unknown,
    opts?: Partial<Omit<EdgeLabel, 'text' | 'rich'>>
  ): EdgeBuilder {
    const b = new RichLabelBuilderImpl();
    cb(b);
    const lbl: EdgeLabel = {
      position: 'mid',
      text: '',
      dy: -10,
      ...opts,
      rich: b.build(),
    };

    if (!this.edgeDef.labels) {
      this.edgeDef.labels = [];
    }
    this.edgeDef.labels.push(lbl);
    if (lbl.position === 'mid' && !this.edgeDef.label) {
      this.edgeDef.label = lbl;
    }
    return this;
  }

  arrow(enabled: boolean | 'both' | 'start' | 'end' = true): EdgeBuilder {
    if (enabled === 'both') {
      this.edgeDef.markerStart = 'arrow';
      this.edgeDef.markerEnd = 'arrow';
    } else if (enabled === 'start') {
      this.edgeDef.markerStart = 'arrow';
    } else if (enabled === 'end') {
      this.edgeDef.markerEnd = 'arrow';
    } else if (enabled === true) {
      this.edgeDef.markerEnd = 'arrow';
    } else {
      this.edgeDef.markerEnd = 'none';
    }
    return this;
  }

  markerEnd(type: EdgeMarkerType): EdgeBuilder {
    this.edgeDef.markerEnd = type;
    return this;
  }

  markerStart(type: EdgeMarkerType): EdgeBuilder {
    this.edgeDef.markerStart = type;
    return this;
  }

  connect(anchor: 'center' | 'boundary'): EdgeBuilder {
    this.edgeDef.anchor = anchor;
    return this;
  }

  fromPort(portId: string): EdgeBuilder {
    this.edgeDef.fromPort = portId;
    return this;
  }

  toPort(portId: string): EdgeBuilder {
    this.edgeDef.toPort = portId;
    return this;
  }

  fromAngle(deg: number): EdgeBuilder {
    this.edgeDef.fromAngle = deg;
    return this;
  }

  toAngle(deg: number): EdgeBuilder {
    this.edgeDef.toAngle = deg;
    return this;
  }

  fill(color: string): EdgeBuilder {
    this.edgeDef.style = {
      ...(this.edgeDef.style || {}),
      fill: color,
    };
    return this;
  }

  stroke(color: string, width?: number): EdgeBuilder {
    this.edgeDef.style = {
      ...(this.edgeDef.style || {}),
      stroke: color,
      strokeWidth: width ?? this.edgeDef.style?.strokeWidth,
    };
    return this;
  }

  opacity(value: number): EdgeBuilder {
    this.edgeDef.style = {
      ...(this.edgeDef.style || {}),
      opacity: value,
    };
    return this;
  }

  dashed(): EdgeBuilder {
    this.edgeDef.style = {
      ...(this.edgeDef.style || {}),
      strokeDasharray: 'dashed',
    };
    return this;
  }

  dotted(): EdgeBuilder {
    this.edgeDef.style = {
      ...(this.edgeDef.style || {}),
      strokeDasharray: 'dotted',
    };
    return this;
  }

  dash(
    pattern: 'solid' | 'dashed' | 'dotted' | 'dash-dot' | string
  ): EdgeBuilder {
    this.edgeDef.style = {
      ...(this.edgeDef.style || {}),
      strokeDasharray: pattern,
    };
    return this;
  }

  sketch(): EdgeBuilder {
    this.edgeDef.style = {
      ...(this.edgeDef.style || {}),
      sketch: true,
    };
    return this;
  }

  class(name: string): EdgeBuilder {
    if (this.edgeDef.className) {
      this.edgeDef.className += ` ${name}`;
    } else {
      this.edgeDef.className = name;
    }
    return this;
  }

  animate(type: string, config?: AnimationConfig): EdgeBuilder;
  animate(cb: (anim: AnimationBuilder) => unknown): EdgeBuilder;
  animate(
    typeOrCb: string | ((anim: AnimationBuilder) => unknown),
    config?: AnimationConfig
  ): EdgeBuilder {
    if (typeof typeOrCb === 'string') {
      if (!this.edgeDef.animations) {
        this.edgeDef.animations = [];
      }
      this.edgeDef.animations.push({ id: typeOrCb, params: config });
      return this;
    }

    const id = this.edgeDef.id || `${this.edgeDef.from}->${this.edgeDef.to}`;
    if (!id) {
      throw new Error('EdgeBuilder.animate(cb): edge has no id');
    }

    // Compile to a portable AnimationSpec and store on the scene via the parent builder.
    this.parent.animate((anim) => {
      anim.edge(id);
      typeOrCb(anim);
    });

    return this;
  }

  animateTo(props: AnimatableProps, opts: TweenOptions): EdgeBuilder {
    return this.animate((anim) => {
      anim.to(props, opts);
    });
  }

  hitArea(px: number): EdgeBuilder {
    this.edgeDef.hitArea = px;
    return this;
  }

  meta(meta: Record<string, unknown>): EdgeBuilder {
    this.edgeDef.meta = meta;
    return this;
  }

  data(payload: unknown): EdgeBuilder {
    this.edgeDef.data = payload;
    return this;
  }

  onClick(handler: (id: string, edge: VizEdge) => void): EdgeBuilder {
    this.edgeDef.onClick = handler;
    return this;
  }

  loopSide(side: 'top' | 'right' | 'bottom' | 'left'): EdgeBuilder {
    this.edgeDef.loopSide = side;
    return this;
  }

  loopSize(size: number): EdgeBuilder {
    this.edgeDef.loopSize = size;
    return this;
  }

  tooltip(content: TooltipContent): EdgeBuilder {
    this.edgeDef.tooltip = content;
    return this;
  }

  done(): VizBuilder {
    return this.parent;
  }

  // Chaining
  node(id: string): NodeBuilder;
  node(id: string, opts: NodeOptions): VizBuilder;
  node(id: string, opts?: NodeOptions): NodeBuilder | VizBuilder {
    return this.parent.node(id, opts as NodeOptions);
  }
  edge(from: string, to: string, id?: string): EdgeBuilder;
  edge(from: string, to: string, opts: EdgeOptions): VizBuilder;
  edge(
    from: string,
    to: string,
    idOrOpts?: string | EdgeOptions
  ): EdgeBuilder | VizBuilder {
    return this.parent.edge(from, to, idOrOpts as string);
  }
  danglingEdge(id: string, opts?: EdgeOptions): EdgeBuilder;
  danglingEdge(id: string, opts: EdgeOptions): VizBuilder;
  danglingEdge(id: string, opts?: EdgeOptions): EdgeBuilder | VizBuilder {
    return this.parent.danglingEdge(id, opts as EdgeOptions);
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
    if (typeof arg1 === 'function') return this.parent.overlay(arg1);
    return this.parent.overlay(
      arg1 as string,
      arg2,
      arg3 as string | undefined
    );
  }
  build(): VizScene {
    return this.parent.build();
  }
  svg(opts?: SvgExportOptions): string {
    return this.parent.svg(opts);
  }
}
