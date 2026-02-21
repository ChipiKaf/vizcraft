import React, { useMemo } from 'react';
import type { VizScene, VizNode, VizEdge, EdgeMarkerType } from 'vizcraft';
import {
  computeEdgePath,
  computeEdgeEndpoints,
  resolveEdgeLabelPosition,
  collectEdgeLabels,
} from 'vizcraft';
import {
  AnimationRegistry,
  defaultRegistry,
} from './registries/AnimationRegistry';
import {
  OverlayRegistry,
  defaultOverlayRegistry,
} from './registries/OverlayRegistry';

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

/** All possible marker types (excluding 'none'). */
const ALL_MARKER_TYPES: Exclude<EdgeMarkerType, 'none'>[] = [
  'arrow',
  'arrowOpen',
  'diamond',
  'diamondOpen',
  'circle',
  'circleOpen',
  'square',
  'bar',
  'halfArrow',
];

export interface VizCanvasProps {
  scene: VizScene;
  className?: string; // Container class
  children?: React.ReactNode; // For custom overlays (lines, signals, etc)
  animationRegistry?: AnimationRegistry;
  overlayRegistry?: OverlayRegistry;
}

// Helper hook for smooth node transitions
function useAnimatedNodes(targetNodes: VizNode[]) {
  const [displayNodes, setDisplayNodes] = React.useState(targetNodes);

  // Ref to track latest target
  const targetNodesRef = React.useRef(targetNodes);
  targetNodesRef.current = targetNodes;

  // Ref for current interpolated values to avoid react batched updates lagging
  const currentPosIs = React.useRef(
    new Map<string, { x: number; y: number }>()
  );

  React.useLayoutEffect(() => {
    // Initialize currentPosIs with new nodes if missing
    targetNodes.forEach((n) => {
      if (!currentPosIs.current.has(n.id)) {
        currentPosIs.current.set(n.id, n.pos);
      }
    });

    let animationFrameId: number;
    const startTime = performance.now();
    const duration = 300; // ms

    // Snapshot starting positions
    const startPositions = new Map<string, { x: number; y: number }>();
    currentPosIs.current.forEach((pos, id) =>
      startPositions.set(id, { ...pos })
    );

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);

      let hasChanges = false;

      // Interpolate towards target
      const nextNodes = targetNodesRef.current.map((target) => {
        const start = startPositions.get(target.id);
        if (!start) return target; // New node, snap to target

        if (progress >= 1) {
          currentPosIs.current.set(target.id, target.pos);
          return target;
        }

        const newX = start.x + (target.pos.x - start.x) * ease;
        const newY = start.y + (target.pos.y - start.y) * ease;

        // Optimization: round to 0.1 to avoid producing new objects if close
        if (
          Math.abs(newX - target.pos.x) < 0.1 &&
          Math.abs(newY - target.pos.y) < 0.1
        ) {
          currentPosIs.current.set(target.id, target.pos);
          return target;
        }

        hasChanges = true;
        const newPos = { x: newX, y: newY };
        currentPosIs.current.set(target.id, newPos);

        return { ...target, pos: newPos };
      });

      if (hasChanges || progress < 1) {
        setDisplayNodes(nextNodes);
        if (progress < 1) {
          animationFrameId = requestAnimationFrame(tick);
        }
      } else {
        setDisplayNodes(targetNodesRef.current);
      }
    };

    animationFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrameId);
  }, [targetNodes]);

  return displayNodes;
}

/**
 * Renders SVG `<marker>` definitions for all marker types with a given color.
 */
function MarkerDefs({ color }: { color: string }) {
  const isDefault = color === 'currentColor';
  return (
    <>
      {ALL_MARKER_TYPES.flatMap((markerType) =>
        (['end', 'start'] as const).map((pos) => {
          const base = `viz-${markerType}`;
          const suffix = pos === 'start' ? '-start' : '';
          const id = isDefault
            ? `${base}${suffix}`
            : `${base}${suffix}-${colorToMarkerSuffix(color)}`;
          return (
            <MarkerDef
              key={id}
              id={id}
              markerType={markerType}
              color={color}
              position={pos}
            />
          );
        })
      )}
    </>
  );
}

function MarkerDef({
  id,
  markerType,
  color,
  position = 'end',
}: {
  id: string;
  markerType: Exclude<EdgeMarkerType, 'none'>;
  color: string;
  position?: 'start' | 'end';
}) {
  const content = useMemo(() => {
    switch (markerType) {
      case 'arrow':
        return <polygon points="0,2 10,5 0,8" fill={color} />;
      case 'arrowOpen':
        return (
          <polyline
            points="0,2 10,5 0,8"
            fill="white"
            stroke={color}
            strokeWidth="1.5"
            strokeLinejoin="miter"
          />
        );
      case 'diamond':
        return <polygon points="0,5 5,2 10,5 5,8" fill={color} />;
      case 'diamondOpen':
        return (
          <polygon
            points="0,5 5,2 10,5 5,8"
            fill="white"
            stroke={color}
            strokeWidth="1.5"
          />
        );
      case 'circle':
        return <circle cx="5" cy="5" r="3" fill={color} />;
      case 'circleOpen':
        return (
          <circle
            cx="5"
            cy="5"
            r="3"
            fill="white"
            stroke={color}
            strokeWidth="1.5"
          />
        );
      case 'square':
        return <rect x="2" y="2" width="6" height="6" fill={color} />;
      case 'bar':
        return (
          <line
            x1="5"
            y1="1"
            x2="5"
            y2="9"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
          />
        );
      case 'halfArrow':
        return <polygon points="0,2 10,5 0,5" fill={color} />;
    }
  }, [markerType, color]);

  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      markerWidth="10"
      markerHeight="10"
      refX={position === 'start' ? 1 : 9}
      refY={5}
      orient={position === 'start' ? 'auto-start-reverse' : 'auto'}
    >
      {content}
    </marker>
  );
}

export function VizCanvas(props: VizCanvasProps) {
  const { scene, className, children } = props;
  const { viewBox, nodes, edges } = scene;

  // Interpolate nodes for smooth movement
  const animatedNodes = useAnimatedNodes(nodes);

  // Create a map for quick node lookup by ID to calculate edge paths
  const nodesById = useMemo(() => {
    const map = new Map<string, VizNode>();
    animatedNodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [animatedNodes]);

  // Build Edge Map for easy lookup
  const edgesById = useMemo(
    () => new Map(scene.edges.map((e) => [e.id, e])),
    [scene.edges]
  );

  // Build parent→children map and root nodes for container grouping
  const childrenByParent = useMemo(() => {
    const map = new Map<string, VizNode[]>();
    animatedNodes.forEach((n) => {
      if (n.parentId) {
        let arr = map.get(n.parentId);
        if (!arr) {
          arr = [];
          map.set(n.parentId, arr);
        }
        arr.push(n);
      }
    });
    return map;
  }, [animatedNodes]);

  const rootNodes = useMemo(
    () => animatedNodes.filter((n) => !n.parentId),
    [animatedNodes]
  );

  return (
    <div className={`viz-canvas ${className || ''}`}>
      <svg
        viewBox={`0 0 ${viewBox.w} ${viewBox.h}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Default markers (currentColor) for all marker types */}
          <MarkerDefs color="currentColor" />
          {/* Per-color markers for edges with custom stroke */}
          {Array.from(
            new Set(
              edges
                .map((e: VizEdge) => e.style?.stroke)
                .filter((s): s is string => !!s)
            )
          ).map((color) => (
            <MarkerDefs key={color} color={color} />
          ))}
        </defs>

        {/* 1. Edges (Visual + Hit + Labels) */}
        <g className="viz-layer-edges">
          {edges.map((edge: VizEdge) => {
            const start = nodesById.get(edge.from);
            const end = nodesById.get(edge.to);
            if (!start || !end) return null;

            // Animation Logic
            // The user can provide a custom registry, or we fall back to default
            const registry = props.animationRegistry || defaultRegistry;

            let animClasses = '';
            let animStyles: React.CSSProperties = {};

            if (edge.animations) {
              edge.animations.forEach((spec) => {
                const renderer = registry.getEdgeRenderer(spec.id);
                if (renderer) {
                  if (renderer.getClass) {
                    animClasses += ` ${renderer.getClass({ spec, element: edge })}`;
                  }
                  if (renderer.getStyle) {
                    Object.assign(
                      animStyles,
                      renderer.getStyle({ spec, element: edge })
                    );
                  }
                } else {
                  console.warn(
                    `VizCanvas: No renderer found for animation '${spec.id}'`
                  );
                }
              });
            }

            const endpoints = computeEdgeEndpoints(start, end, edge);
            const edgePath = computeEdgePath(
              endpoints.start,
              endpoints.end,
              edge.routing,
              edge.waypoints
            );

            return (
              <g
                key={edge.id}
                className={`viz-edge-group ${edge.className || ''} ${animClasses}`}
                style={animStyles}
              >
                {/* Visual Path */}
                <path
                  d={edgePath.d}
                  className="viz-edge"
                  markerEnd={
                    edge.markerEnd && edge.markerEnd !== 'none'
                      ? `url(#${markerIdFor(edge.markerEnd, edge.style?.stroke, 'end')})`
                      : undefined
                  }
                  markerStart={
                    edge.markerStart && edge.markerStart !== 'none'
                      ? `url(#${markerIdFor(edge.markerStart, edge.style?.stroke, 'start')})`
                      : undefined
                  }
                  style={{
                    stroke: edge.style?.stroke,
                    strokeWidth: edge.style?.strokeWidth,
                    fill: edge.style?.fill,
                    opacity: edge.style?.opacity,
                  }}
                />

                {/* Hit Area */}
                {(edge.hitArea || edge.onClick) && (
                  <path
                    d={edgePath.d}
                    className="viz-edge-hit"
                    stroke="transparent"
                    strokeWidth={edge.hitArea || 10}
                    onClick={(e: React.MouseEvent) => {
                      if (edge.onClick) {
                        e.stopPropagation();
                        edge.onClick(edge.id, edge);
                      }
                    }}
                    style={{ cursor: edge.onClick ? 'pointer' : undefined }}
                  />
                )}

                {/* Edge Labels (multi-position) */}
                {collectEdgeLabels(edge).map((lbl, idx) => {
                  const pos = resolveEdgeLabelPosition(lbl, edgePath);
                  return (
                    <text
                      key={`${edge.id}-label-${idx}`}
                      x={pos.x}
                      y={pos.y}
                      className={`viz-edge-label ${lbl.className || ''}`}
                      data-label-index={idx}
                      data-label-position={lbl.position}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      style={{ pointerEvents: 'none' }}
                    >
                      {lbl.text}
                    </text>
                  );
                })}
              </g>
            );
          })}
        </g>

        {/* 2. Nodes (Shape + Labels) */}
        <g className="viz-layer-nodes">
          {rootNodes.map((node) => (
            <RenderNodeGroup
              key={node.id}
              node={node}
              childrenByParent={childrenByParent}
            />
          ))}
        </g>

        {/* 3. Overlays */}
        <g className="viz-layer-overlays">
          {(scene.overlays || []).map((spec, i) => {
            const overlayReg = props.overlayRegistry || defaultOverlayRegistry;
            const renderer = overlayReg.get(spec.id);
            if (!renderer) {
              console.warn(
                `VizCanvas: No renderer found for overlay '${spec.id}'`
              );
              return null;
            }

            return (
              <React.Fragment key={spec.key ?? `${spec.id}-${i}`}>
                {renderer.render({
                  spec,
                  nodesById: nodesById, // Use interpolated positions
                  edgesById: edgesById,
                  scene: scene,
                })}
              </React.Fragment>
            );
          })}
        </g>

        {/* 6. Custom Overlays (Children) */}
        {children}
      </svg>
    </div>
  );
}

function RenderNodeGroup({
  node,
  childrenByParent,
}: {
  node: VizNode;
  childrenByParent: Map<string, VizNode[]>;
}) {
  const { pos, shape, container } = node;
  const isContainer = !!container;
  const children = childrenByParent.get(node.id);

  // Compute label position (header-aware)
  let lx = pos.x + (node.label?.dx || 0);
  let ly = pos.y + (node.label?.dy || 0);
  if (
    isContainer &&
    container!.headerHeight &&
    'h' in shape &&
    node.label &&
    !node.label.dy
  ) {
    const sh = (shape as { h: number }).h;
    ly = pos.y - sh / 2 + container!.headerHeight / 2;
    lx = pos.x + (node.label.dx || 0);
  }

  return (
    <g
      key={node.id}
      className={`viz-node-group${isContainer ? ' viz-container' : ''} ${node.className || ''}`}
      onClick={(e) => {
        if (node.onClick) {
          e.stopPropagation();
          node.onClick(node.id, node);
        }
      }}
      style={{ cursor: node.onClick ? 'pointer' : undefined }}
    >
      <RenderShape node={node} />

      {/* Container header line */}
      {isContainer &&
        container!.headerHeight &&
        'w' in shape &&
        'h' in shape && (
          <line
            x1={pos.x - (shape as { w: number }).w / 2}
            y1={
              pos.y - (shape as { h: number }).h / 2 + container!.headerHeight
            }
            x2={pos.x + (shape as { w: number }).w / 2}
            y2={
              pos.y - (shape as { h: number }).h / 2 + container!.headerHeight
            }
            stroke="currentColor"
            className="viz-container-header"
          />
        )}

      {/* Node Label */}
      {node.label && (
        <text
          x={lx}
          y={ly}
          className={`viz-node-label ${node.label.className || ''}`}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ pointerEvents: 'none' }}
        >
          {node.label.text}
        </text>
      )}

      {/* Container children */}
      {children && children.length > 0 && (
        <g className="viz-container-children">
          {children.map((child) => (
            <RenderNodeGroup
              key={child.id}
              node={child}
              childrenByParent={childrenByParent}
            />
          ))}
        </g>
      )}
    </g>
  );
}

function RenderShape({ node }: { node: VizNode }) {
  const { shape, pos } = node;
  const { x, y } = pos;

  switch (shape.kind) {
    case 'circle':
      return <circle cx={x} cy={y} r={shape.r} className="viz-node-shape" />;
    case 'rect':
      return (
        <rect
          x={x - shape.w / 2}
          y={y - shape.h / 2}
          width={shape.w}
          height={shape.h}
          rx={shape.rx}
          className="viz-node-shape"
        />
      );
    case 'diamond':
      // Points: top, right, bottom, left
      const halfW = shape.w / 2;
      const halfH = shape.h / 2;
      const points = `
                ${x},${y - halfH} 
                ${x + halfW},${y} 
                ${x},${y + halfH} 
                ${x - halfW},${y}
            `;
      return <polygon points={points} className="viz-node-shape" />;
    case 'cylinder': {
      const cylRx = shape.w / 2;
      const cylRy = shape.arcHeight ?? Math.round(shape.h * 0.15);
      const topY = y - shape.h / 2;
      const bottomY = y + shape.h / 2;
      const x0 = x - cylRx;
      const x1 = x + cylRx;
      const bodyD = `M ${x0} ${topY} A ${cylRx} ${cylRy} 0 0 1 ${x1} ${topY} V ${bottomY} A ${cylRx} ${cylRy} 0 0 1 ${x0} ${bottomY} V ${topY} Z`;
      return (
        <g className="viz-node-shape">
          <path d={bodyD} data-viz-cyl="body" />
          <ellipse cx={x} cy={topY} rx={cylRx} ry={cylRy} data-viz-cyl="cap" />
        </g>
      );
    }
    case 'hexagon': {
      const orientation = shape.orientation ?? 'pointy';
      const angleOffset = orientation === 'pointy' ? -Math.PI / 2 : 0;
      const hexPts = Array.from({ length: 6 }, (_, i) => {
        const angle = angleOffset + (Math.PI / 3) * i;
        return `${x + shape.r * Math.cos(angle)},${y + shape.r * Math.sin(angle)}`;
      }).join(' ');
      return <polygon points={hexPts} className="viz-node-shape" />;
    }
    case 'ellipse':
      return (
        <ellipse
          cx={x}
          cy={y}
          rx={shape.rx}
          ry={shape.ry}
          className="viz-node-shape"
        />
      );
    case 'arc': {
      const toRad = Math.PI / 180;
      const s = shape.startAngle * toRad;
      const e = shape.endAngle * toRad;
      const r = shape.r;
      const sx = x + r * Math.cos(s);
      const sy = y + r * Math.sin(s);
      const ex = x + r * Math.cos(e);
      const ey = y + r * Math.sin(e);
      const sweep = shape.endAngle - shape.startAngle;
      const largeArc = ((sweep % 360) + 360) % 360 > 180 ? 1 : 0;
      const closed = shape.closed !== false;
      const d = closed
        ? `M ${x} ${y} L ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey} Z`
        : `M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey}`;
      return <path d={d} className="viz-node-shape" />;
    }
    case 'blockArrow': {
      const dir = shape.direction ?? 'right';
      const halfBody = shape.bodyWidth / 2;
      const halfHead = shape.headWidth / 2;
      const halfLen = shape.length / 2;
      const neckX = halfLen - shape.headLength;
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
      const blockPts = basePts
        .map(([px, py]) => {
          const rx = px * cos - py * sin;
          const ry = px * sin + py * cos;
          return `${x + rx},${y + ry}`;
        })
        .join(' ');
      return <polygon points={blockPts} className="viz-node-shape" />;
    }
    case 'callout': {
      const hw = shape.w / 2;
      const hh = shape.h / 2;
      const cr = Math.min(shape.rx ?? 0, hw, hh);
      const side = shape.pointerSide ?? 'bottom';
      const pH = shape.pointerHeight ?? Math.round(shape.h * 0.25);
      const pW = shape.pointerWidth ?? Math.round(shape.w * 0.2);
      const pp = shape.pointerPosition ?? 0.3;
      const left = x - hw;
      const right = x + hw;
      const top = y - hh;
      const bottom = y + hh;
      const arcSeg = (cx: number, cy: number, sa: number) => {
        if (cr === 0) return '';
        const ea = sa + Math.PI / 2;
        return `A ${cr} ${cr} 0 0 1 ${cx + cr * Math.cos(ea)} ${cy + cr * Math.sin(ea)}`;
      };
      const seg: string[] = [];
      seg.push(`M ${left + cr} ${top}`);
      if (side === 'top') {
        const sL = shape.w - 2 * cr;
        const b1 = left + cr + sL * pp;
        const b2 = b1 + pW;
        seg.push(
          `L ${b1} ${top} L ${(b1 + b2) / 2} ${top - pH} L ${Math.min(b2, right - cr)} ${top}`
        );
      }
      seg.push(`L ${right - cr} ${top}`);
      seg.push(arcSeg(right - cr, top + cr, -Math.PI / 2));
      if (side === 'right') {
        const sL = shape.h - 2 * cr;
        const b1 = top + cr + sL * pp;
        const b2 = b1 + pW;
        seg.push(
          `L ${right} ${b1} L ${right + pH} ${(b1 + b2) / 2} L ${right} ${Math.min(b2, bottom - cr)}`
        );
      }
      seg.push(`L ${right} ${bottom - cr}`);
      seg.push(arcSeg(right - cr, bottom - cr, 0));
      if (side === 'bottom') {
        const sL = shape.w - 2 * cr;
        const b2 = right - cr - sL * pp;
        const b1 = b2 - pW;
        seg.push(
          `L ${b2} ${bottom} L ${(b1 + b2) / 2} ${bottom + pH} L ${Math.max(b1, left + cr)} ${bottom}`
        );
      }
      seg.push(`L ${left + cr} ${bottom}`);
      seg.push(arcSeg(left + cr, bottom - cr, Math.PI / 2));
      if (side === 'left') {
        const sL = shape.h - 2 * cr;
        const b2 = bottom - cr - sL * pp;
        const b1 = b2 - pW;
        seg.push(
          `L ${left} ${b2} L ${left - pH} ${(b1 + b2) / 2} L ${left} ${Math.max(b1, top + cr)}`
        );
      }
      seg.push(`L ${left} ${top + cr}`);
      seg.push(arcSeg(left + cr, top + cr, Math.PI));
      seg.push('Z');
      const calloutD = seg.filter(Boolean).join(' ');
      return <path d={calloutD} className="viz-node-shape" />;
    }
    case 'cloud': {
      const chw = shape.w / 2;
      const chh = shape.h / 2;
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
      const cParts = [`M ${x + bumps[0]![0] * chw} ${y + bumps[0]![1] * chh}`];
      for (const [, , c1x, c1y, c2x, c2y, ex, ey] of bumps) {
        cParts.push(
          `C ${x + c1x * chw} ${y + c1y * chh} ${x + c2x * chw} ${y + c2y * chh} ${x + ex * chw} ${y + ey * chh}`
        );
      }
      cParts.push('Z');
      return <path d={cParts.join(' ')} className="viz-node-shape" />;
    }
    case 'cross': {
      const chs = shape.size / 2;
      const cbw = (shape.barWidth ?? Math.round(shape.size / 3)) / 2;
      const crossPts = [
        `${x - cbw},${y - chs}`,
        `${x + cbw},${y - chs}`,
        `${x + cbw},${y - cbw}`,
        `${x + chs},${y - cbw}`,
        `${x + chs},${y + cbw}`,
        `${x + cbw},${y + cbw}`,
        `${x + cbw},${y + chs}`,
        `${x - cbw},${y + chs}`,
        `${x - cbw},${y + cbw}`,
        `${x - chs},${y + cbw}`,
        `${x - chs},${y - cbw}`,
        `${x - cbw},${y - cbw}`,
      ].join(' ');
      return <polygon points={crossPts} className="viz-node-shape" />;
    }
    case 'cube': {
      const chw = shape.w / 2;
      const chh = shape.h / 2;
      const cd = shape.depth ?? Math.round(shape.w * 0.2);
      // Front face centered at pos so label aligns naturally
      const ftl = { x: x - chw, y: y - chh };
      const ftr = { x: x + chw, y: y - chh };
      const fbr = { x: x + chw, y: y + chh };
      const fbl = { x: x - chw, y: y + chh };
      const btl = { x: ftl.x + cd, y: ftl.y - cd };
      const btr = { x: ftr.x + cd, y: ftr.y - cd };
      const bbr = { x: fbr.x + cd, y: fbr.y - cd };
      const pts = (...vs: { x: number; y: number }[]) =>
        vs.map((v) => `${v.x},${v.y}`).join(' ');
      return (
        <g className="viz-node-shape">
          <polygon points={pts(ftl, ftr, fbr, fbl)} data-viz-cube="front" />
          <polygon
            points={pts(ftl, ftr, btr, btl)}
            data-viz-cube="top"
            style={{ filter: 'brightness(0.85)' }}
          />
          <polygon
            points={pts(ftr, btr, bbr, fbr)}
            data-viz-cube="right"
            style={{ filter: 'brightness(0.7)' }}
          />
        </g>
      );
    }
    case 'path': {
      const tx = x - shape.w / 2;
      const ty = y - shape.h / 2;
      return (
        <path
          d={shape.d}
          transform={`translate(${tx},${ty})`}
          className="viz-node-shape"
        />
      );
    }
    case 'document': {
      const dhw = shape.w / 2;
      const dhh = shape.h / 2;
      const dwh = shape.waveHeight ?? Math.round(shape.h * 0.1);
      const dx0 = x - dhw;
      const dx1 = x + dhw;
      const dy0 = y - dhh;
      const dy1 = y + dhh - dwh;
      const docD =
        `M ${dx0} ${dy0}` +
        ` H ${dx1}` +
        ` V ${dy1}` +
        ` C ${dx1 - dhw * 0.5} ${dy1 + dwh * 2}, ${dx0 + dhw * 0.5} ${dy1 - dwh}, ${dx0} ${dy1}` +
        ' Z';
      return <path d={docD} className="viz-node-shape" />;
    }
    case 'note': {
      const nhw = shape.w / 2;
      const nhh = shape.h / 2;
      const nf = shape.foldSize ?? 15;
      const nx0 = x - nhw;
      const nx1 = x + nhw;
      const ny0 = y - nhh;
      const ny1 = y + nhh;
      const bodyPts = `${nx0},${ny0} ${nx1 - nf},${ny0} ${nx1},${ny0 + nf} ${nx1},${ny1} ${nx0},${ny1}`;
      const foldPts = `${nx1 - nf},${ny0} ${nx1 - nf},${ny0 + nf} ${nx1},${ny0 + nf}`;
      return (
        <g className="viz-node-shape">
          <polygon points={bodyPts} data-viz-note="body" />
          <polygon
            points={foldPts}
            data-viz-note="fold"
            style={{ filter: 'brightness(0.8)' }}
          />
        </g>
      );
    }
    case 'parallelogram': {
      const phw = shape.w / 2;
      const phh = shape.h / 2;
      const psk = shape.skew ?? Math.round(shape.w * 0.2);
      const pHalf = psk / 2;
      const parPts = [
        `${x - phw - pHalf},${y + phh}`,
        `${x + phw - pHalf},${y + phh}`,
        `${x + phw + pHalf},${y - phh}`,
        `${x - phw + pHalf},${y - phh}`,
      ].join(' ');
      return <polygon points={parPts} className="viz-node-shape" />;
    }
    case 'star': {
      const sn = shape.points;
      const sOuter = shape.outerR;
      const sInner = shape.innerR ?? Math.round(sOuter * 0.4);
      const sVerts: string[] = [];
      for (let i = 0; i < sn * 2; i++) {
        const sr = i % 2 === 0 ? sOuter : sInner;
        const sAngle = (Math.PI * i) / sn - Math.PI / 2;
        sVerts.push(
          `${x + sr * Math.cos(sAngle)},${y + sr * Math.sin(sAngle)}`
        );
      }
      return <polygon points={sVerts.join(' ')} className="viz-node-shape" />;
    }
    case 'trapezoid': {
      const thtw = shape.topW / 2;
      const thbw = shape.bottomW / 2;
      const thh = shape.h / 2;
      const trapPts = [
        `${x - thtw},${y - thh}`,
        `${x + thtw},${y - thh}`,
        `${x + thbw},${y + thh}`,
        `${x - thbw},${y + thh}`,
      ].join(' ');
      return <polygon points={trapPts} className="viz-node-shape" />;
    }
    case 'triangle': {
      const trhw = shape.w / 2;
      const trhh = shape.h / 2;
      const tdir = shape.direction ?? 'up';
      let triPts: string;
      switch (tdir) {
        case 'up':
          triPts = [
            `${x},${y - trhh}`,
            `${x + trhw},${y + trhh}`,
            `${x - trhw},${y + trhh}`,
          ].join(' ');
          break;
        case 'down':
          triPts = [
            `${x},${y + trhh}`,
            `${x - trhw},${y - trhh}`,
            `${x + trhw},${y - trhh}`,
          ].join(' ');
          break;
        case 'left':
          triPts = [
            `${x - trhw},${y}`,
            `${x + trhw},${y - trhh}`,
            `${x + trhw},${y + trhh}`,
          ].join(' ');
          break;
        case 'right':
          triPts = [
            `${x + trhw},${y}`,
            `${x - trhw},${y + trhh}`,
            `${x - trhw},${y - trhh}`,
          ].join(' ');
          break;
      }
      return <polygon points={triPts} className="viz-node-shape" />;
    }
    default:
      return null;
  }
}
