import type { VizScene } from '../types';
import { createPlayer, type AnimationController } from './player';
import type { AnimationSpec } from './spec';
import { createVizCraftAdapter } from './vizcraftAdapter';

/**
 * A player that can be (re)loaded with specs.
 *
 * Note: `createPlayer()` returns a controller that also has `.load(...)`, but the
 * exported `AnimationController` interface does not include it.
 */
export type PlaybackController = AnimationController & {
  load(spec: AnimationSpec): AnimationController;
};

export function createScenePlayback(opts: {
  scene: VizScene;
  requestRender: () => void;
}): PlaybackController {
  const adapter = createVizCraftAdapter(opts.scene, opts.requestRender);
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
}): PlaybackController {
  const scene = opts.builder.build();
  const requestRender = () => opts.builder.patchRuntime(opts.container);
  return createScenePlayback({ scene, requestRender });
}

/**
 * Loads (and optionally auto-plays) a spec against a mounted builder.
 */
export function playAnimationSpec(opts: {
  builder: { build(): VizScene; patchRuntime(container: HTMLElement): void };
  container: HTMLElement;
  spec: AnimationSpec;
  autoPlay?: boolean;
}): PlaybackController {
  const controller = createBuilderPlayback({
    builder: opts.builder,
    container: opts.container,
  });

  controller.load(opts.spec);
  if (opts.autoPlay !== false) controller.play();

  return controller;
}
