export const DEFAULT_VIZ_CSS = `
.viz-canvas {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
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
`;
