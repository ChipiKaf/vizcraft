---
name: animation-spec-and-playback
description: "Rules for VizCraft’s data-only AnimationSpec system: deterministic compilation, adapter-based host writes, easing, and correct tween chaining. Use when adding animatable properties or modifying playback."
license: Complete terms in LICENSE.txt
---

# Animation Spec and Playback

## Keep specs portable

- Specs are data-only; no DOM nodes, closures, or framework state.
- Version specs and evolve schema conservatively.

## Prefer adapter-based execution

- Playback talks to a host adapter (`get`/`set`/`flush`) instead of direct DOM.
- Keep adapter interfaces small and predictable.

## Make evaluation deterministic

- Sort tweens deterministically and use stable keys for tracks.
- Clamp progress and handle edge cases (zero duration, missing froms).

## Chain sequential tweens correctly

- If a tween has no `from`, derive it from the prior tween when sequential.
- Fall back to captured base values when there’s no prior.

## Add properties intentionally

- Only animate numeric properties by default.
- Use extension points for custom properties rather than widening core types.
