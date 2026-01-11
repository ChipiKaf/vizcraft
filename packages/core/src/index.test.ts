import { describe, it, expect } from 'vitest';
import { viz } from './index';

describe('vizcraft core', () => {
  it('exports viz builder', () => {
    expect(viz).toBeDefined();
    expect(typeof viz).toBe('function');
  });

  it('creates a builder instance', () => {
    const builder = viz();
    expect(builder).toBeDefined();
    // Verify default viewbox
    const view = builder._getViewBox();
    expect(view).toEqual({ w: 800, h: 600 });
  });
});
