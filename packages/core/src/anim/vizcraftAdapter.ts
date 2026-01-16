import type { VizScene, VizNode, VizEdge } from '../types';
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

  return adapter;
}
