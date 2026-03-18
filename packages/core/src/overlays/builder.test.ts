import { describe, it, expect } from 'vitest';
import { OverlayBuilder, buildOverlaySpecs } from './builder';

describe('OverlayBuilder', () => {
  it('starts with an empty spec list', () => {
    const builder = new OverlayBuilder();
    expect(builder.build()).toEqual([]);
  });

  it('adds a single overlay spec', () => {
    const builder = new OverlayBuilder();
    builder.add('rect', { x: 0, y: 0, w: 100, h: 50 });
    const specs = builder.build();
    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject({
      id: 'rect',
      params: { x: 0, y: 0, w: 100, h: 50 },
    });
  });

  it('chains add calls and returns this', () => {
    const builder = new OverlayBuilder();
    const result = builder
      .add('rect', { x: 0, y: 0, w: 10, h: 10 })
      .add('circle', { x: 50, y: 50, r: 25 });
    expect(result).toBe(builder);
    expect(builder.build()).toHaveLength(2);
  });

  it('preserves explicit key from options', () => {
    const builder = new OverlayBuilder();
    builder.add('rect', { x: 0, y: 0, w: 10, h: 10 }, { key: 'my-rect' });
    expect(builder.build()[0]?.key).toBe('my-rect');
  });

  it('preserves className from options', () => {
    const builder = new OverlayBuilder();
    builder.add('rect', { x: 0, y: 0, w: 10, h: 10 }, { className: 'hl' });
    expect(builder.build()[0]?.className).toBe('hl');
  });

  describe('auto-key collision handling', () => {
    it('does not auto-key the first overlay of a given id', () => {
      const builder = new OverlayBuilder();
      builder.add('rect', { x: 0, y: 0, w: 10, h: 10 });
      expect(builder.build()[0]?.key).toBeUndefined();
    });

    it('auto-generates keys for duplicate unkeyed ids', () => {
      const builder = new OverlayBuilder();
      builder.add('rect', { x: 0, y: 0, w: 10, h: 10 });
      builder.add('rect', { x: 20, y: 0, w: 10, h: 10 });
      builder.add('rect', { x: 40, y: 0, w: 10, h: 10 });
      const specs = builder.build();
      expect(specs[0]?.key).toBeUndefined(); // first: no key
      expect(specs[1]?.key).toBe('rect#1'); // second: auto-keyed
      expect(specs[2]?.key).toBe('rect#2'); // third: auto-keyed
    });

    it('does not auto-key overlays that already have explicit keys', () => {
      const builder = new OverlayBuilder();
      builder.add('rect', { x: 0, y: 0, w: 10, h: 10 }, { key: 'a' });
      builder.add('rect', { x: 0, y: 0, w: 10, h: 10 }, { key: 'b' });
      const specs = builder.build();
      expect(specs[0]?.key).toBe('a');
      expect(specs[1]?.key).toBe('b');
    });

    it('different ids do not collide with each other', () => {
      const builder = new OverlayBuilder();
      builder.add('rect', { x: 0, y: 0, w: 10, h: 10 });
      builder.add('circle', { x: 0, y: 0, r: 5 });
      const specs = builder.build();
      expect(specs[0]?.key).toBeUndefined();
      expect(specs[1]?.key).toBeUndefined();
    });
  });

  describe('remove', () => {
    it('removes overlay by unkeyed id', () => {
      const builder = new OverlayBuilder();
      builder.add('rect', { x: 0, y: 0, w: 10, h: 10 });
      builder.add('circle', { x: 0, y: 0, r: 5 });
      builder.remove('rect');
      const specs = builder.build();
      expect(specs).toHaveLength(1);
      expect(specs[0]?.id).toBe('circle');
    });

    it('removes overlay by explicit key', () => {
      const builder = new OverlayBuilder();
      builder.add('rect', { x: 0, y: 0, w: 10, h: 10 }, { key: 'my-rect' });
      builder.add('circle', { x: 0, y: 0, r: 5 });
      builder.remove('my-rect');
      const specs = builder.build();
      expect(specs).toHaveLength(1);
      expect(specs[0]?.id).toBe('circle');
    });

    it('removes all matching unkeyed overlays with same id', () => {
      const builder = new OverlayBuilder();
      builder.add('rect', { x: 0, y: 0, w: 10, h: 10 });
      builder.add('rect', { x: 20, y: 0, w: 10, h: 10 }); // auto-keyed
      builder.add('circle', { x: 0, y: 0, r: 5 });
      // Only the first rect is unkeyed — remove by id removes only unkeyed matches
      builder.remove('rect');
      const specs = builder.build();
      // The auto-keyed rect (key='rect#1') and circle remain
      expect(specs).toHaveLength(2);
    });

    it('is a no-op when nothing matches', () => {
      const builder = new OverlayBuilder();
      builder.add('rect', { x: 0, y: 0, w: 10, h: 10 });
      builder.remove('nonexistent');
      expect(builder.build()).toHaveLength(1);
    });

    it('returns this for chaining', () => {
      const builder = new OverlayBuilder();
      expect(builder.remove('anything')).toBe(builder);
    });
  });

  describe('clear', () => {
    it('removes all specs', () => {
      const builder = new OverlayBuilder();
      builder.add('rect', { x: 0, y: 0, w: 10, h: 10 });
      builder.add('circle', { x: 0, y: 0, r: 5 });
      builder.clear();
      expect(builder.build()).toEqual([]);
    });

    it('resets key counters so auto-keying restarts', () => {
      const builder = new OverlayBuilder();
      builder.add('rect', { x: 0, y: 0, w: 10, h: 10 });
      builder.add('rect', { x: 0, y: 0, w: 10, h: 10 }); // auto-keyed rect#1
      builder.clear();
      builder.add('rect', { x: 0, y: 0, w: 10, h: 10 });
      builder.add('rect', { x: 0, y: 0, w: 10, h: 10 }); // should be rect#1 again
      const specs = builder.build();
      expect(specs[1]?.key).toBe('rect#1');
    });

    it('returns this for chaining', () => {
      const builder = new OverlayBuilder();
      expect(builder.clear()).toBe(builder);
    });
  });

  describe('build', () => {
    it('returns a shallow copy (mutations do not leak)', () => {
      const builder = new OverlayBuilder();
      builder.add('rect', { x: 0, y: 0, w: 10, h: 10 });
      const a = builder.build();
      const b = builder.build();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe('convenience methods', () => {
    it('rect() delegates to add with id "rect"', () => {
      const builder = new OverlayBuilder();
      builder.rect({ x: 1, y: 2, w: 3, h: 4 });
      const specs = builder.build();
      expect(specs).toHaveLength(1);
      expect(specs[0]?.id).toBe('rect');
      expect(specs[0]?.params).toEqual({ x: 1, y: 2, w: 3, h: 4 });
    });

    it('circle() delegates to add with id "circle"', () => {
      const builder = new OverlayBuilder();
      builder.circle({ x: 10, y: 20, r: 30 });
      const specs = builder.build();
      expect(specs[0]?.id).toBe('circle');
      expect(specs[0]?.params).toEqual({ x: 10, y: 20, r: 30 });
    });

    it('text() delegates to add with id "text"', () => {
      const builder = new OverlayBuilder();
      builder.text({ x: 0, y: 0, text: 'hello' });
      const specs = builder.build();
      expect(specs[0]?.id).toBe('text');
      expect(specs[0]?.params.text).toBe('hello');
    });

    it('convenience methods pass through options', () => {
      const builder = new OverlayBuilder();
      builder.rect(
        { x: 0, y: 0, w: 10, h: 10 },
        { key: 'k1', className: 'cls' }
      );
      const spec = builder.build()[0];
      expect(spec?.key).toBe('k1');
      expect(spec?.className).toBe('cls');
    });
  });

  describe('group', () => {
    it('builds children via callback and nests them in params', () => {
      const builder = new OverlayBuilder();
      builder.group({ x: 10, y: 20 }, (child) => {
        child.rect({ x: 0, y: 0, w: 5, h: 5 });
        child.circle({ x: 0, y: 0, r: 3 });
      });
      const specs = builder.build();
      expect(specs).toHaveLength(1);
      expect(specs[0]?.id).toBe('group');
      expect(specs[0]?.params.children).toHaveLength(2);
      expect(specs[0]?.params.children[0].id).toBe('rect');
      expect(specs[0]?.params.children[1].id).toBe('circle');
    });

    it('passes options (key, className) through', () => {
      const builder = new OverlayBuilder();
      builder.group({ x: 0, y: 0 }, () => {}, {
        key: 'grp',
        className: 'my-group',
      });
      const spec = builder.build()[0];
      expect(spec?.key).toBe('grp');
      expect(spec?.className).toBe('my-group');
    });

    it('works with empty callback', () => {
      const builder = new OverlayBuilder();
      builder.group({ x: 0, y: 0 }, () => {});
      expect(builder.build()[0]?.params.children).toEqual([]);
    });
  });
});

describe('buildOverlaySpecs', () => {
  it('creates builder, executes callback, and returns specs', () => {
    const specs = buildOverlaySpecs((overlay) => {
      overlay.rect({ x: 0, y: 0, w: 100, h: 50 });
      overlay.circle({ x: 50, y: 50, r: 25 });
    });
    expect(specs).toHaveLength(2);
    expect(specs[0]?.id).toBe('rect');
    expect(specs[1]?.id).toBe('circle');
  });

  it('returns empty array for no-op callback', () => {
    const specs = buildOverlaySpecs(() => {});
    expect(specs).toEqual([]);
  });
});
