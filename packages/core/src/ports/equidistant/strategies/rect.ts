import type { Vec2 } from '../../../types';
import type { PerimeterStrategy } from '../types';
import { polygonStrategy } from '../utils';

function rectVertices(w: number, h: number): Vec2[] {
  const hw = w / 2;
  const hh = h / 2;
  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
}

export const rectStrategy: PerimeterStrategy<'rect'> = polygonStrategy(
  'rect',
  8,
  (s) => rectVertices(s.w, s.h)
);
