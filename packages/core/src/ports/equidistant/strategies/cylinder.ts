import type { Vec2 } from '../../../types';
import type { PerimeterStrategy } from '../types';
import { ARC_SAMPLES, sampledCurveStrategy } from '../utils';

/** Sample the visible cylinder outline. Matches `cylinderGeometry` in shapes.ts. */
function sampleCylinder(
  w: number,
  h: number,
  arcHeight: number | undefined
): Vec2[] {
  const rx = w / 2;
  const ry = arcHeight ?? Math.round(h * 0.15);
  const hh = h / 2;

  const arcSamples = Math.ceil(ARC_SAMPLES / 2);
  const sideSamples = Math.max(4, Math.ceil(arcSamples / 4));

  const pts: Vec2[] = [];

  // Top cap upper arc: (rx, -hh) → (0, -hh-ry) → (-rx, -hh)
  for (let i = 0; i <= arcSamples; i++) {
    const phi = (Math.PI * i) / arcSamples;
    pts.push({ x: rx * Math.cos(phi), y: -hh - ry * Math.sin(phi) });
  }

  // Left side: (-rx, -hh) → (-rx, hh)
  for (let i = 1; i <= sideSamples; i++) {
    pts.push({ x: -rx, y: -hh + (i / sideSamples) * h });
  }

  // Bottom arc lower half: (-rx, hh) → (0, hh+ry) → (rx, hh)
  for (let i = 1; i <= arcSamples; i++) {
    const phi = (Math.PI * i) / arcSamples;
    pts.push({ x: -rx * Math.cos(phi), y: hh + ry * Math.sin(phi) });
  }

  // Right side: (rx, hh) → (rx, -hh)  (exclude last = start)
  for (let i = 1; i < sideSamples; i++) {
    pts.push({ x: rx, y: hh - (i / sideSamples) * h });
  }

  return pts;
}

export const cylinderStrategy: PerimeterStrategy<'cylinder'> =
  sampledCurveStrategy('cylinder', 10, (s) =>
    sampleCylinder(s.w, s.h, s.arcHeight)
  );
