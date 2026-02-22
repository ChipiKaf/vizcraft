import type { VizScene } from './types';

/**
 * Scene data structure that represents a serialised VizScene.
 * It purposely omits non-serializable properties (e.g., functions like `onClick`).
 */
export interface SerializedScene {
  /** Schema version for forward compatibility */
  version: 'vizcraft/1';
  viewBox: { w: number; h: number };
  grid?: { cols: number; rows: number; padding: { x: number; y: number } };
  // We use `any` or `Record<string, unknown>` for the collections to bypass
  // strict types temporarily, but realistically they are just the raw arrays
  // minus any function properties.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodes: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  edges: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  overlays?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  animationSpecs?: any[];
}

/**
 * Strips non-serializable properties (like functions) from an object deeply.
 * Note: This is a simplistic deep clone that ignores functions and undefined values.
 */
function stripFunctionsAndClone<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (typeof obj === 'function') {
    return undefined as unknown as T; // Stripped
  }
  if (Array.isArray(obj)) {
    return obj
      .map((item) => stripFunctionsAndClone(item))
      .filter((item) => item !== undefined) as unknown as T;
  }
  if (typeof obj === 'object') {
    const cloned = {} as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      const strippedValue = stripFunctionsAndClone(value);
      if (strippedValue !== undefined) {
        cloned[key] = strippedValue;
      }
    }
    return cloned as T;
  }
  return obj;
}

/**
 * Serializes a VizScene into a plain JSON-serializable object.
 * Removes non-serializable properties like `onClick` handlers.
 *
 * @param scene The VizScene to serialize.
 * @returns A JSON-serializable representation of the scene.
 */
export function serializeScene(scene: VizScene): SerializedScene {
  const serializedNodes = stripFunctionsAndClone(scene.nodes);
  const serializedEdges = stripFunctionsAndClone(scene.edges);
  const serializedOverlays = stripFunctionsAndClone(scene.overlays);
  const serializedAnimationSpecs = stripFunctionsAndClone(scene.animationSpecs);

  const payload: SerializedScene = {
    version: 'vizcraft/1',
    viewBox: { ...scene.viewBox },
    nodes: serializedNodes,
    edges: serializedEdges,
  };

  if (scene.grid) {
    payload.grid = { ...scene.grid };
  }
  if (serializedOverlays && serializedOverlays.length > 0) {
    payload.overlays = serializedOverlays;
  }
  if (serializedAnimationSpecs && serializedAnimationSpecs.length > 0) {
    payload.animationSpecs = serializedAnimationSpecs;
  }

  return payload;
}

/**
 * Deserializes a previously serialized VizScene payload back into a VizScene.
 * Performs basic structural validation to ensure the data is usable.
 *
 * @param payload The parsed JSON output from `serializeScene()`.
 * @returns A usable VizScene object.
 * @throws Error if the payload is invalid or unsupported.
 */
export function deserializeScene(payload: unknown): VizScene {
  if (!payload || typeof payload !== 'object') {
    throw new Error('deserializeScene: payload must be an object');
  }

  const data = payload as SerializedScene;

  if (data.version !== 'vizcraft/1') {
    throw new Error(`deserializeScene: unsupported version ${data.version}`);
  }

  if (!data.viewBox || typeof data.viewBox !== 'object') {
    throw new Error('deserializeScene: missing or invalid viewBox');
  }

  if (!Array.isArray(data.nodes)) {
    throw new Error('deserializeScene: missing or invalid nodes array');
  }

  if (!Array.isArray(data.edges)) {
    throw new Error('deserializeScene: missing or invalid edges array');
  }

  const scene: VizScene = {
    viewBox: { ...data.viewBox },
    nodes: data.nodes as VizScene['nodes'],
    edges: data.edges as VizScene['edges'],
  };

  if (data.grid) {
    scene.grid = { ...data.grid };
  }
  if (data.overlays) {
    scene.overlays = data.overlays as VizScene['overlays'];
  }
  if (data.animationSpecs) {
    scene.animationSpecs = data.animationSpecs as VizScene['animationSpecs'];
  }

  return scene;
}
