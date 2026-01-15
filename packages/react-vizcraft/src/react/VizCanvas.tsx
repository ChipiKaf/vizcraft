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

// import './VizCanvas.scss';

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
    default:
      return null;
  }
}
