---
name: runtime-patching-and-svg-dom
description: "Performance and correctness rules for SVG runtime patching in VizCraft: cache DOM lookups, patch minimal attributes, and define conflict rules between base style vs runtime overrides. Use when touching mount/patchRuntime logic."
license: Complete terms in LICENSE.txt
---

# Runtime Patching and SVG DOM

## Cache DOM references

- Build a patch context that indexes SVG elements by id.
- Cache per mounted SVG (e.g. via `WeakMap`) to avoid repeated queries.

## Patch the minimum surface area

- Only update what changed (positions, runtime-only props).
- Keep geometry updates and label updates separate and obvious.

## Define conflict rules explicitly

- Runtime overrides should win over base attributes when both exist.
- Revert to base attributes when runtime overrides are removed.

## Use consistent selectors

- Prefer `data-*` roles for internal wiring, with class fallbacks for compatibility.
- Keep class names predictable (`viz-…`) for user CSS.

## Don’t mix concerns

- Keep pure computations (anchors, endpoints, layout) separate from DOM writes.
- Avoid calling DOM APIs from places meant to be data-only.
