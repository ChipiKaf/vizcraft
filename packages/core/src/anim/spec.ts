export type AnimationTarget = `node:${string}` | `edge:${string}->${string}`;

import type { VizRuntimeNodeProps, VizRuntimeEdgeProps } from '../types';

export type AnimProperty =
  | keyof VizRuntimeNodeProps
  | keyof VizRuntimeEdgeProps;

export type Ease = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

export interface TweenSpec {
  kind: 'tween';
  target: AnimationTarget;
  property: AnimProperty;
  to: number;
  duration: number; // ms
  delay?: number; // ms
  easing?: Ease;
  from?: number;
}

export interface AnimationSpec {
  version: 'viz-anim/1';
  tweens: TweenSpec[];
}
