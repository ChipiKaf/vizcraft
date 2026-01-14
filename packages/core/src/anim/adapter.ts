import type { AnimationTarget, AnimProperty } from './spec';

export type PropReader = (el: unknown) => number | undefined;
export type PropWriter = (el: unknown, value: number) => void;

export interface PropHandlers {
  get?: PropReader;
  set?: PropWriter;
}

export interface AnimationHostAdapter {
  get(target: AnimationTarget, prop: AnimProperty): number | undefined;
  set(target: AnimationTarget, prop: AnimProperty, value: number): void;

  // called after set()s for a frame (lets host patch DOM efficiently later)
  flush?: () => void;

  // optional registration API so hosts can extend supported kinds/properties
  register?: (kind: string, prop: string, handlers: PropHandlers) => void;
}
