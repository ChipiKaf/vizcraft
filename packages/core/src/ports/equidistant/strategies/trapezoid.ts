import type { Vec2 } from '../../../types';
import type { PerimeterStrategy } from '../types';
import { polygonStrategy } from '../utils';

function trapezoidVertices(topW: number, bottomW: number, h: number): Vec2[] {
  const htw = topW / 2;
  const hbw = bottomW / 2;
  const hh = h / 2;
  return [
    { x: -htw, y: -hh },
    { x: htw, y: -hh },
    { x: hbw, y: hh },
    { x: -hbw, y: hh },
  ];
}

const TRAPEZOID_SIDES = ['top', 'right', 'bottom', 'left'] as const;

export const trapezoidStrategy: PerimeterStrategy<'trapezoid'> =
  polygonStrategy(
    'trapezoid',
    8,
    (s) => trapezoidVertices(s.topW, s.bottomW, s.h),
    () => TRAPEZOID_SIDES
  );
