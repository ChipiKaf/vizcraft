/* eslint-disable @typescript-eslint/no-explicit-any */
import type { VizNode, VizEdge, VizAnimSpec } from './types';

export interface CoreAnimRendererContext<T = any> {
  spec: VizAnimSpec<T>;
  element: VizNode | VizEdge;
}

export interface CoreAnimRenderer<T = any> {
  getClass?: (ctx: CoreAnimRendererContext<T>) => string;
  getStyle?: (
    ctx: CoreAnimRendererContext<T>
  ) => Record<string, string | number>;
}

export class CoreAnimationRegistry {
  private nodeAnims = new Map<string, CoreAnimRenderer>();
  private edgeAnims = new Map<string, CoreAnimRenderer>();

  constructor() {}

  registerNode(id: string, renderer: CoreAnimRenderer) {
    this.nodeAnims.set(id, renderer);
    return this;
  }

  registerEdge(id: string, renderer: CoreAnimRenderer) {
    this.edgeAnims.set(id, renderer);
    return this;
  }

  getNodeRenderer(id: string): CoreAnimRenderer | undefined {
    return this.nodeAnims.get(id);
  }

  getEdgeRenderer(id: string): CoreAnimRenderer | undefined {
    return this.edgeAnims.get(id);
  }
}

// Default Implementations
export const coreFlowAnimation: CoreAnimRenderer<{ duration?: string }> = {
  getClass: () => 'viz-anim-flow',
  getStyle: ({ spec }) => {
    const duration = spec.params?.duration ?? '2s';
    return {
      '--viz-anim-duration': duration,
    };
  },
};

export const defaultCoreAnimationRegistry =
  new CoreAnimationRegistry().registerEdge('flow', coreFlowAnimation);
