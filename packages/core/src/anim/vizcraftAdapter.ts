import type {
  VizScene,
  VizNode,
  VizEdge,
  VizRuntimeNodeProps,
  VizRuntimeEdgeProps,
} from '../types';
import type { AnimationHostAdapter } from './adapter';
import type { AnimationTarget } from './spec';

export function createVizCraftAdapter(
  scene: VizScene,
  requestRender: () => void
): AnimationHostAdapter {
  const nodesById = new Map(scene.nodes.map((n) => [n.id, n]));
  const edgesById = new Map(scene.edges.map((e) => [e.id, e]));

  function resolve(target: AnimationTarget): VizNode | VizEdge | undefined {
    const [kind, id] = target.split(':') as [string, string];
    if (kind === 'node') return nodesById.get(id) as VizNode | undefined;
    return edgesById.get(id) as VizEdge | undefined;
  }

  return {
    get(target, prop) {
      const el = resolve(target);
      if (!el) return undefined;

      if (target.startsWith('node:')) {
        const node = el as VizNode;
        const r: VizRuntimeNodeProps = node.runtime ?? {};
        if (prop === 'x') return r.x ?? node.pos.x;
        if (prop === 'y') return r.y ?? node.pos.y;
        if (prop === 'opacity') return r.opacity ?? node.style?.opacity;
        if (prop === 'scale') return r.scale;
        if (prop === 'rotation') return r.rotation;
        return undefined;
      } else {
        const edge = el as VizEdge;
        const r: VizRuntimeEdgeProps = edge.runtime ?? {};
        if (prop === 'opacity') return r.opacity;
        if (prop === 'strokeDashoffset') return r.strokeDashoffset;
        return undefined;
      }
    },

    set(target, prop, value) {
      const el = resolve(target);
      if (!el) return;

      if (target.startsWith('node:')) {
        const node = el as VizNode;
        node.runtime = node.runtime ?? {};
        (node.runtime as VizRuntimeNodeProps)[
          prop as keyof VizRuntimeNodeProps
        ] = value;
      } else {
        const edge = el as VizEdge;
        edge.runtime = edge.runtime ?? {};
        (edge.runtime as VizRuntimeEdgeProps)[
          prop as keyof VizRuntimeEdgeProps
        ] = value;
      }
    },

    flush() {
      requestRender();
    },
  };
}
