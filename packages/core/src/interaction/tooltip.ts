import type { TooltipContent, VizNode, VizEdge } from '../types';

/** CSS injected into the container for tooltip styling. */
export const TOOLTIP_CSS = `
.viz-tooltip {
  position: absolute;
  pointer-events: none;
  z-index: 9999;
  max-width: 320px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.4;
  background: var(--viz-tooltip-bg, #1a1a2e);
  color: var(--viz-tooltip-fg, #e2e8f0);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  opacity: 0;
  transition: opacity 0.15s ease-out;
  white-space: pre-wrap;
  word-break: break-word;
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.viz-tooltip[data-visible="true"] {
  opacity: 1;
}
.viz-tooltip-title {
  font-weight: 600;
  margin-bottom: 4px;
  font-size: 14px;
}
.viz-tooltip-section {
  display: flex;
  gap: 6px;
  padding: 2px 0;
}
.viz-tooltip-section-label {
  color: var(--viz-tooltip-label, #94a3b8);
  flex-shrink: 0;
}
.viz-tooltip-section-label::after {
  content: ':';
}
.viz-tooltip-section-value {
  color: var(--viz-tooltip-fg, #e2e8f0);
}
`;

/** Escape HTML to prevent XSS. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Render tooltip content to an HTML string. */
function renderTooltipHtml(content: TooltipContent): string {
  if (typeof content === 'string') {
    return `<span>${escapeHtml(content)}</span>`;
  }

  let html = '';
  if (content.title) {
    html += `<div class="viz-tooltip-title">${escapeHtml(content.title)}</div>`;
  }
  for (const section of content.sections) {
    html +=
      '<div class="viz-tooltip-section">' +
      `<span class="viz-tooltip-section-label">${escapeHtml(section.label)}</span>` +
      `<span class="viz-tooltip-section-value">${escapeHtml(section.value)}</span>` +
      '</div>';
  }
  return html;
}

/** Position the tooltip relative to a target SVG element, avoiding overflow. */
function positionTooltip(
  tooltipEl: HTMLDivElement,
  targetEl: Element,
  container: HTMLElement
): void {
  const targetRect = targetEl.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  const gap = 8;
  const tooltipW = tooltipEl.offsetWidth;
  const tooltipH = tooltipEl.offsetHeight;

  // Center horizontally on the target
  let left =
    targetRect.left - containerRect.left + targetRect.width / 2 - tooltipW / 2;

  // Default: above the target
  let top = targetRect.top - containerRect.top - tooltipH - gap;

  // If overflows top, show below
  if (top < 0) {
    top = targetRect.bottom - containerRect.top + gap;
  }

  // Clamp horizontal to container bounds
  if (left < 0) left = 4;
  if (left + tooltipW > container.clientWidth) {
    left = container.clientWidth - tooltipW - 4;
  }

  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
}

/**
 * Manages tooltip lifecycle for a mounted VizCraft scene.
 *
 * Call `setup()` after mounting and `destroy()` when tearing down.
 */
export interface TooltipController {
  /** Remove event listeners and tooltip DOM. */
  destroy(): void;
  /** Update the tooltip data map (called on re-render / commit). */
  updateData(
    nodesById: Map<string, VizNode>,
    edgesById: Map<string, VizEdge>
  ): void;
}

export interface TooltipOptions {
  /** Delay in ms before showing the tooltip (default: 300). */
  delay?: number;
}

/**
 * Set up tooltip interaction for a mounted scene.
 *
 * Creates the tooltip DOM element and attaches delegated event listeners
 * to the container. Returns a controller to tear down later.
 */
export function setupTooltip(
  container: HTMLElement,
  svg: SVGSVGElement,
  nodesById: Map<string, VizNode>,
  edgesById: Map<string, VizEdge>,
  opts?: TooltipOptions
): TooltipController {
  const delay = opts?.delay ?? 300;

  let currentNodesById = nodesById;
  let currentEdgesById = edgesById;

  // Inject CSS if not already present
  let styleEl = container.querySelector(
    'style[data-viz-tooltip-css]'
  ) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.setAttribute('data-viz-tooltip-css', '');
    styleEl.textContent = TOOLTIP_CSS;
    container.appendChild(styleEl);
  }

  // Create tooltip element
  const tooltipEl = document.createElement('div');
  tooltipEl.className = 'viz-tooltip';
  tooltipEl.setAttribute('role', 'tooltip');
  tooltipEl.setAttribute('aria-hidden', 'true');
  container.appendChild(tooltipEl);

  // Ensure container can host positioned children
  const pos = getComputedStyle(container).position;
  if (pos === 'static') {
    container.style.position = 'relative';
  }

  let showTimer: ReturnType<typeof setTimeout> | null = null;
  let currentTarget: Element | null = null;

  function show(target: Element, content: TooltipContent): void {
    tooltipEl.innerHTML = renderTooltipHtml(content);
    // Make visible but fully transparent so we can measure
    tooltipEl.style.display = 'block';
    tooltipEl.setAttribute('data-visible', 'false');
    // Position after layout
    requestAnimationFrame(() => {
      positionTooltip(tooltipEl, target, container);
      tooltipEl.setAttribute('data-visible', 'true');
      tooltipEl.setAttribute('aria-hidden', 'false');
    });
  }

  function hide(): void {
    if (showTimer !== null) {
      clearTimeout(showTimer);
      showTimer = null;
    }
    tooltipEl.setAttribute('data-visible', 'false');
    tooltipEl.setAttribute('aria-hidden', 'true');
    currentTarget = null;
  }

  /** Find the tooltip content for a target element (walks up to node/edge group). */
  function findTooltip(target: EventTarget | null): {
    content: TooltipContent;
    group: Element;
  } | null {
    let el = target instanceof Element ? target : null;
    while (el && el !== svg) {
      const role = el.getAttribute('data-viz-role');
      const id = el.getAttribute('data-id');
      if (role === 'node-group' && id) {
        const node = currentNodesById.get(id);
        if (node?.tooltip) return { content: node.tooltip, group: el };
        return null;
      }
      if (role === 'edge-group' && id) {
        const edge = currentEdgesById.get(id);
        if (edge?.tooltip) return { content: edge.tooltip, group: el };
        return null;
      }
      el = el.parentElement;
    }
    return null;
  }

  function onPointerEnter(e: PointerEvent): void {
    const result = findTooltip(e.target);
    if (!result) return;
    const { content, group } = result;
    if (group === currentTarget) return;

    hide();
    currentTarget = group;
    showTimer = setTimeout(() => {
      show(group, content);
    }, delay);
  }

  function onPointerLeave(e: PointerEvent): void {
    const result = findTooltip(e.target);
    if (result && result.group === currentTarget) {
      hide();
    }
  }

  function onPointerMove(e: PointerEvent): void {
    const result = findTooltip(e.target);
    if (!result || result.group !== currentTarget) {
      hide();
    }
  }

  function onFocusIn(e: FocusEvent): void {
    const result = findTooltip(e.target);
    if (!result) return;
    hide();
    currentTarget = result.group;
    show(result.group, result.content);
  }

  function onFocusOut(): void {
    hide();
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      hide();
    }
  }

  svg.addEventListener('pointerenter', onPointerEnter, true);
  svg.addEventListener('pointerleave', onPointerLeave, true);
  svg.addEventListener('pointermove', onPointerMove, true);
  svg.addEventListener('focusin', onFocusIn, true);
  svg.addEventListener('focusout', onFocusOut, true);
  svg.addEventListener('keydown', onKeyDown, true);

  return {
    destroy() {
      hide();
      svg.removeEventListener('pointerenter', onPointerEnter, true);
      svg.removeEventListener('pointerleave', onPointerLeave, true);
      svg.removeEventListener('pointermove', onPointerMove, true);
      svg.removeEventListener('focusin', onFocusIn, true);
      svg.removeEventListener('focusout', onFocusOut, true);
      svg.removeEventListener('keydown', onKeyDown, true);
      tooltipEl.remove();
      styleEl?.remove();
    },
    updateData(newNodes: Map<string, VizNode>, newEdges: Map<string, VizEdge>) {
      currentNodesById = newNodes;
      currentEdgesById = newEdges;
    },
  };
}
