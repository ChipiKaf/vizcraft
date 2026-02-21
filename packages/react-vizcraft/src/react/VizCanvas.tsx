import React, { useMemo } from 'react';
import type { VizScene, VizNode, VizEdge } from 'vizcraft';
import {
  AnimationRegistry,
  defaultRegistry,
} from './registries/AnimationRegistry';
import {
  OverlayRegistry,
  defaultOverlayRegistry,
} from './registries/OverlayRegistry';

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

  return (
    <div className={`viz-canvas ${className || ''}`}>
      <svg
        viewBox={`0 0 ${viewBox.w} ${viewBox.h}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <marker
            id="viz-arrow"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
          </marker>
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

            return (
              <g
                key={edge.id}
                className={`viz-edge-group ${edge.className || ''} ${animClasses}`}
                style={animStyles}
              >
                {/* Visual Line */}
                <line
                  x1={start.pos.x}
                  y1={start.pos.y}
                  x2={end.pos.x}
                  y2={end.pos.y}
                  className="viz-edge"
                  markerEnd={
                    edge.markerEnd === 'arrow' ? 'url(#viz-arrow)' : undefined
                  }
                  stroke="currentColor"
                />

                {/* Hit Area */}
                {(edge.hitArea || edge.onClick) && (
                  <line
                    x1={start.pos.x}
                    y1={start.pos.y}
                    x2={end.pos.x}
                    y2={end.pos.y}
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

                {/* Edge Label */}
                {edge.label && (
                  <text
                    x={(start.pos.x + end.pos.x) / 2 + (edge.label.dx || 0)}
                    y={(start.pos.y + end.pos.y) / 2 + (edge.label.dy || 0)}
                    className={`viz-edge-label ${edge.label.className || ''}`}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{ pointerEvents: 'none' }}
                  >
                    {edge.label.text}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* 2. Nodes (Shape + Labels) */}
        <g className="viz-layer-nodes">
          {animatedNodes.map((node) => (
            <g
              key={node.id}
              className={`viz-node-group ${node.className || ''}`}
              // Use transform for consistent positioning logic if we moved to pure CSS,
              // but since we are interpolating 'pos', we can just use RenderShape with updated pos.
              // However, let's keep the group for containment.
              onClick={(e) => {
                if (node.onClick) {
                  e.stopPropagation();
                  node.onClick(node.id, node);
                }
              }}
              style={{ cursor: node.onClick ? 'pointer' : undefined }}
            >
              <RenderShape node={node} />

              {/* Node Label */}
              {node.label && (
                <text
                  x={node.pos.x + (node.label.dx || 0)}
                  y={node.pos.y + (node.label.dy || 0)}
                  className={`viz-node-label ${node.label.className || ''}`}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ pointerEvents: 'none' }}
                >
                  {node.label.text}
                </text>
              )}
            </g>
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
    default:
      return null;
  }
}
