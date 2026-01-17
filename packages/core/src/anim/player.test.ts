import { describe, it, expect } from 'vitest';
import { createPlayer } from './player';
import type { AnimationSpec } from './spec';

describe('anim/player', () => {
  it('chains sequential tweens on the same property', () => {
    const state = new Map<string, number>([['node:a|x', 120]]);

    const adapter = {
      get(target: string, prop: string) {
        return state.get(`${target}|${prop}`);
      },
      set(target: string, prop: string, value: number) {
        state.set(`${target}|${prop}`, value);
      },
      flush() {
        // no-op
      },
    };

    const spec: AnimationSpec = {
      version: 'viz-anim/1',
      tweens: [
        {
          kind: 'tween',
          target: 'node:a',
          property: 'x',
          to: 320,
          duration: 1200,
          delay: 0,
          easing: 'linear',
        },
        {
          kind: 'tween',
          target: 'node:a',
          property: 'x',
          to: 120,
          duration: 1200,
          delay: 1800,
          easing: 'linear',
        },
      ],
    };

    const player = createPlayer(adapter);
    player.load(spec);

    player.seek(600);
    // Halfway from 120 -> 320
    expect(state.get('node:a|x')).toBeCloseTo(220, 5);

    player.seek(2400);
    // Halfway from 320 -> 120 (1200ms into the second tween)
    expect(state.get('node:a|x')).toBeCloseTo(220, 5);
  });
});
