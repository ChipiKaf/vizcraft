import type { AnimationHostAdapter, RegistrableAdapter } from './adapter';

export type ExtendAdapter = (
  adapter: AnimationHostAdapter & Partial<RegistrableAdapter>
) => void;
