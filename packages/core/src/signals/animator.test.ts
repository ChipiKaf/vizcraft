// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InternalAnimator } from './animator';
import type { PatchSignalSpec } from '../types';
import type { AutoSignalSpec } from '../spec';

// NOTE: performance.now() is stubbed via vi.stubGlobal so both test code and
// the animator share the same deterministic clock. No vi.useFakeTimers() is
// used here because Vitest also fakes requestAnimationFrame, which conflicts
// with the manual rAF-queue mocks in these tests.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSpec(overrides?: Partial<AutoSignalSpec>): AutoSignalSpec {
  return {
    id: 'sig',
    chain: ['a', 'b', 'c'],
    durationPerHop: 100,
    ...overrides,
  };
}

type PatchCall = PatchSignalSpec[];

// Use arrays (mutable reference types) to avoid stale-getter issues after
// destructuring.  `patchCalls` and `clearCalls` are pushed into directly.
function makeCallbacks() {
  const patchCalls: PatchCall[] = [];
  const clearCalls: number[] = [];
  const patch = (signals: PatchSignalSpec[]) => {
    patchCalls.push([...signals]);
  };
  const clear = () => {
    clearCalls.push(clearCalls.length);
  };
  return { patchCalls, clearCalls, patch, clear };
}

/**
 * Drain the rAF queue, advancing fakeNow by stepMs before each tick.
 * Stops when `until()` returns true or maxSteps is exceeded (safety cap).
 */
function drainRaf(
  rafQueue: FrameRequestCallback[],
  fakeNow: { value: number },
  stepMs: number,
  until: () => boolean,
  maxSteps = 500
): void {
  let steps = 0;
  while (rafQueue.length > 0 && !until() && steps < maxSteps) {
    fakeNow.value += stepMs;
    const tick = rafQueue.shift()!;
    tick(fakeNow.value);
    steps++;
  }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('InternalAnimator', () => {
  // Shared fake clock reset before each test.
  const fakeNow = { value: 1000 };

  beforeEach(() => {
    fakeNow.value = 1000;
    // Stub performance.now so the animator and test code use the same clock.
    vi.stubGlobal('performance', { now: () => fakeNow.value });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ── construction ──────────────────────────────────────────────────────────

  it('starts a rAF loop on construction', () => {
    const rafSpy = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockReturnValue(1);
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
    const { patch, clear } = makeCallbacks();

    const anim = new InternalAnimator([makeSpec()], patch, clear);
    expect(rafSpy).toHaveBeenCalled();
    anim.stop();
  });

  // ── patchSignals ticks ────────────────────────────────────────────────────

  it('calls patchSignals on each rAF tick with advancing progress', () => {
    const { patchCalls, patch, clear } = makeCallbacks();
    // 2 hops x 200ms/hop; at 100ms elapsed, rawProgress = 100/200 = 0.5
    const spec = makeSpec({ durationPerHop: 200 });

    const rafQueue: FrameRequestCallback[] = [];
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});

    // fakeNow.value = 1000 so state.startTime = 1000 on construction
    new InternalAnimator([spec], patch, clear);

    // Advance 100ms then tick
    fakeNow.value = 1100;
    rafQueue.shift()!(fakeNow.value);

    expect(patchCalls.length).toBe(1);
    const call = patchCalls[0]!;
    expect(call[0]!.key).toBe('sig');
    expect(call[0]!.progress).toBeCloseTo(0.5, 1);
    expect(call[0]!.chain).toEqual([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ]);
  });

  // ── pause / resume ────────────────────────────────────────────────────────

  it('pause() stops scheduling new rAF frames', () => {
    const { patch, clear } = makeCallbacks();
    const rafSpy = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockReturnValue(1);
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});

    const anim = new InternalAnimator([makeSpec()], patch, clear);
    const callsBeforePause = rafSpy.mock.calls.length;

    anim.pause();
    expect(rafSpy.mock.calls.length).toBe(callsBeforePause);
    anim.stop();
  });

  it('resume() after pause() reschedules rAF', () => {
    const { patch, clear } = makeCallbacks();
    let raf = 0;
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(
      () => ++raf
    );
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});

    const anim = new InternalAnimator([makeSpec()], patch, clear);
    const rafAfterStart = raf;

    anim.pause();
    expect(raf).toBe(rafAfterStart); // no new rAF while paused

    anim.resume();
    expect(raf).toBeGreaterThan(rafAfterStart);
    anim.stop();
  });

  // ── stop ──────────────────────────────────────────────────────────────────

  it('stop() calls clearSignals and cancels rAF', () => {
    const { clearCalls, patch, clear } = makeCallbacks();
    vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(42);
    const cancelSpy = vi
      .spyOn(globalThis, 'cancelAnimationFrame')
      .mockImplementation(() => {});

    const anim = new InternalAnimator([makeSpec()], patch, clear);
    anim.stop();

    expect(clearCalls.length).toBe(1);
    expect(cancelSpy).toHaveBeenCalled();
  });

  it('stop() makes subsequent pause/resume a no-op', () => {
    const { patch, clear } = makeCallbacks();
    let raf = 0;
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(
      () => ++raf
    );
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});

    const anim = new InternalAnimator([makeSpec()], patch, clear);
    anim.stop();
    const rafAfterStop = raf;

    anim.pause();
    anim.resume();
    expect(raf).toBe(rafAfterStop);
  });

  // ── restart ───────────────────────────────────────────────────────────────

  it('restart() clears signals and reschedules rAF from progress=0', () => {
    const { patchCalls, clearCalls, patch, clear } = makeCallbacks();

    const rafQueue: FrameRequestCallback[] = [];
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});

    const anim = new InternalAnimator(
      [makeSpec({ durationPerHop: 200 })],
      patch,
      clear
    );

    // Tick once at 100ms
    fakeNow.value = 1100;
    rafQueue.shift()!(fakeNow.value);
    expect(patchCalls[0]?.[0]?.progress).toBeGreaterThan(0);

    const clearsBefore = clearCalls.length;
    anim.restart();

    expect(clearCalls.length).toBeGreaterThan(clearsBefore);
    expect(rafQueue.length).toBeGreaterThan(0);
    anim.stop();
  });

  // ── setSpeed ──────────────────────────────────────────────────────────────

  it('setSpeed(2) doubles animation speed', () => {
    const { patchCalls, patch, clear } = makeCallbacks();
    // 2 hops x 200ms/hop; at 2x speed 100ms wall-time = 200ms scaled
    const spec = makeSpec({ durationPerHop: 200 });

    const rafQueue: FrameRequestCallback[] = [];
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});

    const anim = new InternalAnimator([spec], patch, clear);
    anim.setSpeed(2);

    // Wall-clock +100ms; at 2x speed: scaled_elapsed = 200ms, rawProgress = 200/200 = 1.0
    fakeNow.value = 1100;
    rafQueue.shift()!(fakeNow.value);

    const progress = patchCalls[0]?.[0]?.progress ?? -1;
    expect(progress).toBeGreaterThanOrEqual(1.0);
    anim.stop();
  });

  // ── onSignalComplete ──────────────────────────────────────────────────────

  it('onSignalComplete fires when signal finishes', () => {
    const { patch, clear } = makeCallbacks();
    // 2 hops x 100ms/hop = 200ms total; needs elapsed >= 200ms to complete
    const spec = makeSpec({ durationPerHop: 100, loop: false });

    const rafQueue: FrameRequestCallback[] = [];
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});

    const anim = new InternalAnimator([spec], patch, clear);
    const completedCb = vi.fn();
    anim.onSignalComplete('sig', completedCb);

    drainRaf(rafQueue, fakeNow, 50, () => completedCb.mock.calls.length > 0);

    expect(completedCb).toHaveBeenCalled();
    anim.stop();
  });

  it('onSignalComplete returns unsubscribe that stops future calls', () => {
    const { patch, clear } = makeCallbacks();
    const spec = makeSpec({ durationPerHop: 50, loop: true });

    const rafQueue: FrameRequestCallback[] = [];
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});

    const anim = new InternalAnimator([spec], patch, clear);
    const cb = vi.fn();
    const unsub = anim.onSignalComplete('sig', cb);

    // Drain until first completion
    drainRaf(rafQueue, fakeNow, 25, () => cb.mock.calls.length >= 1);
    const callsBefore = cb.mock.calls.length;
    expect(callsBefore).toBeGreaterThanOrEqual(1);

    unsub();
    anim.stop();

    // After unsubscribe and stop, no further calls should happen
    expect(cb.mock.calls.length).toBe(callsBefore);
  });

  // ── loop ──────────────────────────────────────────────────────────────────

  it('loop:true reschedules the animator after completion', () => {
    const { patch, clear } = makeCallbacks();
    const spec = makeSpec({ durationPerHop: 50, loop: true });

    const rafQueue: FrameRequestCallback[] = [];
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});

    const anim = new InternalAnimator([spec], patch, clear);
    let loops = 0;
    anim.onSignalComplete('sig', () => loops++);

    drainRaf(rafQueue, fakeNow, 25, () => loops >= 2);

    expect(loops).toBeGreaterThanOrEqual(2);
    anim.stop();
  });

  // ── builder integration ───────────────────────────────────────────────────

  it('builder.mount() always returns a MountController', async () => {
    vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});

    const { viz } = await import('../builder');
    const container = document.createElement('div');
    const controller = viz()
      .node('n', { rect: { w: 40, h: 20 } })
      .mount(container);

    expect(controller).toBeDefined();
    expect(typeof controller.patchSignals).toBe('function');
    expect(typeof controller.clearSignals).toBe('function');
    expect(typeof controller.pause).toBe('function');
    expect(typeof controller.resume).toBe('function');
    expect(typeof controller.stop).toBe('function');
    expect(typeof controller.restart).toBe('function');
    expect(typeof controller.setSpeed).toBe('function');
    expect(typeof controller.onSignalComplete).toBe('function');
    expect(controller.panZoom).toBeUndefined();
    controller.destroy();
  });

  it('patchSignals injects signal elements into the SVG', async () => {
    vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});

    const { viz } = await import('../builder');
    const container = document.createElement('div');
    const controller = viz()
      .view(400, 200)
      .node('a', { rect: { w: 40, h: 20 }, at: { x: 100, y: 100 } })
      .node('b', { rect: { w: 40, h: 20 }, at: { x: 300, y: 100 } })
      .mount(container);

    controller.patchSignals([
      { key: 'test-sig', from: 'a', to: 'b', progress: 0.5 },
    ]);

    const sigEl = container.querySelector('[data-patch-signal-key="test-sig"]');
    expect(sigEl).toBeTruthy();
    expect(sigEl!.querySelector('.viz-signal')).toBeTruthy();
    controller.destroy();
  });

  it('clearSignals removes all patched signal elements', async () => {
    vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});

    const { viz } = await import('../builder');
    const container = document.createElement('div');
    const controller = viz()
      .view(400, 200)
      .node('a', { rect: { w: 40, h: 20 }, at: { x: 100, y: 100 } })
      .node('b', { rect: { w: 40, h: 20 }, at: { x: 300, y: 100 } })
      .mount(container);

    controller.patchSignals([{ key: 's1', from: 'a', to: 'b', progress: 0.3 }]);
    controller.patchSignals([{ key: 's2', from: 'a', to: 'b', progress: 0.7 }]);

    const layer = container.querySelector('[data-viz-layer="patch-signals"]')!;
    expect(layer.childElementCount).toBe(2);

    controller.clearSignals();
    expect(layer.childElementCount).toBe(0);
    controller.destroy();
  });

  it('autoSignal() wires the internal animator on mount', async () => {
    vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(99);
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});

    const { viz } = await import('../builder');
    const container = document.createElement('div');
    const controller = viz()
      .view(400, 200)
      .node('a', { rect: { w: 40, h: 20 }, at: { x: 100, y: 100 } })
      .node('b', { rect: { w: 40, h: 20 }, at: { x: 300, y: 100 } })
      .autoSignal({
        id: 'loop',
        chain: ['a', 'b'],
        loop: true,
        durationPerHop: 800,
      })
      .mount(container);

    expect(() => controller.pause()).not.toThrow();
    expect(() => controller.resume()).not.toThrow();
    expect(() => controller.stop()).not.toThrow();
    controller.destroy();
  });

  it('fromSpec autoSignals create an animator on mount', async () => {
    vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});

    const { fromSpec } = await import('../fromSpec');
    const container = document.createElement('div');
    const controller = fromSpec({
      view: { width: 400, height: 200 },
      nodes: [
        { id: 'x', x: 100, y: 100 },
        { id: 'y', x: 300, y: 100 },
      ],
      autoSignals: [
        { id: 'flow', chain: ['x', 'y'], loop: true, durationPerHop: 600 },
      ],
    }).mount(container);

    expect(typeof controller.pause).toBe('function');
    expect(typeof controller.stop).toBe('function');
    controller.stop();
    controller.destroy();
  });
});
