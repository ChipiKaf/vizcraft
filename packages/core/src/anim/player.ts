import type { AnimationHostAdapter } from './adapter';
import type {
  AnimationSpec,
  TweenSpec,
  AnimationTarget,
  AnimProperty,
  Ease,
} from './spec';

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
  let tweens: InternalTween[] = [];
  let total = 0;

  let timeMs = 0;
  let playing = false;
  let rafId: number | null = null;
  let lastFrameTime = 0;
  let captured = false;

  function buildInternal(s: AnimationSpec) {
    const list: InternalTween[] = s.tweens.map((t) => {
      const start = t.delay ?? 0;
      const end = start + t.duration;
      return Object.assign({}, t, { start, end, _from: t.from ?? 0 });
    });
    const dur = list.reduce((mx, t) => Math.max(mx, t.end), 0);
    return { list, dur } as { list: InternalTween[]; dur: number };
  }

  function captureFromsIfNeeded() {
    if (captured || !spec) return;
    for (const t of tweens) {
      if (t.from !== undefined) {
        t._from = t.from as number;
        continue;
      }
      const got = adapter.get(
        t.target as AnimationTarget,
        t.property as AnimProperty
      );
      t._from = typeof got === 'number' ? got : 0;
    }
    captured = true;
  }

  function applyAt(ms: number) {
    // apply in-order; later tweens override earlier ones (last-wins)
    for (const t of tweens) {
      const local = ms - t.start;
      let value: number;
      if (local <= 0) {
        value = t._from;
      } else if (local >= t.duration) {
        value = t.to;
      } else {
        const p = clamp(local / t.duration, 0, 1);
        const fn = easingFns[(t.easing as Ease) ?? 'linear'];
        const eased = fn(p);
        value = t._from + (t.to - t._from) * eased;
      }
      adapter.set(
        t.target as AnimationTarget,
        t.property as AnimProperty,
        value
      );
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
      tweens = built.list;
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
