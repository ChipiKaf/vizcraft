import type { VizBuilder } from '../builder';
import { fromSpec } from '../fromSpec';
import type { MountController } from '../types';
import type { AutoSignalSpec, VizSpec, VizStepSpec } from '../spec';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface StepDef {
  /** Text shown in the step bar / passed to `onStepChange`. */
  label: string;

  /**
   * The scene for this step. A factory function is called **once** at first
   * activation and the resulting builder is cached for subsequent revisits.
   */
  builder: VizBuilder | (() => VizBuilder);

  /** Self-animating signals to run when the step is active. */
  autoSignals?: AutoSignalSpec[];

  /**
   * When true, the controller calls `next()` automatically 50 ms after all
   * non-looping `autoSignals` complete. Default: false.
   */
  autoAdvance?: boolean;
}

export interface StepControllerOptions {
  container: HTMLElement;
  steps: StepDef[];

  /** Called whenever the active step changes. */
  onStepChange?: (index: number, step: StepDef) => void;

  /**
   * Called when the current step's animations have completed and the
   * walkthrough is ready to advance.
   */
  onReady?: () => void;

  /**
   * When true, renders a minimal built-in step indicator bar below the canvas.
   * Styled by `.viz-step-bar`. Default: false.
   */
  showStepBar?: boolean;
}

export interface StepController {
  /** Advance to the next step. No-op at the last step. */
  next(): void;
  /** Go back to the previous step. No-op at the first step. */
  prev(): void;
  /** Jump to a specific step by index. Throws RangeError if out of range. */
  goTo(index: number): void;
  /** Reset to step 0 and restart. */
  reset(): void;
  /** 0-based index of the currently active step. */
  readonly currentIndex: number;
  /** Total number of steps. */
  readonly totalSteps: number;
  /** True once the current step's non-looping animations have completed. */
  readonly isReady: boolean;
  /** Pause autoSignal animations on the current step. */
  pause(): void;
  /** Resume paused animations. */
  resume(): void;
  /** Destroy: stops animations, clears SVG, removes step bar. */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Step bar helpers (DOM only — no-op in non-browser environments)
// ---------------------------------------------------------------------------

function createStepBar(container: HTMLElement): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'viz-step-bar';
  bar.style.cssText =
    'height:32px;display:flex;align-items:center;justify-content:space-between;' +
    'padding:0 8px;font-size:12px;font-family:inherit;box-sizing:border-box;';
  container.insertAdjacentElement('afterend', bar);
  return bar;
}

function updateStepBar(
  bar: HTMLElement,
  index: number,
  steps: StepDef[]
): void {
  const step = steps[index];
  if (!step) return;
  bar.innerHTML =
    '<span class="viz-step-bar__label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
    `${step.label}</span>` +
    '<span class="viz-step-bar__counter" style="flex-shrink:0;margin-left:8px;">' +
    `Step\u00a0${index + 1}\u00a0/\u00a0${steps.length}</span>`;
}

// ---------------------------------------------------------------------------
// Core implementation
// ---------------------------------------------------------------------------

export function createStepController(
  opts: StepControllerOptions
): StepController {
  const { container, steps, onStepChange, onReady, showStepBar = false } = opts;

  if (steps.length === 0) {
    throw new Error('createStepController: steps must be non-empty');
  }

  let currentIndex = 0;
  // Monotonically-increasing counter used to detect stale async callbacks.
  let activationGeneration = 0;
  let isReady = false;
  let currentController: MountController | null = null;
  let destroyed = false;

  // Builders are resolved lazily and cached (one instance per step index).
  const builderCache = new Map<number, VizBuilder>();
  let stepBarEl: HTMLElement | null = null;
  if (showStepBar) stepBarEl = createStepBar(container);

  function resolveBuilder(index: number): VizBuilder {
    if (builderCache.has(index)) return builderCache.get(index)!;
    const step = steps[index]!;
    let builder =
      typeof step.builder === 'function' ? step.builder() : step.builder;
    // Attach step-specific autoSignals to the builder once at cache time.
    for (const sig of step.autoSignals ?? []) {
      builder = builder.autoSignal(sig);
    }
    builderCache.set(index, builder);
    return builder;
  }

  function activateStep(index: number): void {
    if (destroyed) return;

    // Tear down: stop animator, destroy the old scene, clear the container.
    if (currentController) {
      currentController.stop();
      currentController.destroy();
      currentController = null;
    }
    container.innerHTML = '';

    currentIndex = index;
    isReady = false;
    const generation = ++activationGeneration;
    const step = steps[index]!;

    onStepChange?.(index, step);
    if (stepBarEl) updateStepBar(stepBarEl, index, steps);

    const mc = resolveBuilder(index).mount(container);
    currentController = mc;

    const nonLooping = (step.autoSignals ?? []).filter((s) => !s.loop);

    if (nonLooping.length === 0) {
      // No blocking signals — fire onReady on the next microtask so that the
      // mount DOM is fully flushed before the caller enables buttons etc.
      Promise.resolve().then(() => {
        if (generation !== activationGeneration || destroyed) return;
        isReady = true;
        onReady?.();
        if (step.autoAdvance ?? false) setTimeout(() => ctrl.next(), 50);
      });
      return;
    }

    let completedCount = 0;
    for (const sig of nonLooping) {
      mc.onSignalComplete(sig.id, () => {
        if (generation !== activationGeneration || destroyed) return;
        completedCount += 1;
        if (completedCount >= nonLooping.length) {
          isReady = true;
          onReady?.();
          if (step.autoAdvance ?? false) setTimeout(() => ctrl.next(), 50);
        }
      });
    }
  }

  const ctrl: StepController = {
    next() {
      if (destroyed || currentIndex >= steps.length - 1) return;
      activateStep(currentIndex + 1);
    },
    prev() {
      if (destroyed || currentIndex <= 0) return;
      activateStep(currentIndex - 1);
    },
    goTo(index: number) {
      if (destroyed) return;
      if (index < 0 || index >= steps.length) {
        throw new RangeError(
          `step index ${index} out of range (0..${steps.length - 1})`
        );
      }
      activateStep(index);
    },
    reset() {
      if (destroyed) return;
      activateStep(0);
    },
    get currentIndex() {
      return currentIndex;
    },
    get totalSteps() {
      return steps.length;
    },
    get isReady() {
      return isReady;
    },
    pause() {
      if (!destroyed) currentController?.pause();
    },
    resume() {
      if (!destroyed) currentController?.resume();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      activationGeneration++;
      currentController?.stop();
      currentController?.destroy();
      currentController = null;
      container.innerHTML = '';
      stepBarEl?.remove();
      stepBarEl = null;
    },
  };

  activateStep(0);

  return ctrl;
}

// ---------------------------------------------------------------------------
// Spec-driven path
// ---------------------------------------------------------------------------

function buildStepDefsFromSpec(baseSpec: VizSpec): StepDef[] {
  const stepSpecs = baseSpec.steps ?? [];

  return stepSpecs.map((stepSpec: VizStepSpec): StepDef => {
    // All step signals are non-looping: they run once per step activation.
    const autoSignals: AutoSignalSpec[] = (stepSpec.signals ?? []).map((s) => ({
      ...s,
      loop: false,
    }));

    const builder = (): VizBuilder => {
      const highlightIds = new Set(stepSpec.highlight ?? []);

      // Dim nodes that are not in the highlight set.
      const nodes = baseSpec.nodes.map((n) => {
        if (!highlightIds.size || highlightIds.has(n.id)) return n;
        return { ...n, opacity: (n.opacity ?? 1) * 0.3 };
      });

      const overlays = [
        ...(baseSpec.overlays ?? []),
        ...(stepSpec.overlays ?? []),
      ];

      return fromSpec({
        ...baseSpec,
        nodes,
        overlays: overlays.length > 0 ? overlays : undefined,
        // Each step scene is a fresh standalone scene — strip top-level
        // autoSignals and steps so they don't bleed into the step scene.
        autoSignals: undefined,
        steps: undefined,
      });
    };

    return {
      label: stepSpec.label,
      autoSignals,
      autoAdvance: stepSpec.autoAdvance,
      builder,
    };
  });
}

/**
 * Create a {@link StepController} directly from a {@link VizSpec} with a
 * `steps` array. Each `VizStepSpec` entry becomes one step, inheriting the
 * base scene (nodes + edges + overlays) and applying per-step highlights,
 * additional overlays, and signal animations.
 *
 * @example
 * ```ts
 * import { createStepControllerFromSpec } from 'vizcraft';
 *
 * const ctrl = createStepControllerFromSpec(
 *   {
 *     view: { width: 900, height: 360 },
 *     nodes: [...],
 *     edges: [...],
 *     steps: [
 *       { label: 'Step 1', signals: [{ id: 'req', chain: ['a', 'b'], durationPerHop: 800 }] },
 *       { label: 'Step 2', highlight: ['b', 'c'], signals: [{ id: 'fwd', chain: ['b', 'c'], durationPerHop: 800 }] },
 *     ],
 *   },
 *   document.getElementById('canvas')!,
 *   { onReady: () => (nextBtn.disabled = false) }
 * );
 *
 * nextBtn.addEventListener('click', () => ctrl.next());
 * ```
 */
export function createStepControllerFromSpec(
  spec: VizSpec,
  container: HTMLElement,
  opts?: Omit<StepControllerOptions, 'container' | 'steps'>
): StepController {
  const steps = buildStepDefsFromSpec(spec);
  if (steps.length === 0) {
    throw new Error(
      'createStepControllerFromSpec: spec.steps must be non-empty'
    );
  }
  return createStepController({ container, steps, ...opts });
}
