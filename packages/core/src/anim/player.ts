import type { AnimationHostAdapter } from './adapter';
import type { AnimationSpec, TweenSpec, Ease } from './spec';

export interface AnimationController {
  play(): void;
  pause(): void;
  seek(ms: number): void;
  stop(): void;
  isPlaying(): boolean;
  time(): number;
  duration(): number;
}

type InternalTween = TweenSpec & {
  start: number;
  end: number;
  _from: number;
  _i: number;
};

type Track = {
  key: string;
  target: InternalTween['target'];
  property: InternalTween['property'];
  base: number;
  tweens: InternalTween[];
};

function clamp(v: number, a = 0, b = 1) {
  return Math.max(a, Math.min(b, v));
}

const easingFns: Record<Ease, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
};

export function createPlayer(adapter: AnimationHostAdapter) {
  let spec: AnimationSpec | null = null;
  let tracks: Track[] = [];
  let total = 0;

  let timeMs = 0;
  let playing = false;
  let rafId: number | null = null;
  let lastFrameTime = 0;
  let captured = false;

  function buildInternal(s: AnimationSpec) {
    const list: InternalTween[] = s.tweens.map((t, i) => {
      const start = t.delay ?? 0;
      const end = start + t.duration;
      return Object.assign({}, t, { start, end, _from: t.from ?? 0, _i: i });
    });

    const byKey = new Map<string, Track>();
    for (const t of list) {
      const key = `${String(t.target)}|${String(t.property)}`;
      let track = byKey.get(key);
      if (!track) {
        track = {
          key,
          target: t.target,
          property: t.property,
          base: 0,
          tweens: [],
        };
        byKey.set(key, track);
      }
      track.tweens.push(t);
    }

    const trackList = Array.from(byKey.values());
    for (const tr of trackList) {
      tr.tweens.sort((a, b) =>
        a.start !== b.start ? a.start - b.start : a._i - b._i
      );
    }

    const dur = list.reduce((mx, t) => Math.max(mx, t.end), 0);
    return {
      tracks: trackList,
      dur,
    } as { tracks: Track[]; dur: number };
  }

  function captureFromsIfNeeded() {
    if (captured || !spec) return;

    // Capture base values once per track and chain sequential tweens.
    for (const tr of tracks) {
      const got = adapter.get(tr.target, tr.property);
      tr.base = typeof got === 'number' ? got : 0;

      let prior: InternalTween | null = null;
      for (const t of tr.tweens) {
        if (t.from !== undefined) {
          t._from = t.from as number;
        } else if (prior && prior.end <= t.start) {
          // Common case: sequential tweens on the same prop should chain.
          t._from = prior.to;
        } else {
          // Fallback: capture from the base value.
          t._from = tr.base;
        }
        prior = t;
      }
    }
    captured = true;
  }

  function applyAt(ms: number) {
    // Evaluate one active tween per target+property.
    // This avoids "future" tweens overwriting current motion.
    for (const tr of tracks) {
      const list = tr.tweens;

      // Find the last tween that has started.
      let lo = 0;
      let hi = list.length - 1;
      let idx = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (list[mid]!.start <= ms) {
          idx = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }

      let value: number;
      if (idx === -1) {
        value = tr.base;
      } else {
        const t = list[idx]!;
        const local = ms - t.start;
        if (local <= 0) {
          value = t._from;
        } else if (t.duration <= 0) {
          value = t.to;
        } else if (local >= t.duration) {
          value = t.to;
        } else {
          const p = clamp(local / t.duration, 0, 1);
          const fn = easingFns[(t.easing as Ease) ?? 'linear'];
          const eased = fn(p);
          value = t._from + (t.to - t._from) * eased;
        }
      }

      adapter.set(tr.target, tr.property, value);
    }
    adapter.flush?.();
  }

  function tick(now: number) {
    if (!playing) return;
    const delta = now - lastFrameTime;
    lastFrameTime = now;
    timeMs = Math.min(total, timeMs + delta);
    applyAt(timeMs);
    if (timeMs >= total) {
      playing = false;
      rafId = null;
      return;
    }
    rafId = globalThis.requestAnimationFrame(tick);
  }

  const controller: AnimationController & {
    load(spec: AnimationSpec): AnimationController;
  } = {
    load(s: AnimationSpec) {
      spec = s;
      const built = buildInternal(s);
      tracks = built.tracks;
      total = built.dur;
      timeMs = 0;
      captured = false;
      if (rafId != null) {
        globalThis.cancelAnimationFrame(rafId);
        rafId = null;
      }
      playing = false;
      // apply initial state
      captureFromsIfNeeded();
      applyAt(0);
      return controller;
    },

    play() {
      if (!spec) return;
      captureFromsIfNeeded();
      if (playing) return;
      playing = true;
      lastFrameTime = performance.now();
      rafId = globalThis.requestAnimationFrame(tick);
    },

    pause() {
      if (!playing) return;
      playing = false;
      if (rafId != null) {
        globalThis.cancelAnimationFrame(rafId);
        rafId = null;
      }
    },

    seek(ms: number) {
      if (!spec) return;
      captureFromsIfNeeded();
      timeMs = clamp(ms, 0, total);
      applyAt(timeMs);
    },

    stop() {
      if (!spec) return;
      if (rafId != null) {
        globalThis.cancelAnimationFrame(rafId);
        rafId = null;
      }
      playing = false;
      timeMs = 0;
      // restore to from state (froms are captured or defined)
      captureFromsIfNeeded();
      applyAt(0);
    },

    isPlaying() {
      return playing;
    },

    time() {
      return timeMs;
    },

    duration() {
      return total;
    },
  };

  return controller;
}
