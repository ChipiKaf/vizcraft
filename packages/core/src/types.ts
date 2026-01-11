export type Vec2 = { x: number; y: number };

export type NodeShape =
  | { kind: 'circle'; r: number }
  | { kind: 'rect'; w: number; h: number; rx?: number }
  | { kind: 'diamond'; w: number; h: number };

export type NodeLabel = {
  text: string;
  dx?: number;
  dy?: number;
  className?: string;
  fill?: string;
  fontSize?: number | string;
  fontWeight?: number | string;
  textAnchor?: 'start' | 'middle' | 'end';
  dominantBaseline?: string;
};

export type AnimationDuration = `${number}s`;

export interface AnimationConfig {
  duration?: AnimationDuration;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

// Generic animation specification (request)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface VizAnimSpec<T = any> {
  id: string; // e.g. "flow"
  params?: T;
  when?: boolean; // Condition gate
}

export interface VizNode {
  id: string;
  pos: Vec2;
  shape: NodeShape;
  label?: NodeLabel;
  style?: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    opacity?: number;
  };
  className?: string; // e.g. "active", "input-layer"
  data?: unknown; // User payload
  onClick?: (id: string, node: VizNode) => void;
  animations?: VizAnimSpec[];
}

export interface EdgeLabel {
  text: string;
  position: 'start' | 'mid' | 'end'; // Simplified for now
  className?: string;
  dx?: number;
  dy?: number;
}

export interface VizEdge {
  id: string;
  from: string;
  to: string;
  label?: EdgeLabel;
  markerEnd?: 'arrow' | 'none';
  className?: string;
  hitArea?: number; // width in px
  data?: unknown;
  onClick?: (id: string, edge: VizEdge) => void;
  animations?: VizAnimSpec[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VizOverlaySpec<T = any> = {
  id: string; // overlay kind, e.g. "signal"
  key?: string; // stable key (optional)
  params: T; // overlay data
  className?: string; // e.g. "viz-signal-red"
};

export interface VizGridConfig {
  cols: number;
  rows: number;
  padding: { x: number; y: number };
}

export type VizScene = {
  viewBox: { w: number; h: number };
  grid?: VizGridConfig;
  nodes: VizNode[];
  edges: VizEdge[];
  overlays?: VizOverlaySpec[];
};
