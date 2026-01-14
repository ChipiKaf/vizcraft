import type { AnimationHostAdapter, PropReader, PropWriter } from './adapter';
import type { AnimationTarget, AnimProperty } from './spec';

type ResolveFn = (
  target: AnimationTarget
) => { kind: string; el: unknown } | undefined;

export function createRegistryAdapter(opts: {
  resolve: ResolveFn;
  flush?: () => void;
}): AnimationHostAdapter & {
  register(
    kind: string,
    prop: string,
    handlers: {
      get?: PropReader;
      set?: PropWriter;
    }
  ): void;
} {
  const { resolve, flush } = opts;

  const readersByKind: Record<string, Record<string, PropReader>> = {};
  const writersByKind: Record<string, Record<string, PropWriter>> = {};

  function register(
    kind: string,
    prop: string,
    handlers: {
      get?: PropReader;
      set?: PropWriter;
    }
  ) {
    if (handlers.get) {
      readersByKind[kind] = readersByKind[kind] ?? {};
      readersByKind[kind][prop] = handlers.get;
    }
    if (handlers.set) {
      writersByKind[kind] = writersByKind[kind] ?? {};
      writersByKind[kind][prop] = handlers.set;
    }
  }

  function get(
    target: AnimationTarget,
    prop: AnimProperty
  ): number | undefined {
    const resolved = resolve(target);
    if (!resolved) return undefined;
    const { kind, el } = resolved;
    const readers = readersByKind[kind] ?? {};
    const reader = readers[String(prop)];
    if (reader) return reader(el);
    return undefined;
  }

  function set(
    target: AnimationTarget,
    prop: AnimProperty,
    value: number
  ): void {
    const resolved = resolve(target);
    if (!resolved) return;
    const { kind, el } = resolved;
    const writers = writersByKind[kind] ?? {};
    const writer = writers[String(prop)];
    if (writer) writer(el, value);
  }

  return { get, set, flush, register } as AnimationHostAdapter & {
    register(
      kind: string,
      prop: string,
      handlers: {
        get?: PropReader;
        set?: PropWriter;
      }
    ): void;
  };
}
