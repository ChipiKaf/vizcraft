import type { AnimationHostAdapter, PropReader, PropWriter } from './adapter';
import type { AnimationTarget, AnimProperty } from './spec';

type TargetResolver = (id: string) => unknown | undefined;
export type KindHandle = {
  prop(
    propName: string,
    handlers: { get?: PropReader; set?: PropWriter }
  ): KindHandle;
};

export function createRegistryAdapter(opts: { flush?: () => void }) {
  const { flush } = opts;

  const targetResolvers: Record<string, TargetResolver> = {};
  const kindHandles: Record<string, KindHandle> = {};
  const readersByKind: Record<string, Record<string, PropReader>> = {};
  const writersByKind: Record<string, Record<string, PropWriter>> = {};

  function registerTargetKind(kind: string, resolver: TargetResolver) {
    targetResolvers[kind] = resolver;
  }

  function register(
    kind: string,
    prop: string,
    handlers: { get?: PropReader; set?: PropWriter }
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

  function kind(kindName: string, resolver?: TargetResolver): KindHandle {
    const existingResolver = targetResolvers[kindName];
    if (existingResolver) {
      if (resolver && resolver !== existingResolver) {
        throw new Error(
          `Animation adapter: kind "${kindName}" already registered with a different resolver`
        );
      }
      // return existing handle if present, otherwise create one lazily
      if (kindHandles[kindName]) return kindHandles[kindName];
      const lazyHandle: KindHandle = {
        prop(
          propName: string,
          handlers: { get?: PropReader; set?: PropWriter }
        ) {
          register(kindName, propName, handlers);
          return lazyHandle;
        },
      };
      kindHandles[kindName] = lazyHandle;
      return lazyHandle;
    }

    if (!resolver) {
      throw new Error(
        `Animation adapter: kind "${kindName}" is not registered yet`
      );
    }

    // register resolver and create handle
    registerTargetKind(kindName, resolver);

    const handle: KindHandle = {
      prop(propName: string, handlers: { get?: PropReader; set?: PropWriter }) {
        register(kindName, propName, handlers);
        return handle;
      },
    };

    kindHandles[kindName] = handle;
    return handle;
  }

  function resolve(
    target: AnimationTarget
  ): { kind: string; el: unknown } | undefined {
    const idx = String(target).indexOf(':');
    if (idx === -1) return undefined;
    const kind = String(target).slice(0, idx);
    const id = String(target).slice(idx + 1);
    const r = targetResolvers[kind];
    if (!r) return undefined;
    const el = r(id);
    if (el === undefined) return undefined;
    return { kind, el };
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

  return {
    get,
    set,
    flush,
    kind,
  } as AnimationHostAdapter & {
    kind(kindName: string, resolver?: TargetResolver): KindHandle;
  };
}
