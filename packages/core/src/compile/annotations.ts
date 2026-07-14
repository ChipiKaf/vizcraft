/**
 * Zones (FR-2), notes with leader lines (FR-6), title band and legend (FR-6).
 *
 * All of these resolve **after** layout: zones hug their members' resolved
 * boxes, notes sit beside their anchors, and the title/legend render as
 * static overlays in view coordinates.
 */

import type {
  LegendEntrySpec,
  LegendPositionSpec,
  LegendSpec,
  NodeSpec,
  StaticOverlaySpec,
  ViewSpec,
} from '../spec';
import type { ResolvedTheme } from './kinds';
import type { Box } from './types';

// ---------------------------------------------------------------------------
// Zones (FR-2)
// ---------------------------------------------------------------------------

export const ZONE_DEFAULT_PADDING = 24;
export const ZONE_DEFAULT_FILL = 'rgba(148,163,184,0.06)';
export const ZONE_DEFAULT_STROKE = '#94a3b8';

/**
 * Resolve a zone's box: pinned bounds win; otherwise the zone hugs the
 * resolved boxes of its explicit members (`zone: <id>` on nodes) plus padding.
 * Returns `null` for zones with neither members nor pinned bounds.
 */
export function resolveZoneBox(zone: NodeSpec, members: Box[]): Box | null {
  const padding = zone.padding ?? ZONE_DEFAULT_PADDING;

  if (members.length === 0) {
    if (zone.x !== undefined && zone.y !== undefined) {
      return {
        x: zone.x,
        y: zone.y,
        width: zone.width ?? 200,
        height: zone.height ?? 120,
      };
    }
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of members) {
    minX = Math.min(minX, b.x - b.width / 2);
    minY = Math.min(minY, b.y - b.height / 2);
    maxX = Math.max(maxX, b.x + b.width / 2);
    maxY = Math.max(maxY, b.y + b.height / 2);
  }

  // Reserve room for the corner label.
  const labelReserve = zone.label !== undefined ? 22 : 0;

  const hugged: Box = {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2 - labelReserve / 2,
    width: maxX - minX + 2 * padding,
    height: maxY - minY + 2 * padding + labelReserve,
  };

  return {
    x: zone.x ?? hugged.x,
    y: zone.y ?? hugged.y,
    width: zone.width ?? hugged.width,
    height: zone.height ?? hugged.height,
  };
}

// ---------------------------------------------------------------------------
// Notes (FR-6)
// ---------------------------------------------------------------------------

export const NOTE_GAP = 24;

/**
 * Place a note beside its anchor node: to the right when it fits in the
 * view, otherwise to the left. Pinned notes keep their coordinates.
 */
export function placeNote(
  note: NodeSpec,
  size: { width: number; height: number },
  anchorBox: Box,
  view: ViewSpec
): Box {
  if (note.x !== undefined && note.y !== undefined) {
    return { x: note.x, y: note.y, ...size };
  }

  const rightX = anchorBox.x + anchorBox.width / 2 + NOTE_GAP + size.width / 2;
  const leftX = anchorBox.x - anchorBox.width / 2 - NOTE_GAP - size.width / 2;
  const x = rightX + size.width / 2 <= view.width - 8 ? rightX : leftX;

  return { x, y: anchorBox.y, ...size };
}

// ---------------------------------------------------------------------------
// Title band (FR-6)
// ---------------------------------------------------------------------------

/** Overlays for the view title/subtitle header band. */
export function titleOverlays(view: ViewSpec): StaticOverlaySpec[] {
  const out: StaticOverlaySpec[] = [];
  if (view.title === undefined) return out;

  out.push({
    type: 'text',
    key: 'viz-title',
    x: view.width / 2,
    y: 30,
    text: view.title,
    fontSize: 20,
    fontWeight: '700',
    textAnchor: 'middle',
    fill: '#0f172a',
  });

  if (view.subtitle !== undefined) {
    out.push({
      type: 'text',
      key: 'viz-subtitle',
      x: view.width / 2,
      y: 52,
      text: view.subtitle,
      fontSize: 13,
      textAnchor: 'middle',
      fill: '#64748b',
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Legend (FR-6)
// ---------------------------------------------------------------------------

interface LegendRow {
  label: string;
  swatch: string;
  /** `'line'` for edge kinds, `'box'` for node kinds. */
  shape: 'line' | 'box';
}

const LEGEND_ROW_HEIGHT = 20;
const LEGEND_PADDING = 12;
const LEGEND_SWATCH_WIDTH = 20;
const LEGEND_MARGIN = 16;

/**
 * Build the legend overlays.
 *
 * `'auto'` derives one row per node/edge kind actually used (first-use
 * order, edge kinds first); explicit entries render as given.
 */
export function legendOverlays(
  legend: LegendSpec,
  view: ViewSpec,
  theme: ResolvedTheme,
  usedEdgeKinds: string[],
  usedNodeKinds: string[]
): StaticOverlaySpec[] {
  const config =
    legend === 'auto'
      ? { entries: undefined, position: undefined, title: undefined }
      : Array.isArray(legend)
        ? { entries: legend, position: undefined, title: undefined }
        : legend;

  const rows: LegendRow[] = [];

  if (config.entries !== undefined) {
    for (const entry of config.entries) {
      rows.push(explicitRow(entry, theme));
    }
  } else {
    for (const kind of usedEdgeKinds) {
      const token = theme.edgeKinds[kind];
      rows.push({
        label: token?.legendLabel ?? kind,
        swatch: token?.stroke ?? '#334155',
        shape: 'line',
      });
    }
    for (const kind of usedNodeKinds) {
      const token = theme.nodeKinds[kind];
      rows.push({
        label: token?.legendLabel ?? kind,
        swatch: token?.stroke ?? token?.fill ?? '#334155',
        shape: 'box',
      });
    }
  }

  if (rows.length === 0) return [];

  const titleRows = config.title !== undefined ? 1 : 0;
  const boxH =
    2 * LEGEND_PADDING + (rows.length + titleRows) * LEGEND_ROW_HEIGHT - 6;
  const maxLabel = Math.max(
    ...rows.map((r) => r.label.length),
    (config.title ?? '').length
  );
  const boxW = Math.max(
    120,
    2 * LEGEND_PADDING + LEGEND_SWATCH_WIDTH + 8 + maxLabel * 6.4
  );

  const position: LegendPositionSpec = config.position ?? 'bottom-left';
  const boxX = position.endsWith('left')
    ? LEGEND_MARGIN
    : view.width - LEGEND_MARGIN - boxW;
  const boxY = position.startsWith('top')
    ? LEGEND_MARGIN + (view.title !== undefined ? 48 : 0)
    : view.height - LEGEND_MARGIN - boxH;

  const overlays: StaticOverlaySpec[] = [
    {
      type: 'rect',
      key: 'viz-legend-bg',
      x: boxX,
      y: boxY,
      width: boxW,
      height: boxH,
      rx: 6,
      fill: 'rgba(255,255,255,0.92)',
      stroke: '#e2e8f0',
      strokeWidth: 1,
    },
  ];

  let rowY = boxY + LEGEND_PADDING;

  if (config.title !== undefined) {
    overlays.push({
      type: 'text',
      key: 'viz-legend-title',
      x: boxX + LEGEND_PADDING,
      y: rowY + 9,
      text: config.title,
      fontSize: 11,
      fontWeight: '700',
      textAnchor: 'start',
      fill: '#334155',
    });
    rowY += LEGEND_ROW_HEIGHT;
  }

  rows.forEach((row, i) => {
    const cy = rowY + LEGEND_ROW_HEIGHT / 2 - 2;
    if (row.shape === 'line') {
      overlays.push({
        type: 'rect',
        key: `viz-legend-swatch-${i}`,
        x: boxX + LEGEND_PADDING,
        y: cy - 1.5,
        width: LEGEND_SWATCH_WIDTH,
        height: 3,
        fill: row.swatch,
      });
    } else {
      overlays.push({
        type: 'rect',
        key: `viz-legend-swatch-${i}`,
        x: boxX + LEGEND_PADDING,
        y: cy - 6,
        width: LEGEND_SWATCH_WIDTH,
        height: 12,
        rx: 2,
        fill: row.swatch,
      });
    }
    overlays.push({
      type: 'text',
      key: `viz-legend-label-${i}`,
      x: boxX + LEGEND_PADDING + LEGEND_SWATCH_WIDTH + 8,
      y: cy + 4,
      text: row.label,
      fontSize: 11,
      textAnchor: 'start',
      fill: '#334155',
    });
    rowY += LEGEND_ROW_HEIGHT;
  });

  return overlays;
}

function explicitRow(entry: LegendEntrySpec, theme: ResolvedTheme): LegendRow {
  if (entry.kind !== undefined) {
    const edgeToken = theme.edgeKinds[entry.kind];
    if (edgeToken) {
      return {
        label: entry.label,
        swatch: entry.swatch ?? edgeToken.stroke ?? '#334155',
        shape: 'line',
      };
    }
    const nodeToken = theme.nodeKinds[entry.kind];
    if (nodeToken) {
      return {
        label: entry.label,
        swatch: entry.swatch ?? nodeToken.stroke ?? nodeToken.fill ?? '#334155',
        shape: 'box',
      };
    }
  }
  return {
    label: entry.label,
    swatch: entry.swatch ?? '#334155',
    shape: 'line',
  };
}
