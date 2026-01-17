import type { VizScene } from '../types';
import { createPlayer, type AnimationController } from './player';
import type { AnimationSpec } from './spec';
import { createVizCraftAdapter } from './vizcraftAdapter';
import type { ExtendAdapter } from './extendAdapter';
import { getAdapterExtensions } from './specExtensions';

/**
 * A player that can be (re)loaded with specs.
 *
 * Note: `createPlayer()` returns a controller that also has `.load(...)`, but the
 * exported `AnimationController` interface does not include it.
 */
export type PlaybackController = AnimationController & {
  load(spec: AnimationSpec): AnimationController;
};

export type { ExtendAdapter };

export function createScenePlayback(opts: {
  scene: VizScene;
  requestRender: () => void;
  extendAdapter?: ExtendAdapter;
}): PlaybackController {
  const adapter = createVizCraftAdapter(opts.scene, opts.requestRender);
  opts.extendAdapter?.(adapter);
  return createPlayer(adapter) as PlaybackController;
}

/**
 * Convenience helper for the common "builder + mounted container" case.
 *
 * - Uses `builder.build()` once to get stable node/edge references for runtime updates.
 * - Uses `builder.patchRuntime(container)` as the render flush, so animations patch
 *   the existing SVG in-place (fast path).
 */
export function createBuilderPlayback(opts: {
  builder: { build(): VizScene; patchRuntime(container: HTMLElement): void };
  container: HTMLElement;
  extendAdapter?: ExtendAdapter;
}): PlaybackController {
  const scene = opts.builder.build();
  const requestRender = () => opts.builder.patchRuntime(opts.container);
  return createScenePlayback({
    scene,
    requestRender,
    extendAdapter: opts.extendAdapter,
  });
}

/**
 * Loads (and optionally auto-plays) a spec against a mounted builder.
 */
export function playAnimationSpec(opts: {
  builder: { build(): VizScene; patchRuntime(container: HTMLElement): void };
  container: HTMLElement;
  spec: AnimationSpec;
  autoPlay?: boolean;
  extendAdapter?: ExtendAdapter;
}): PlaybackController {
  const adapterExtensions = getAdapterExtensions(opts.spec);
  const extendAdapter: ExtendAdapter | undefined =
    adapterExtensions.length > 0 || opts.extendAdapter
      ? (adapter) => {
          for (const ext of adapterExtensions) ext(adapter);
          opts.extendAdapter?.(adapter);
        }
      : undefined;

  const controller = createBuilderPlayback({
    builder: opts.builder,
    container: opts.container,
    extendAdapter,
  });

  controller.load(opts.spec);
  if (opts.autoPlay !== false) controller.play();

  return controller;
}
