import type { AutoSignalSpec } from '../spec';
import type { PatchSignalSpec } from '../types';

export type PatchSignalsCallback = (signals: PatchSignalSpec[]) => void;

type SignalState = {
  spec: AutoSignalSpec;

  /** ms per hop, resolved from durationPerHop or totalDuration. */
  msPerHop: number;

  /** rAF handle, or 0 when not scheduled. */
  rafId: number;

  /** setTimeout handle for loopDelay, or 0 when not pending. */
  loopDelayTimer: ReturnType<typeof setTimeout> | undefined;

  /** progress value at the moment pause() was called (0…N). */
  pausedProgress: number;

  /** performance.now() timestamp when animation (re)started. */
  startTime: number;

  /** progress value when this run started (0 on fresh start, pausedProgress on resume). */
  startProgress: number;

  /** Whether currently paused. */
  paused: boolean;
};

/**
 * Drives self-animating signals declared via {@link VizBuilder.autoSignal}.
 *
 * Owns one rAF-per-signal loop. Calls `patchSignals` every frame with updated
 * progress values. Auto-pauses on hidden tabs; resumes when visible again.
 */
export class InternalAnimator {
  private _states = new Map<string, SignalState>();
  private _speed = 1;
  private _stopped = false;
  private _subscribers = new Map<string, Set<() => void>>();
  private _patchSignals: PatchSignalsCallback;
  private _clearSignals: () => void;
  private _visibilityHandler: () => void;

  constructor(
    specs: AutoSignalSpec[],
    patchSignals: PatchSignalsCallback,
    clearSignals: () => void
  ) {
    this._patchSignals = patchSignals;
    this._clearSignals = clearSignals;

    for (const spec of specs) {
      const hops = spec.chain.length - 1;
      const msPerHop =
        spec.durationPerHop ??
        (spec.totalDuration != null
          ? spec.totalDuration / Math.max(1, hops)
          : 800);
      this._states.set(spec.id, {
        spec,
        msPerHop: Math.max(1, msPerHop),
        rafId: 0,
        loopDelayTimer: undefined,
        pausedProgress: 0,
        startTime: 0,
        startProgress: 0,
        paused: false,
      });
    }

    this._visibilityHandler = () => {
      if (typeof document === 'undefined') return;
      if (document.hidden) {
        this._pauseAll(/* userInitiated */ false);
      } else {
        this._resumeAll(/* userInitiated */ false);
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._visibilityHandler);
    }

    this._startAll();
  }

  // ── Public controls ────────────────────────────────────────────────────

  pause(): void {
    this._pauseAll(true);
  }

  resume(): void {
    this._resumeAll(true);
  }

  stop(): void {
    this._stopped = true;
    this._cancelAll();
    this._clearSignals();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
    }
  }

  restart(): void {
    this._stopped = false;
    this._cancelAll();
    this._clearSignals();
    for (const state of this._states.values()) {
      state.pausedProgress = 0;
      state.paused = false;
    }
    this._startAll();
  }

  setSpeed(factor: number): void {
    if (factor <= 0) return;

    // Snapshot current progress for all active signals before the speed change,
    // so the rAF start times recalculate correctly on the next frame.
    const now = performance.now();
    for (const state of this._states.values()) {
      if (!state.paused && state.rafId !== 0) {
        const elapsed = (now - state.startTime) * this._speed;
        state.pausedProgress = Math.min(
          state.startProgress + elapsed / state.msPerHop,
          state.spec.chain.length - 1
        );
        state.startProgress = state.pausedProgress;
        state.startTime = now;
      }
    }
    this._speed = factor;
  }

  onSignalComplete(id: string, cb: () => void): () => void {
    let subs = this._subscribers.get(id);
    if (!subs) {
      subs = new Set();
      this._subscribers.set(id, subs);
    }
    subs.add(cb);
    return () => {
      this._subscribers.get(id)?.delete(cb);
    };
  }

  // ── Internal helpers ───────────────────────────────────────────────────

  private _startAll(): void {
    for (const state of this._states.values()) {
      this._scheduleSignal(state, 0);
    }
  }

  private _cancelAll(): void {
    for (const state of this._states.values()) {
      if (state.rafId !== 0) {
        cancelAnimationFrame(state.rafId);
        state.rafId = 0;
      }
      if (state.loopDelayTimer !== undefined) {
        clearTimeout(state.loopDelayTimer);
        state.loopDelayTimer = undefined;
      }
    }
  }

  private _pauseAll(userInitiated: boolean): void {
    if (this._stopped) return;
    const now = performance.now();
    for (const state of this._states.values()) {
      if (state.paused) continue;
      if (state.rafId !== 0) {
        cancelAnimationFrame(state.rafId);
        state.rafId = 0;
        const elapsed = (now - state.startTime) * this._speed;
        state.pausedProgress = Math.min(
          state.startProgress + elapsed / state.msPerHop,
          state.spec.chain.length - 1
        );
      }
      if (userInitiated) state.paused = true;
    }
  }

  private _resumeAll(userInitiated: boolean): void {
    if (this._stopped) return;
    for (const state of this._states.values()) {
      if (userInitiated) {
        if (!state.paused) continue;
        state.paused = false;
      }
      if (state.rafId === 0 && state.loopDelayTimer === undefined) {
        this._scheduleSignal(state, state.pausedProgress);
      }
    }
  }

  /**
   * Schedule the rAF tick for a single signal starting from `fromProgress`.
   */
  private _scheduleSignal(state: SignalState, fromProgress: number): void {
    if (this._stopped || state.paused) return;

    state.startProgress = fromProgress;
    state.startTime = performance.now();
    state.pausedProgress = fromProgress;

    const tick = (now: number): void => {
      if (this._stopped || state.paused) {
        state.rafId = 0;
        return;
      }

      const elapsed = (now - state.startTime) * this._speed;
      const hops = state.spec.chain.length - 1;
      const rawProgress = state.startProgress + elapsed / state.msPerHop;
      const progress = Math.min(rawProgress, hops);

      // Build PatchSignalSpec from chain
      const patch = this._buildPatch(state.spec, progress);
      this._patchSignals([patch]);

      if (rawProgress < hops) {
        state.pausedProgress = progress;
        state.rafId = requestAnimationFrame(tick);
        return;
      }

      // Traversal complete
      state.rafId = 0;
      this._fireComplete(state.spec.id);

      if (state.spec.loop) {
        const delay = state.spec.loopDelay ?? 0;
        if (delay > 0) {
          if (!state.spec.keepFinal) {
            // Briefly remove the dot during the delay
            this._patchSignals([this._buildPatch(state.spec, hops)]);
          }
          state.loopDelayTimer = setTimeout(() => {
            state.loopDelayTimer = undefined;
            if (!this._stopped && !state.paused) {
              this._scheduleSignal(state, 0);
            }
          }, delay);
        } else {
          this._scheduleSignal(state, 0);
        }
      } else if (state.spec.keepFinal) {
        // Park at final node — keep dot rendered at progress=hops.
        // (already rendered above; no further scheduling)
      } else {
        // Remove the dot
        this._patchSignals([this._buildPatch(state.spec, hops)]);
      }
    };

    state.rafId = requestAnimationFrame(tick);
  }

  private _buildPatch(spec: AutoSignalSpec, progress: number): PatchSignalSpec {
    const hops = spec.chain.length - 1;
    const chain = [];
    for (let i = 0; i < hops; i++) {
      chain.push({ from: spec.chain[i]!, to: spec.chain[i + 1]! });
    }
    return {
      key: spec.id,
      chain,
      progress,
      magnitude: spec.magnitude,
      color: spec.color,
      glowColor: spec.glowColor,
    };
  }

  private _fireComplete(id: string): void {
    const subs = this._subscribers.get(id);
    if (!subs) return;
    for (const cb of subs) cb();
  }
}
