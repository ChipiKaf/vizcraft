import type { Vec2 } from '../../../types';
import type { PerimeterStrategy } from '../types';
import { polygonStrategy } from '../utils';

function triangleVertices(
  w: number,
  h: number,
  direction: 'up' | 'down' | 'left' | 'right'
): Vec2[] {
  const hw = w / 2;
  const hh = h / 2;
  switch (direction) {
    case 'up':
      return [
        { x: 0, y: -hh },
        { x: hw, y: hh },
        { x: -hw, y: hh },
      ];
    case 'down':
      return [
        { x: 0, y: hh },
        { x: -hw, y: -hh },
        { x: hw, y: -hh },
      ];
    case 'left':
      return [
        { x: -hw, y: 0 },
        { x: hw, y: -hh },
        { x: hw, y: hh },
      ];
    case 'right':
      return [
        { x: hw, y: 0 },
        { x: -hw, y: hh },
        { x: -hw, y: -hh },
      ];
  }
}

function triangleSideLabels(
  direction: 'up' | 'down' | 'left' | 'right'
): readonly string[] {
  switch (direction) {
    case 'up':
      return ['right', 'bottom', 'left'];
    case 'down':
      return ['left', 'top', 'right'];
    case 'left':
      return ['top', 'right', 'bottom'];
    case 'right':
      return ['bottom', 'left', 'top'];
  }
}

export const triangleStrategy: PerimeterStrategy<'triangle'> = polygonStrategy(
  'triangle',
  6,
  (s) => triangleVertices(s.w, s.h, s.direction ?? 'up'),
  (s) => triangleSideLabels(s.direction ?? 'up')
);
