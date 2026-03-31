import type { Vec2, VizEdge, VizNode } from '../types';
import { resolveEdgeGeometryFromData } from './resolveEdgeGeometry';

type MoveCommand = {
  type: 'M';
  to: Vec2;
};

type LineCommand = {
  type: 'L';
  from: Vec2;
  to: Vec2;
};

type QuadraticCommand = {
  type: 'Q';
  from: Vec2;
  control: Vec2;
  to: Vec2;
};

type CubicCommand = {
  type: 'C';
  from: Vec2;
  control1: Vec2;
  control2: Vec2;
  to: Vec2;
};

type PathCommand = MoveCommand | LineCommand | QuadraticCommand | CubicCommand;

type SamplePoint = {
  distance: number;
  point: Vec2;
};

type SegmentTable = {
  length: number;
  samples: SamplePoint[];
};

const PATH_TOKEN_RE = /[MLQC]|-?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/gi;
const CURVE_SAMPLE_STEPS = 24;

export function sampleEdgePathFromData(
  edge: VizEdge,
  nodesById: Map<string, VizNode>,
  progress: number
): Vec2 | null {
  const geometry = resolveEdgeGeometryFromData(edge, nodesById);
  if (!geometry) return null;

  return sampleSvgPathAt(geometry.d, progress);
}

function sampleSvgPathAt(d: string, progress: number): Vec2 | null {
  const commands = parsePathCommands(d);
  if (commands.length === 0) return null;

  const segments = commands
    .filter(
      (command): command is LineCommand | QuadraticCommand | CubicCommand => {
        return command.type !== 'M';
      }
    )
    .map((command) => buildSegmentTable(command));

  if (segments.length === 0) {
    const move = commands.find((command) => command.type === 'M');
    return move?.to ?? null;
  }

  const totalLength = segments.reduce(
    (sum, segment) => sum + segment.length,
    0
  );
  if (totalLength === 0) {
    return segments[0]?.samples[0]?.point ?? null;
  }

  const clampedProgress = clampProgress(progress);
  const targetDistance = totalLength * clampedProgress;

  let traversed = 0;
  for (const segment of segments) {
    if (traversed + segment.length >= targetDistance) {
      return sampleSegmentAtDistance(segment, targetDistance - traversed);
    }
    traversed += segment.length;
  }

  return segments[segments.length - 1]?.samples.at(-1)?.point ?? null;
}

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  return progress;
}

function parsePathCommands(d: string): PathCommand[] {
  const tokens = d.match(PATH_TOKEN_RE);
  if (!tokens || tokens.length === 0) return [];

  const commands: PathCommand[] = [];
  let cursor: Vec2 | null = null;
  let index = 0;

  while (index < tokens.length) {
    const token = tokens[index++];
    if (!token) return [];

    switch (token) {
      case 'M': {
        const point = readPoint(tokens, index);
        if (!point) return [];
        index += 2;
        cursor = point;
        commands.push({ type: 'M', to: point });
        break;
      }
      case 'L': {
        if (!cursor) return [];
        const point = readPoint(tokens, index);
        if (!point) return [];
        index += 2;
        commands.push({ type: 'L', from: cursor, to: point });
        cursor = point;
        break;
      }
      case 'Q': {
        if (!cursor) return [];
        const control = readPoint(tokens, index);
        const point = readPoint(tokens, index + 2);
        if (!control || !point) return [];
        index += 4;
        commands.push({ type: 'Q', from: cursor, control, to: point });
        cursor = point;
        break;
      }
      case 'C': {
        if (!cursor) return [];
        const control1 = readPoint(tokens, index);
        const control2 = readPoint(tokens, index + 2);
        const point = readPoint(tokens, index + 4);
        if (!control1 || !control2 || !point) return [];
        index += 6;
        commands.push({
          type: 'C',
          from: cursor,
          control1,
          control2,
          to: point,
        });
        cursor = point;
        break;
      }
      default:
        return [];
    }
  }

  return commands;
}

function readPoint(tokens: string[], index: number): Vec2 | null {
  const x = Number(tokens[index]);
  const y = Number(tokens[index + 1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function buildSegmentTable(
  command: LineCommand | QuadraticCommand | CubicCommand
): SegmentTable {
  switch (command.type) {
    case 'L':
      return buildSampleTable([command.from, command.to]);
    case 'Q':
      return buildCurveTable(CURVE_SAMPLE_STEPS, (t) =>
        quadraticAt(command.from, command.control, command.to, t)
      );
    case 'C':
      return buildCurveTable(CURVE_SAMPLE_STEPS, (t) =>
        cubicAt(command.from, command.control1, command.control2, command.to, t)
      );
  }
}

function buildCurveTable(
  steps: number,
  pointAt: (t: number) => Vec2
): SegmentTable {
  const samples: Vec2[] = [];
  for (let step = 0; step <= steps; step++) {
    samples.push(pointAt(step / steps));
  }

  return buildSampleTable(samples);
}

function buildSampleTable(points: Vec2[]): SegmentTable {
  if (points.length === 0) {
    return { length: 0, samples: [] };
  }

  const samples: SamplePoint[] = [{ distance: 0, point: points[0]! }];
  let distance = 0;

  for (let index = 1; index < points.length; index++) {
    distance += pointDistance(points[index - 1]!, points[index]!);
    samples.push({ distance, point: points[index]! });
  }

  return { length: distance, samples };
}

function sampleSegmentAtDistance(
  segment: SegmentTable,
  distance: number
): Vec2 {
  const first = segment.samples[0];
  const last = segment.samples.at(-1);

  if (!first) return { x: 0, y: 0 };
  if (!last || distance <= 0) return first.point;
  if (distance >= segment.length) return last.point;

  for (let index = 1; index < segment.samples.length; index++) {
    const previous = segment.samples[index - 1]!;
    const current = segment.samples[index]!;

    if (current.distance >= distance) {
      const segmentLength = current.distance - previous.distance;
      const ratio =
        segmentLength === 0
          ? 0
          : (distance - previous.distance) / segmentLength;
      return interpolatePoint(previous.point, current.point, ratio);
    }
  }

  return last.point;
}

function quadraticAt(start: Vec2, control: Vec2, end: Vec2, t: number): Vec2 {
  const oneMinusT = 1 - t;
  return {
    x:
      oneMinusT * oneMinusT * start.x +
      2 * oneMinusT * t * control.x +
      t * t * end.x,
    y:
      oneMinusT * oneMinusT * start.y +
      2 * oneMinusT * t * control.y +
      t * t * end.y,
  };
}

function cubicAt(
  start: Vec2,
  control1: Vec2,
  control2: Vec2,
  end: Vec2,
  t: number
): Vec2 {
  const oneMinusT = 1 - t;
  return {
    x:
      oneMinusT * oneMinusT * oneMinusT * start.x +
      3 * oneMinusT * oneMinusT * t * control1.x +
      3 * oneMinusT * t * t * control2.x +
      t * t * t * end.x,
    y:
      oneMinusT * oneMinusT * oneMinusT * start.y +
      3 * oneMinusT * oneMinusT * t * control1.y +
      3 * oneMinusT * t * t * control2.y +
      t * t * t * end.y,
  };
}

function pointDistance(from: Vec2, to: Vec2): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function interpolatePoint(from: Vec2, to: Vec2, ratio: number): Vec2 {
  return {
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio,
  };
}
