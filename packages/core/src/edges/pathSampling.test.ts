import { describe, expect, it } from 'vitest';

import type { VizEdge, VizNode } from '../types';
import { sampleEdgePathFromData } from './pathSampling';

describe('sampleEdgePathFromData', () => {
  it('samples straight free-endpoint edges', () => {
    const edge: VizEdge = {
      id: 'straight',
      fromAt: { x: 0, y: 0 },
      toAt: { x: 100, y: 0 },
    };

    expect(sampleEdgePathFromData(edge, new Map(), 0.25)).toEqual({
      x: 25,
      y: 0,
    });
  });

  it('samples orthogonal routes by rendered length', () => {
    const edge: VizEdge = {
      id: 'orth',
      fromAt: { x: 0, y: 0 },
      toAt: { x: 100, y: 100 },
      routing: 'orthogonal',
    };

    const point = sampleEdgePathFromData(edge, new Map(), 0.5)!;

    expect(point.x).toBeCloseTo(50, 5);
    expect(point.y).toBeCloseTo(50, 5);
  });

  it('samples quadratic curved routes', () => {
    const edge: VizEdge = {
      id: 'curve',
      fromAt: { x: 0, y: 0 },
      toAt: { x: 100, y: 0 },
      routing: 'curved',
    };

    const point = sampleEdgePathFromData(edge, new Map(), 0.5)!;

    expect(point.x).toBeCloseTo(50, 1);
    expect(point.y).toBeGreaterThan(8);
    expect(point.y).toBeLessThan(12);
  });

  it('samples curved routes that pass through waypoints', () => {
    const edge: VizEdge = {
      id: 'curve-waypoints',
      fromAt: { x: 0, y: 0 },
      toAt: { x: 120, y: 0 },
      routing: 'curved',
      waypoints: [
        { x: 30, y: 60 },
        { x: 90, y: 60 },
      ],
    };

    const point = sampleEdgePathFromData(edge, new Map(), 0.5)!;

    expect(point.x).toBeGreaterThan(40);
    expect(point.x).toBeLessThan(80);
    expect(point.y).toBeGreaterThan(40);
  });

  it('samples self-loop routes', () => {
    const node: VizNode = {
      id: 'a',
      pos: { x: 100, y: 100 },
      shape: { kind: 'rect', w: 60, h: 60 },
    };
    const edge: VizEdge = {
      id: 'loop',
      from: 'a',
      to: 'a',
    };

    const point = sampleEdgePathFromData(edge, new Map([['a', node]]), 0.5)!;

    expect(point.x).toBeCloseTo(100, 0);
    expect(point.y).toBeLessThan(70);
  });
});
