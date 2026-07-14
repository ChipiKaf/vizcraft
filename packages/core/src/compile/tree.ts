/**
 * Containment tree (FR-1): builds the parent/child structure declared via
 * `NodeSpec.parent` and validates it (unknown parents, cycles, non-group
 * parents). Zones never participate — they are non-owning by design.
 */

import type { NodeSpec } from '../spec';

export interface ContainmentTree {
  /** Direct children of each group, in declaration order. */
  childrenOf: Map<string, NodeSpec[]>;
  /** Parent group id for each contained node. */
  parentOf: Map<string, string>;
  /** Nodes with no parent, in declaration order (zones excluded). */
  roots: NodeSpec[];
  /** All descendant ids (transitive) for each group. */
  descendantsOf: Map<string, string[]>;
}

/** Effective structural type of a node spec. */
export function nodeType(n: NodeSpec): 'node' | 'group' | 'zone' | 'note' {
  return n.type ?? 'node';
}

/**
 * Build and validate the containment tree.
 *
 * @throws Error on unknown parent ids, parents that are not groups,
 *   or containment cycles.
 */
export function buildContainmentTree(nodes: NodeSpec[]): ContainmentTree {
  const byId = new Map<string, NodeSpec>();
  for (const n of nodes) byId.set(n.id, n);

  const childrenOf = new Map<string, NodeSpec[]>();
  const parentOf = new Map<string, string>();
  const roots: NodeSpec[] = [];

  for (const n of nodes) {
    if (nodeType(n) === 'zone') continue;

    if (n.parent === undefined) {
      roots.push(n);
      continue;
    }

    const parent = byId.get(n.parent);
    if (!parent) {
      throw new Error(
        `VizCraft spec: node '${n.id}' references unknown parent '${n.parent}'.`
      );
    }
    if (nodeType(parent) !== 'group') {
      throw new Error(
        `VizCraft spec: node '${n.id}' has parent '${n.parent}', which is not a 'group' node. ` +
          `Set { type: 'group' } on '${n.parent}' or use a zone for non-owning regions.`
      );
    }

    parentOf.set(n.id, n.parent);
    let siblings = childrenOf.get(n.parent);
    if (!siblings) {
      siblings = [];
      childrenOf.set(n.parent, siblings);
    }
    siblings.push(n);
  }

  // Cycle detection: walk up from every contained node.
  for (const id of parentOf.keys()) {
    const seen = new Set<string>([id]);
    let cur = parentOf.get(id);
    while (cur !== undefined) {
      if (seen.has(cur)) {
        throw new Error(
          `VizCraft spec: containment cycle detected involving '${cur}'.`
        );
      }
      seen.add(cur);
      cur = parentOf.get(cur);
    }
  }

  // Transitive descendants per group.
  const descendantsOf = new Map<string, string[]>();
  const collect = (groupId: string): string[] => {
    const cached = descendantsOf.get(groupId);
    if (cached) return cached;
    const out: string[] = [];
    for (const child of childrenOf.get(groupId) ?? []) {
      out.push(child.id);
      if (nodeType(child) === 'group') out.push(...collect(child.id));
    }
    descendantsOf.set(groupId, out);
    return out;
  };
  for (const n of nodes) {
    if (nodeType(n) === 'group') collect(n.id);
  }

  return { childrenOf, parentOf, roots, descendantsOf };
}

/** Chain of ancestor group ids for a node, innermost first. */
export function ancestorChain(
  id: string,
  parentOf: ReadonlyMap<string, string>
): string[] {
  const chain: string[] = [];
  let cur = parentOf.get(id);
  while (cur !== undefined) {
    chain.push(cur);
    cur = parentOf.get(cur);
  }
  return chain;
}
