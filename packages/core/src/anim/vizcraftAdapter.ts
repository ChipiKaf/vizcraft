import type { VizScene, VizNode, VizEdge } from '../types';
import type { AnimationHostAdapter, RegistrableAdapter } from './adapter';
import type { AnimationTarget } from './spec';
import { createRegistryAdapter } from './registryAdapter';

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

  function resolve(target: AnimationTarget) {
    const [kind, id] = target.split(':') as [string, string];
    if (kind === 'node')
      return { kind: 'node', el: nodesById.get(id) as VizNode | undefined };
    if (kind === 'edge')
      return { kind: 'edge', el: edgesById.get(id) as VizEdge | undefined };
    return undefined;
  }

  const adapter = createRegistryAdapter({
    resolve: (t) => resolve(t) as { kind: string; el: unknown } | undefined,
    flush: requestRender,
  }) as AnimationHostAdapter & RegistrableAdapter;

  // register node readers/writers
  adapter.register('node', 'x', {
    get: (el) => {
      const n = el as VizNode;
      return n.runtime?.x ?? n.pos.x;
    },
    set: (el, v) => {
      const n = el as VizNode;
      n.runtime = n.runtime ?? {};
      n.runtime.x = v;
    },
  });
  adapter.register('node', 'y', {
    get: (el) => {
      const n = el as VizNode;
      return n.runtime?.y ?? n.pos.y;
    },
    set: (el, v) => {
      const n = el as VizNode;
      n.runtime = n.runtime ?? {};
      n.runtime.y = v;
    },
  });
  adapter.register('node', 'opacity', {
    get: (el) => {
      const n = el as VizNode;
      return n.runtime?.opacity ?? n.style?.opacity;
    },
    set: (el, v) => {
      const n = el as VizNode;
      n.runtime = n.runtime ?? {};
      n.runtime.opacity = v;
    },
  });
  adapter.register('node', 'scale', {
    get: (el) => (el as VizNode).runtime?.scale,
    set: (el, v) => {
      const n = el as VizNode;
      n.runtime = n.runtime ?? {};
      n.runtime.scale = v;
    },
  });
  adapter.register('node', 'rotation', {
    get: (el) => (el as VizNode).runtime?.rotation,
    set: (el, v) => {
      const n = el as VizNode;
      n.runtime = n.runtime ?? {};
      n.runtime.rotation = v;
    },
  });

  // register edge readers/writers
  adapter.register('edge', 'opacity', {
    get: (el) => (el as VizEdge).runtime?.opacity,
    set: (el, v) => {
      const e = el as VizEdge;
      e.runtime = e.runtime ?? {};
      e.runtime.opacity = v;
    },
  });
  adapter.register('edge', 'strokeDashoffset', {
    get: (el) => (el as VizEdge).runtime?.strokeDashoffset,
    set: (el, v) => {
      const e = el as VizEdge;
      e.runtime = e.runtime ?? {};
      e.runtime.strokeDashoffset = v;
    },
  });

  return adapter;
}
