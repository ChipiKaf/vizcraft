import type {
  VizScene,
  VizNode,
  VizEdge,
  VizRuntimeNodeProps,
  VizRuntimeEdgeProps,
} from '../types';
import type { AnimationHostAdapter } from './adapter';
import type { AnimationTarget } from './spec';

// @todo: This does not feel too generalizable; consider how to make this more adaptable
// There are too many hardcoded properties and things specific to VizCraft here.
// What happens when we want to animate other things, like overlays, or other properties?
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

  // Readers/writers tables: data-driven accessors per kind/property
  const nodeReaders: Partial<
    Record<keyof VizRuntimeNodeProps, (n: VizNode) => number | undefined>
  > = {
    x: (n) => n.runtime?.x ?? n.pos.x,
    y: (n) => n.runtime?.y ?? n.pos.y,
    opacity: (n) => n.runtime?.opacity ?? n.style?.opacity,
    scale: (n) => n.runtime?.scale,
    rotation: (n) => n.runtime?.rotation,
  };

  const edgeReaders: Partial<
    Record<keyof VizRuntimeEdgeProps, (e: VizEdge) => number | undefined>
  > = {
    opacity: (e) => e.runtime?.opacity,
    strokeDashoffset: (e) => e.runtime?.strokeDashoffset,
  };

  const nodeWriters: Partial<
    Record<keyof VizRuntimeNodeProps, (n: VizNode, v: number) => void>
  > = {
    x: (n, v) => {
      n.runtime = n.runtime ?? {};
      n.runtime.x = v;
    },
    y: (n, v) => {
      n.runtime = n.runtime ?? {};
      n.runtime.y = v;
    },
    opacity: (n, v) => {
      n.runtime = n.runtime ?? {};
      n.runtime.opacity = v;
    },
    scale: (n, v) => {
      n.runtime = n.runtime ?? {};
      n.runtime.scale = v;
    },
    rotation: (n, v) => {
      n.runtime = n.runtime ?? {};
      n.runtime.rotation = v;
    },
  };

  const edgeWriters: Partial<
    Record<keyof VizRuntimeEdgeProps, (e: VizEdge, v: number) => void>
  > = {
    opacity: (e, v) => {
      e.runtime = e.runtime ?? {};
      e.runtime.opacity = v;
    },
    strokeDashoffset: (e, v) => {
      e.runtime = e.runtime ?? {};
      e.runtime.strokeDashoffset = v;
    },
  };

  // Maps keyed by kind so registration can extend them
  const readersByKind: Record<
    string,
    Record<string, (el: unknown) => number | undefined>
  > = {
    node: Object.assign({}, nodeReaders) as Record<
      string,
      (el: unknown) => number | undefined
    >,
    edge: Object.assign({}, edgeReaders) as Record<
      string,
      (el: unknown) => number | undefined
    >,
  };

  const writersByKind: Record<
    string,
    Record<string, (el: unknown, v: number) => void>
  > = {
    node: Object.assign({}, nodeWriters) as Record<
      string,
      (el: unknown, v: number) => void
    >,
    edge: Object.assign({}, edgeWriters) as Record<
      string,
      (el: unknown, v: number) => void
    >,
  };

  function register(
    kind: string,
    prop: string,
    handlers: {
      get?: (el: unknown) => number | undefined;
      set?: (el: unknown, v: number) => void;
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

  return {
    get(target, prop) {
      const el = resolve(target);
      if (!el) return undefined;

      const [kind] = target.split(':') as [string, string];
      const readers = readersByKind[kind] ?? {};
      const reader = readers[prop];
      if (reader) return reader(el as unknown);

      // typed fallback to runtime object for node/edge
      if (kind === 'node') {
        const node = el as VizNode;
        const r: VizRuntimeNodeProps = node.runtime ?? {};
        const val = r[prop as keyof VizRuntimeNodeProps];
        return typeof val === 'number' ? val : undefined;
      }
      const edge = el as VizEdge;
      const r: VizRuntimeEdgeProps = edge.runtime ?? {};
      const val = r[prop as keyof VizRuntimeEdgeProps];
      return typeof val === 'number' ? val : undefined;
    },

    set(target, prop, value) {
      const el = resolve(target);
      if (!el) return;
      const [kind] = target.split(':') as [string, string];
      const writers = writersByKind[kind] ?? {};
      const writer = writers[prop];
      if (writer) {
        writer(el as unknown, value);
        return;
      }

      // typed fallback to runtime object
      if (kind === 'node') {
        const node = el as VizNode;
        node.runtime = node.runtime ?? {};
        (node.runtime as VizRuntimeNodeProps)[
          prop as keyof VizRuntimeNodeProps
        ] = value;
        return;
      }
      const edge = el as VizEdge;
      edge.runtime = edge.runtime ?? {};
      (edge.runtime as VizRuntimeEdgeProps)[prop as keyof VizRuntimeEdgeProps] =
        value;
    },

    flush() {
      requestRender();
    },
    register,
  };
}
