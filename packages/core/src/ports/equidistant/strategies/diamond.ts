import type { Vec2 } from '../../../types';
import type { PerimeterStrategy } from '../types';
import { polygonStrategy } from '../utils';

function diamondVertices(w: number, h: number): Vec2[] {
  const hw = w / 2;
  const hh = h / 2;
  return [
    { x: 0, y: -hh },
    { x: hw, y: 0 },
    { x: 0, y: hh },
    { x: -hw, y: 0 },
  ];
}

const DIAMOND_SIDES = [
  'top-right',
  'bottom-right',
  'bottom-left',
  'top-left',
] as const;

export const diamondStrategy: PerimeterStrategy<'diamond'> = polygonStrategy(
  'diamond',
  4,
  (s) => diamondVertices(s.w, s.h),
  () => DIAMOND_SIDES
);
