import type { PerimeterStrategy } from '../types';
import { RAD, portFromPoint } from '../utils';

function circleEquidistant(r: number, count: number) {
  const ports = [];
  for (let i = 0; i < count; i++) {
    const aDeg = (360 * i) / count;
    const aRad = aDeg * RAD;
    ports.push(
      portFromPoint(
        { x: r * Math.cos(aRad), y: r * Math.sin(aRad) },
        i,
        i / count
      )
    );
  }
  return ports;
}

export const circleStrategy: PerimeterStrategy<'circle'> = {
  kind: 'circle',
  defaultCount: 8,
  computePorts: (shape, count) => circleEquidistant(shape.r, count),
};
