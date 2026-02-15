import { OVERLAY_RUNTIME_DIRTY } from '../types';
import type { VizScene, VizNode, VizEdge, VizOverlaySpec } from '../types';
import type { AnimationHostAdapter, RegistrableAdapter } from './adapter';
import { createRegistryAdapter, KindHandle } from './registryAdapter';

// @todo: This does not feel too generalizable; consider how to make this more adaptable
// There are too many hardcoded properties and things specific to VizCraft here.
// What happens when we want to animate other things, like overlays, or other properties?
export interface ExtensibleAdapter {
  register(
    kind: string,
    prop: string,
    handlers: {
      get?: (el: unknown) => number | undefined;
      set?: (el: unknown, v: number) => void;
    }
  ): void;
}

export function createVizCraftAdapter(
  scene: VizScene,
  requestRender: () => void
): AnimationHostAdapter & RegistrableAdapter {
  const nodesById = new Map(scene.nodes.map((n) => [n.id, n]));
  const edgesById = new Map(scene.edges.map((e) => [e.id, e]));
  const overlays = scene.overlays ?? [];
  const overlaysByKey = new Map<string, VizOverlaySpec>();
  for (const spec of overlays) {
    const key = spec.key ?? spec.id;
    overlaysByKey.set(key, spec);
  }

  const adapter = createRegistryAdapter({
    flush: requestRender,
  }) as AnimationHostAdapter &
    RegistrableAdapter & {
      kind(
        kindName: string,
        resolver?: (id: string) => unknown | undefined
      ): {
        prop(
          propName: string,
          handlers: {
            get?: (el: unknown) => number | undefined;
            set?: (el: unknown, v: number) => void;
          }
        ): KindHandle;
      };
    };

  // register node/edge target resolvers and props using ergonomic handles
  const node = adapter.kind('node', (id) => nodesById.get(id));
  const edge = adapter.kind('edge', (id) => edgesById.get(id));
  const overlay = adapter.kind('overlay', (key) => overlaysByKey.get(key));

  node
    .prop('x', {
      get: (el) => {
        const n = el as VizNode;
        return n.runtime?.x ?? n.pos.x;
      },
      set: (el, v: number) => {
        const n = el as VizNode;
        n.runtime = n.runtime ?? {};
        n.runtime.x = v;
      },
    })
    .prop('y', {
      get: (el) => {
        const n = el as VizNode;
        return n.runtime?.y ?? n.pos.y;
      },
      set: (el, v: number) => {
        const n = el as VizNode;
        n.runtime = n.runtime ?? {};
        n.runtime.y = v;
      },
    })
    .prop('opacity', {
      get: (el) => {
        const n = el as VizNode;
        return n.runtime?.opacity ?? n.style?.opacity ?? 1;
      },
      set: (el, v: number) => {
        const n = el as VizNode;
        n.runtime = n.runtime ?? {};
        n.runtime.opacity = v;
      },
    })
    .prop('scale', {
      get: (el) => (el as VizNode).runtime?.scale ?? 1,
      set: (el, v: number) => {
        const n = el as VizNode;
        n.runtime = n.runtime ?? {};
        n.runtime.scale = v;
      },
    })
    .prop('rotation', {
      get: (el) => (el as VizNode).runtime?.rotation,
      set: (el, v: number) => {
        const n = el as VizNode;
        n.runtime = n.runtime ?? {};
        n.runtime.rotation = v;
      },
    });

  edge
    .prop('opacity', {
      get: (el) => (el as VizEdge).runtime?.opacity ?? 1,
      set: (el, v: number) => {
        const e = el as VizEdge;
        e.runtime = e.runtime ?? {};
        e.runtime.opacity = v;
      },
    })
    .prop('strokeDashoffset', {
      get: (el) => (el as VizEdge).runtime?.strokeDashoffset,
      set: (el, v: number) => {
        const e = el as VizEdge;
        e.runtime = e.runtime ?? {};
        e.runtime.strokeDashoffset = v;
      },
    });

  // Overlay params: allow animating arbitrary numeric fields on `spec.params`.
  //
  // This intentionally uses a generic reader/writer so users can animate
  // custom overlays without needing adapter extensions.
  const overlayParamReader = (
    el: unknown,
    prop: string
  ): number | undefined => {
    const spec = el as VizOverlaySpec<Record<string, unknown>>;
    const params = spec.params;
    const v = params?.[prop];
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  };

  const overlayParamWriter = (
    el: unknown,
    prop: string,
    value: number
  ): void => {
    const spec = el as VizOverlaySpec<unknown>;
    const existing = spec.params;
    const params: Record<string, unknown> =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? (existing as Record<string, unknown>)
        : {};
    params[prop] = value;

    // Ensure we keep reference stable in case params was undefined or non-object.
    (spec as VizOverlaySpec<Record<string, unknown>>).params = params;

    // Mark dirty so patchRuntime can avoid re-rendering unaffected overlays.
    (spec as unknown as Record<symbol, unknown>)[OVERLAY_RUNTIME_DIRTY] = true;
  };

  const resolveOverlayFromTarget = (
    target: unknown
  ): VizOverlaySpec<unknown> | undefined => {
    const t = String(target);
    if (!t.startsWith('overlay:')) return undefined;
    const key = t.slice('overlay:'.length);
    return overlaysByKey.get(key);
  };

  // Register core overlay props we know are numeric today.
  // Users can still register more via adapter extensions if they prefer explicitness.
  overlay.prop('progress', {
    get: (el) => overlayParamReader(el, 'progress'),
    set: (el, v) => overlayParamWriter(el, 'progress', v),
  });

  // Make overlays fully generic: any numeric `spec.params[prop]` is animatable.
  //
  // `createRegistryAdapter` requires per-prop registration; for overlays we provide
  // a fallback so custom overlays don't need adapter extensions.
  const baseGet = adapter.get;
  const baseSet = adapter.set;

  return {
    ...adapter,
    get(target, prop) {
      const v = baseGet(target, prop);
      if (v !== undefined) return v;
      const spec = resolveOverlayFromTarget(target);
      if (!spec) return undefined;
      return overlayParamReader(spec, String(prop));
    },
    set(target, prop, value) {
      baseSet(target, prop, value);
      const spec = resolveOverlayFromTarget(target);
      if (!spec) return;
      overlayParamWriter(spec, String(prop), value);
    },
  };
}
