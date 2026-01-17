import type { AnimationSpec } from './spec';
import type { ExtendAdapter } from './extendAdapter';

export const ADAPTER_EXTENSIONS = Symbol('vizcraft.adapterExtensions');

export type AnimationSpecWithAdapterExtensions = AnimationSpec & {
  [ADAPTER_EXTENSIONS]?: ExtendAdapter[];
};

export function getAdapterExtensions(
  spec: AnimationSpec
): ReadonlyArray<ExtendAdapter> {
  const maybe = (spec as AnimationSpecWithAdapterExtensions)[
    ADAPTER_EXTENSIONS
  ];
  return Array.isArray(maybe) ? maybe : [];
}
