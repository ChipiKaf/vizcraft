import type {
  PanZoomOptions,
  PanZoomController,
  Vec2,
  VizScene,
} from './types';

export function setupPanZoom(
  svg: SVGSVGElement,
  viewport: SVGGElement,
  scene: VizScene,
  options: PanZoomOptions = {}
): PanZoomController {
  const minZoom = options.minZoom ?? 0.1;
  const maxZoom = options.maxZoom ?? 5;
  const zoomOnWheel = options.zoomOnWheel ?? true;
  const panOnDrag = options.panOnDrag ?? true;

  let zoom = 1;
  let pan = { x: 0, y: 0 };
  let isDragging = false;
  let lastPos = { x: 0, y: 0 };

  type Listener = (state: { zoom: number; pan: Vec2 }) => void;
  const listeners: Listener[] = [];

  const notify = () => {
    listeners.forEach((cb) => cb({ zoom, pan }));
  };

  const applyTransform = () => {
    viewport.setAttribute(
      'transform',
      `translate(${pan.x}, ${pan.y}) scale(${zoom})`
    );
    notify();
  };

  const setZoom = (level: number, center?: Vec2) => {
    const newZoom = Math.max(minZoom, Math.min(maxZoom, level));
    if (newZoom === zoom) return;

    if (center) {
      // Adjust pan to keep center point fixed relative to the SVG container
      const scaleDelta = newZoom / zoom;
      pan.x = center.x - (center.x - pan.x) * scaleDelta;
      pan.y = center.y - (center.y - pan.y) * scaleDelta;
    }

    zoom = newZoom;
    applyTransform();
  };

  const setPan = (offset: Vec2) => {
    pan = { ...offset };
    applyTransform();
  };

  const calculateFit = (padding = 20): { zoom: number; pan: Vec2 } | null => {
    if (!scene.viewBox) return null;
    const svgRect = svg.getBoundingClientRect();
    if (svgRect.width === 0 || svgRect.height === 0) return null;

    const availableWidth = svgRect.width - padding * 2;
    const availableHeight = svgRect.height - padding * 2;

    const scaleX = availableWidth / scene.viewBox.w;
    const scaleY = availableHeight / scene.viewBox.h;
    let fitZoom = Math.min(scaleX, scaleY);
    fitZoom = Math.max(minZoom, Math.min(maxZoom, fitZoom));

    // Center the content
    const scaledW = scene.viewBox.w * fitZoom;
    const scaledH = scene.viewBox.h * fitZoom;
    const fitPan = {
      x: (svgRect.width - scaledW) / 2,
      y: (svgRect.height - scaledH) / 2,
    };

    return { zoom: fitZoom, pan: fitPan };
  };

  const fitToContent = (padding = 20) => {
    const fit = calculateFit(padding);
    if (!fit) return;
    zoom = fit.zoom;
    pan = fit.pan;
    applyTransform();
  };

  const reset = () => {
    if (options.initialZoom === 'fit' || options.initialZoom === undefined) {
      fitToContent();
    } else {
      setZoom(options.initialZoom);
      setPan({ x: 0, y: 0 });
    }
  };

  const zoomToNode = (nodeId: string) => {
    const node = scene.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // Zoom to fit node bounds can be complex depending on shapes so we do a simple
    // zoom to a reasonably high zoom level centered on the node pos.
    const svgRect = svg.getBoundingClientRect();
    if (svgRect.width === 0 || svgRect.height === 0) return;

    const targetZoom = Math.max(minZoom, Math.min(maxZoom, 2)); // zoom level 2 is usually good

    // Center on node
    const targetPanX = svgRect.width / 2 - node.pos.x * targetZoom;
    const targetPanY = svgRect.height / 2 - node.pos.y * targetZoom;

    zoom = targetZoom;
    pan = { x: targetPanX, y: targetPanY };
    applyTransform();
  };

  // --- Event Handling ---

  const handleWheel = (e: WheelEvent) => {
    if (!zoomOnWheel) return;
    e.preventDefault();

    // Convert wheel delta to a zoom multiplier
    const speed = 0.002;
    // Normalize delta across browsers
    let delta = -e.deltaY;
    if (e.deltaMode === 1) delta *= 15; // lines

    const zoomMultiplier = Math.exp(delta * speed);
    const newZoom = zoom * zoomMultiplier;

    const svgRect = svg.getBoundingClientRect();
    const center = {
      x: e.clientX - svgRect.left,
      y: e.clientY - svgRect.top,
    };

    setZoom(newZoom, center);
  };

  const handlePointerDown = (e: PointerEvent) => {
    if (!panOnDrag) return;
    // Only start pan if clicking directly on the SVG or viewport wrapper, not on nodes/edges
    const target = e.target as Element;
    const isNodeOrEdge =
      target.closest('[data-viz-role]') ||
      target.closest('.viz-node') ||
      target.closest('.viz-edge');

    if (isNodeOrEdge && target !== svg && target !== viewport) return;

    e.preventDefault();
    isDragging = true;
    lastPos = { x: e.clientX, y: e.clientY };
    svg.setPointerCapture(e.pointerId);
    svg.style.cursor = 'grabbing';
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!isDragging || !panOnDrag) return;
    e.preventDefault();
    const dx = e.clientX - lastPos.x;
    const dy = e.clientY - lastPos.y;
    pan.x += dx;
    pan.y += dy;
    lastPos = { x: e.clientX, y: e.clientY };
    applyTransform();
  };

  const handlePointerUp = (e: PointerEvent) => {
    if (!isDragging || !panOnDrag) return;
    isDragging = false;
    svg.releasePointerCapture(e.pointerId);
    svg.style.cursor = '';
  };

  const handleDblClick = (e: MouseEvent) => {
    const target = e.target as Element;
    const isNodeOrEdge =
      target.closest('[data-viz-role]') ||
      target.closest('.viz-node') ||
      target.closest('.viz-edge');
    if (!isNodeOrEdge) {
      fitToContent();
    }
  };

  // Add listeners
  const optionsForWheel = { passive: false };
  svg.addEventListener('wheel', handleWheel, optionsForWheel);
  svg.addEventListener('pointerdown', handlePointerDown);
  svg.addEventListener('pointermove', handlePointerMove);
  svg.addEventListener('pointerup', handlePointerUp);
  svg.addEventListener('pointercancel', handlePointerUp);
  svg.addEventListener('dblclick', handleDblClick);

  const destroy = () => {
    svg.removeEventListener('wheel', handleWheel);
    svg.removeEventListener('pointerdown', handlePointerDown);
    svg.removeEventListener('pointermove', handlePointerMove);
    svg.removeEventListener('pointerup', handlePointerUp);
    svg.removeEventListener('pointercancel', handlePointerUp);
    svg.removeEventListener('dblclick', handleDblClick);
    listeners.length = 0;
  };

  // Initial setup
  // Defer reset slightly so that bounding client rect is populated if just mounted
  requestAnimationFrame(() => {
    reset();
  });

  return {
    get zoom() {
      return zoom;
    },
    get pan() {
      return { ...pan };
    },
    setZoom,
    setPan,
    fitToContent,
    zoomToNode,
    reset,
    onChange(cb: Listener) {
      listeners.push(cb);
      return () => {
        const idx = listeners.indexOf(cb);
        if (idx !== -1) listeners.splice(idx, 1);
      };
    },
    destroy,
  };
}
