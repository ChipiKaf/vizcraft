import type { Vec2 } from '../../types';
import type { PerimeterStrategy } from '../types';
import { polygonStrategy } from '../utils';

function parallelogramVertices(w: number, h: number, skew: number): Vec2[] {
  const hw = w / 2;
  const hh = h / 2;
  const half = skew / 2;
  return [
    { x: -hw + half, y: -hh },
    { x: hw + half, y: -hh },
    { x: hw - half, y: hh },
    { x: -hw - half, y: hh },
  ];
}

export const parallelogramStrategy: PerimeterStrategy<'parallelogram'> =
  polygonStrategy('parallelogram', 8, (s) =>
    parallelogramVertices(s.w, s.h, s.skew ?? Math.round(s.w * 0.2))
  );
