/**
 * Built-in semantic kind tokens (FR-5) and theme resolution.
 *
 * A `kind` on a node/edge maps to a visual token. The diagram-level
 * `VizSpec.theme` is merged **over** these built-ins, so one theme block
 * recolours the whole diagram; explicit per-element style always wins last.
 */

import type { EdgeKindToken, NodeKindToken, VizThemeSpec } from '../spec';

/** Built-in edge kind palette. */
export const BUILTIN_EDGE_KINDS: Record<string, EdgeKindToken> = {
  sync: {
    stroke: '#334155',
    strokeWidth: 2,
    dash: 'solid',
    markerEnd: 'arrow',
    legendLabel: 'Sync call',
  },
  async: {
    stroke: '#7c3aed',
    strokeWidth: 2,
    dash: 'dashed',
    markerEnd: 'arrowOpen',
    legendLabel: 'Async event',
  },
  data: {
    stroke: '#0284c7',
    strokeWidth: 2,
    dash: 'solid',
    markerEnd: 'arrow',
    legendLabel: 'Data flow',
  },
  contains: {
    stroke: '#94a3b8',
    strokeWidth: 1.5,
    dash: 'dotted',
    markerEnd: 'none',
    opacity: 0.8,
    legendLabel: 'Contains',
  },
  'contributes-to': {
    stroke: '#059669',
    strokeWidth: 2,
    dash: 'dashed',
    markerEnd: 'arrowOpen',
    legendLabel: 'Contributes to',
  },
  event: {
    stroke: '#d97706',
    strokeWidth: 2,
    dash: 'dashed',
    markerEnd: 'circleOpen',
    legendLabel: 'Event',
  },
};

/** Built-in node kind palette. */
export const BUILTIN_NODE_KINDS: Record<string, NodeKindToken> = {
  service: {
    fill: '#eff6ff',
    stroke: '#3b82f6',
    legendLabel: 'Service',
  },
  datastore: {
    fill: '#f0fdf4',
    stroke: '#16a34a',
    shape: 'cylinder',
    legendLabel: 'Data store',
  },
  external: {
    fill: '#f8fafc',
    stroke: '#94a3b8',
    dash: 'dashed',
    legendLabel: 'External system',
  },
  queue: {
    fill: '#fffbeb',
    stroke: '#d97706',
    legendLabel: 'Queue',
  },
  ui: {
    fill: '#fdf4ff',
    stroke: '#c026d3',
    legendLabel: 'UI',
  },
};

/** Fully resolved kind palettes: built-ins with the spec theme merged over them. */
export interface ResolvedTheme {
  edgeKinds: Record<string, EdgeKindToken>;
  nodeKinds: Record<string, NodeKindToken>;
}

/**
 * Merge a spec theme over the built-in palettes. Per-kind tokens are merged
 * shallowly, so a theme can override just the colour of a built-in kind.
 */
export function resolveTheme(theme?: VizThemeSpec): ResolvedTheme {
  const edgeKinds: Record<string, EdgeKindToken> = { ...BUILTIN_EDGE_KINDS };
  const nodeKinds: Record<string, NodeKindToken> = { ...BUILTIN_NODE_KINDS };

  for (const [kind, token] of Object.entries(theme?.edgeKinds ?? {})) {
    edgeKinds[kind] = { ...edgeKinds[kind], ...token };
  }
  for (const [kind, token] of Object.entries(theme?.nodeKinds ?? {})) {
    nodeKinds[kind] = { ...nodeKinds[kind], ...token };
  }

  return { edgeKinds, nodeKinds };
}
