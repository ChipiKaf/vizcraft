import type { Vec2 } from '../../types';
import type { PerimeterStrategy } from '../types';
import { ARC_SAMPLES, sampledCurveStrategy } from '../utils';

function sampleEllipse(rx: number, ry: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= ARC_SAMPLES; i++) {
    const theta = (2 * Math.PI * i) / ARC_SAMPLES;
    pts.push({ x: rx * Math.cos(theta), y: ry * Math.sin(theta) });
  }
  return pts;
}

export const ellipseStrategy: PerimeterStrategy<'ellipse'> =
  sampledCurveStrategy('ellipse', 8, (s) => sampleEllipse(s.rx, s.ry));
