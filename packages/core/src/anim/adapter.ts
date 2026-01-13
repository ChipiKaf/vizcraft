import type { AnimationTarget, AnimProperty } from './spec';

export interface AnimationHostAdapter {
  get(target: AnimationTarget, prop: AnimProperty): number | undefined;
  set(target: AnimationTarget, prop: AnimProperty, value: number): void;

  // called after set()s for a frame (lets host patch DOM efficiently later)
  flush?: () => void;
}
