import type {
  AnimationSpec,
  AnimProperty,
  AnimationTarget,
  CoreAnimProperty,
  Ease,
  TweenSpec,
} from './spec';
import type { ExtendAdapter } from './extendAdapter';
import {
  ADAPTER_EXTENSIONS,
  type AnimationSpecWithAdapterExtensions,
} from './specExtensions';

export type TweenOptions = {
  duration: number; // ms
  easing?: Ease;
  /** Optional per-property starting values. If omitted, the player captures from runtime/base. */
  from?: Partial<Record<AnimProperty, number>>;
};

/**
 * Properties that VizCraft core knows how to animate by default.
 *
 * Note: `AnimationSpec` supports arbitrary string properties, but core adapters
 * only register these by default.
 */
export type CoreAnimatableProps = Partial<Record<CoreAnimProperty, number>>;

/**
 * A loose prop bag that still hints core properties in TS.
 *
 * Example: `{ x: 10, opacity: 0.5 }`.
 */
export type AnimatableProps = CoreAnimatableProps &
  Partial<Record<string, number>>;

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function toTarget(kind: 'node' | 'edge', id: string): AnimationTarget {
  return `${kind}:${id}` as AnimationTarget;
}

/**
 * Fluent, authoring API that compiles to a portable `AnimationSpec`.
 *
 * - Data only: no callbacks stored as animation state.
 * - Sequential by default via an internal cursor time.
 */
export class AnimationBuilder {
  private cursorMs = 0;
  private currentTarget: AnimationTarget | null = null;
  private readonly tweens: TweenSpec[] = [];
  private readonly adapterExtensions: ExtendAdapter[] = [];

  /**
   * Register custom animated properties for this spec.
   *
   * This avoids needing to thread an `extendAdapter` callback into playback helpers.
   */
  extendAdapter(cb: ExtendAdapter): this {
    this.adapterExtensions.push(cb);
    return this;
  }

  /** Select a node by id (compiles to target `node:<id>`). */
  node(id: string): this {
    this.currentTarget = toTarget('node', id);
    return this;
  }

  /**
   * Select an edge.
   *
   * - `edge('a->b')` (id form)
   * - `edge('a', 'b')` (convenience; compiles to `edge:a->b`)
   * - `edge('a', 'b', 'custom-id')` (explicit id; compiles to `edge:custom-id`)
   */
  edge(id: string): this;
  edge(from: string, to: string, id?: string): this;
  edge(a: string, b?: string, c?: string): this {
    const id = b === undefined ? a : (c ?? `${a}->${b}`);
    this.currentTarget = toTarget('edge', id);
    return this;
  }

  /**
   * Set the internal cursor time (ms). Next `.to(...)` uses this as its delay.
   */
  at(ms: number): this {
    this.cursorMs = Math.max(0, ms);
    return this;
  }

  /**
   * Advance the internal cursor time (ms) without adding tweens.
   */
  wait(ms: number): this {
    this.cursorMs = Math.max(0, this.cursorMs + Math.max(0, ms));
    return this;
  }

  /**
   * Tween properties on the current target.
   *
   * Emits one `TweenSpec` per property.
   */
  to(props: AnimatableProps, opts: TweenOptions): this {
    if (!this.currentTarget) {
      throw new Error(
        'AnimationBuilder.to(): no target selected (call node(...) or edge(...))'
      );
    }

    const duration = Math.max(0, opts.duration);
    const easing = opts.easing;
    const froms = opts.from;

    for (const [property, value] of Object.entries(props)) {
      if (!isNumber(value)) continue;

      const tween: TweenSpec = {
        kind: 'tween',
        target: this.currentTarget,
        property: property,
        to: value,
        duration,
        delay: this.cursorMs,
        easing,
      };

      const from = froms?.[property];
      if (isNumber(from)) tween.from = from;

      this.tweens.push(tween);
    }

    // Sequential by default.
    this.cursorMs += duration;
    return this;
  }

  build(): AnimationSpec {
    const spec: AnimationSpecWithAdapterExtensions = {
      version: 'viz-anim/1',
      tweens: [...this.tweens],
    };

    if (this.adapterExtensions.length > 0) {
      spec[ADAPTER_EXTENSIONS] = [...this.adapterExtensions];
    }

    return spec;
  }
}

/** Convenience helper for one-off compilation. */
export function buildAnimationSpec(
  cb: (anim: AnimationBuilder) => unknown
): AnimationSpec {
  const anim = new AnimationBuilder();
  cb(anim);
  return anim.build();
}
