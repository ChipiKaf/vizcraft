import type { Vec2 } from '../../../types';
import type { PerimeterStrategy } from '../types';
import { polygonStrategy } from '../utils';

function hexagonVertices(r: number, orientation: 'pointy' | 'flat'): Vec2[] {
  const offset = orientation === 'pointy' ? -Math.PI / 2 : 0;
  const verts: Vec2[] = [];
  for (let i = 0; i < 6; i++) {
    const a = offset + (Math.PI / 3) * i;
    verts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  return verts;
}

function hexagonSideLabels(orientation: 'pointy' | 'flat'): readonly string[] {
  if (orientation === 'pointy') {
    return [
      'top-right',
      'right',
      'bottom-right',
      'bottom-left',
      'left',
      'top-left',
    ];
  }
  return [
    'bottom-right',
    'bottom',
    'bottom-left',
    'top-left',
    'top',
    'top-right',
  ];
}

export const hexagonStrategy: PerimeterStrategy<'hexagon'> = polygonStrategy(
  'hexagon',
  6,
  (s) => hexagonVertices(s.r, s.orientation ?? 'pointy'),
  (s) => hexagonSideLabels(s.orientation ?? 'pointy')
);
