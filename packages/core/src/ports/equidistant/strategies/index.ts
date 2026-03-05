import type { PerimeterStrategy } from '../types';
import { circleStrategy } from './circle';
import { ellipseStrategy } from './ellipse';
import { cylinderStrategy } from './cylinder';
import { rectStrategy } from './rect';
import { diamondStrategy } from './diamond';
import { hexagonStrategy } from './hexagon';
import { triangleStrategy } from './triangle';
import { parallelogramStrategy } from './parallelogram';
import { trapezoidStrategy } from './trapezoid';
import { starStrategy } from './star';
import { crossStrategy } from './cross';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const builtInStrategies: PerimeterStrategy<any>[] = [
  circleStrategy,
  ellipseStrategy,
  cylinderStrategy,
  rectStrategy,
  diamondStrategy,
  hexagonStrategy,
  triangleStrategy,
  parallelogramStrategy,
  trapezoidStrategy,
  starStrategy,
  crossStrategy,
];
