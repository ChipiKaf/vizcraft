import { describe, it, expect } from 'vitest';
import { viz } from './builder';
import { hitTest, hitTestRect, nearestPort, edgeDistance } from './hitTest';

describe('Hit Testing Module', () => {
  describe('hitTest (Point)', () => {
    it('returns null for an empty scene', () => {
      const scene = viz().build();
      expect(hitTest(scene, { x: 0, y: 0 })).toBeNull();
    });

    it('hits a node within its bounds', () => {
      const scene = viz()
        .node('a', { at: { x: 100, y: 100 }, rect: { w: 50, h: 50 } })
        .build();

      expect(hitTest(scene, { x: 100, y: 100 })).toEqual({
        type: 'node',
        id: 'a',
      });
      expect(hitTest(scene, { x: 120, y: 120 })).toEqual({
        type: 'node',
        id: 'a',
      });
      expect(hitTest(scene, { x: 150, y: 150 })).toBeNull();
    });

    it('respects z-index (array order)', () => {
      // b is built after a, so b should be "on top"
      const scene = viz()
        .node('a', { at: { x: 100, y: 100 }, rect: { w: 100, h: 100 } })
        .node('b', { at: { x: 100, y: 100 }, rect: { w: 50, h: 50 } })
        .build();

      expect(hitTest(scene, { x: 100, y: 100 })).toEqual({
        type: 'node',
        id: 'b',
      });
    });

    it('hits a specific port', () => {
      const scene = viz()
        .node('a', {
          at: { x: 100, y: 100 },
          rect: { w: 50, h: 50 },
          ports: [{ id: 'out', offset: { x: 25, y: 0 } }],
        })
        .build();

      // Hit exactly the port (125, 100)
      expect(hitTest(scene, { x: 125, y: 100 })).toEqual({
        type: 'port',
        nodeId: 'a',
        portId: 'out',
        position: { x: 125, y: 100 },
      });
      // Hit the node but not the port
      expect(hitTest(scene, { x: 100, y: 100 })).toEqual({
        type: 'node',
        id: 'a',
      });
    });

    it('hits an edge', () => {
      const scene = viz()
        .node('a', { at: { x: 0, y: 0 }, rect: { w: 20, h: 20 } })
        .node('b', { at: { x: 100, y: 0 }, rect: { w: 20, h: 20 } })
        .edge('a', 'b', { id: 'e1' })
        .build();

      expect(hitTest(scene, { x: 50, y: 0 })).toEqual({
        type: 'edge',
        id: 'e1',
      });
      // Should miss with default tolerance
      expect(hitTest(scene, { x: 50, y: 15 })).toBeNull();
      // Should hit with high tolerance
      expect(hitTest(scene, { x: 50, y: 15 }, { edgeTolerance: 20 })).toEqual({
        type: 'edge',
        id: 'e1',
      });
    });
  });

  describe('hitTestRect', () => {
    it('finds nodes entirely inside the rect', () => {
      const scene = viz()
        .node('a', { at: { x: 50, y: 50 }, rect: { w: 20, h: 20 } })
        .node('b', { at: { x: 150, y: 50 }, rect: { w: 20, h: 20 } })
        .build();

      const hits = hitTestRect(scene, { x: 10, y: 10, w: 90, h: 90 });
      expect(hits).toHaveLength(1);
      expect(hits[0]).toEqual({ type: 'node', id: 'a' });
    });

    it('finds edges interacting with the rect', () => {
      const scene = viz()
        .node('a', { at: { x: 50, y: 50 }, rect: { w: 20, h: 20 } })
        .node('b', { at: { x: 150, y: 50 }, rect: { w: 20, h: 20 } })
        .edge('a', 'b', { id: 'e1' })
        .build();

      const hits = hitTestRect(scene, { x: 90, y: 40, w: 20, h: 20 }); // Middle of edge
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.find((h) => h.id === 'e1')).toBeTruthy();
    });
  });

  describe('nearestPort', () => {
    it('finds the nearest port when multiple exist', () => {
      const scene = viz()
        .node('a', {
          at: { x: 100, y: 100 },
          rect: { w: 100, h: 50 },
          ports: [
            { id: 'left', offset: { x: -50, y: 0 } },
            { id: 'right', offset: { x: 50, y: 0 } },
          ],
        })
        .build();

      const result = nearestPort(
        scene,
        { x: 160, y: 100 },
        { maxDistance: 50 }
      );
      expect(result).not.toBeNull();
      expect(result?.portId).toBe('right');

      // Out of maxDistance
      const distantResult = nearestPort(
        scene,
        { x: 300, y: 100 },
        { maxDistance: 50 }
      );
      expect(distantResult).toBeNull();
    });
  });

  describe('edgeDistance', () => {
    it('returns distance roughly matching geometric expectation for straight lines', () => {
      const scene = viz()
        .node('a', { at: { x: 20, y: 0 }, rect: { w: 10, h: 10 }, parent: '' })
        .node('b', { at: { x: 100, y: 0 }, rect: { w: 10, h: 10 }, parent: '' })
        .edge('a', 'b', { id: 'e1' })
        .build();

      const dist = edgeDistance(scene, 'e1', { x: 60, y: 10 });
      // Point (60, 10). Line is approx Y=0 from X=25 to X=95. Distance should be ~10.
      expect(dist).toBeGreaterThan(9);
      expect(dist).toBeLessThan(11);
    });
  });
});
