import type { Vec2 } from '../../../types';
import type { PerimeterStrategy } from '../types';
import { polygonStrategy } from '../utils';

function crossVertices(size: number, barWidth: number): Vec2[] {
  const hs = size / 2;
  const bw = barWidth / 2;
  return [
    { x: -bw, y: -hs },
    { x: bw, y: -hs },
    { x: bw, y: -bw },
    { x: hs, y: -bw },
    { x: hs, y: bw },
    { x: bw, y: bw },
    { x: bw, y: hs },
    { x: -bw, y: hs },
    { x: -bw, y: bw },
    { x: -hs, y: bw },
    { x: -hs, y: -bw },
    { x: -bw, y: -bw },
  ];
}

export const crossStrategy: PerimeterStrategy<'cross'> = polygonStrategy(
  'cross',
  12,
  (s) => crossVertices(s.size, s.barWidth ?? Math.round(s.size / 3))
);
