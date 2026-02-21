export const DEFAULT_VIZ_CSS = `
.viz-canvas {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.viz-node-label,
.viz-edge-label {
  text-anchor: middle;
  dominant-baseline: middle;
  alignment-baseline: middle;
  transform: translateY(0);
}

.viz-canvas svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

/* Keyframes */
@keyframes vizFlow {
  from {
    stroke-dashoffset: 20;
  }
  to {
    stroke-dashoffset: 0;
  }
}

/* Animation Classes */

/* Flow Animation (Dashed line moving) */
.viz-anim-flow .viz-edge {
  stroke-dasharray: 5, 5;
  animation: vizFlow var(--viz-anim-duration, 2s) linear infinite;
}

/* Edge base styling (path elements need explicit fill:none) */
.viz-edge {
  fill: none;
  stroke: currentColor;
}

.viz-edge-hit {
  fill: none;
}

/* Node Transition */
.viz-node-group {
    transition: transform 0.3s ease-out, opacity 0.3s ease-out;
}

/* Overlay Classes */
.viz-grid-label {
  fill: #6B7280;
  font-size: 14px;
  font-weight: 600;
  opacity: 1;
}

.viz-signal {
    fill: #3B82F6;
    cursor: pointer;
    pointer-events: all; 
    transition: transform 0.2s ease-out, fill 0.2s ease-out;
}

.viz-signal .viz-signal-shape {
    fill: inherit;
}

.viz-signal:hover {
    fill: #60A5FA;
    transform: scale(1.5);
}

.viz-data-point {
  fill: #F59E0B;
  transition: cx 0.3s ease-out, cy 0.3s ease-out;
}

/* Connection ports (hidden by default, shown on node hover) */
.viz-port {
  fill: #3B82F6;
  stroke: white;
  stroke-width: 1.5;
  opacity: 0;
  pointer-events: all;
  cursor: crosshair;
  transition: opacity 0.15s ease-out;
}
.viz-node-group:hover .viz-port {
  opacity: 1;
}
`;
