import type { Vec2 } from '../../types';
import type { PerimeterStrategy } from '../types';
import { polygonStrategy } from '../utils';

function starVertices(points: number, outerR: number, innerR: number): Vec2[] {
  const verts: Vec2[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (Math.PI * i) / points - Math.PI / 2;
    verts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  return verts;
}

export const starStrategy: PerimeterStrategy<'star'> = polygonStrategy(
  'star',
  (s) => s.points * 2,
  (s) =>
    starVertices(s.points, s.outerR, s.innerR ?? Math.round(s.outerR * 0.4))
);
