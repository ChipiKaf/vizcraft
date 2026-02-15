export type AnimationTarget =
  | (`node:${string}` | `edge:${string}` | `overlay:${string}`)
  | (string & {});

export type CoreAnimProperty =
  | 'x'
  | 'y'
  | 'opacity'
  | 'scale'
  | 'rotation'
  | 'strokeDashoffset';

export type AnimProperty = CoreAnimProperty | (string & {});

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
