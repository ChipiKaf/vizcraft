export type AnimationTarget = `node:${string}` | `edge:${string}->${string}`;

export type AnimProperty =
  | 'x'
  | 'y'
  | 'opacity'
  | 'scale'
  | 'rotation'
  | 'strokeDashoffset';

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
