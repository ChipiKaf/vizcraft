---
name: vizcraft-runtime-patching-and-performance
description: 'How an AI agent should implement high-performance updates in VizCraft using runtime patching (node.runtime/edge.runtime + patchRuntime). Use for per-frame updates, scrubbing, and interactive demos without remounting SVG.'
license: Complete terms in LICENSE.txt
---

# VizCraft Runtime Patching & Performance

## Mental model (fast path)

- **Mount once**, then update by _mutating runtime state_ and _patching the existing SVG in-place_.
- Runtime patching is designed for **high-frequency updates** (RAF, dragging, slider scrubbing, playback).
- The “flush” operation should be **one call per frame**:
  - `builder.patchRuntime(container)` patches nodes/edges and reconciles overlays.
  - Playback helpers already do this for you via the animation adapter’s `flush()`.

## Do this for frequent updates

- Keep a stable `container` element per visualization.
- Call `builder.mount(container)` once.
- In your update loop:
  - mutate runtime fields (`node.runtime`, `edge.runtime`, and overlay params)
  - then call `builder.patchRuntime(container)` **once**

Example shape of an efficient loop:

- Compute all new values in JS (pure math, no DOM reads).
- Write runtime values to the builder’s scene objects.
- Patch once.

## Don’t do this (slow path)

- Don’t call `mount()` repeatedly for RAF/drag/scrub loops.
- Don’t rebuild the DOM tree every frame.
- Don’t call `patchRuntime()` multiple times per frame (batch your mutations first).

## Conflict rules (runtime vs base)

Runtime values intentionally override base attributes/styles. The runtime patcher enforces these rules:

- **Opacity**
  - If `node.runtime.opacity` is set: it wins (patched as an inline style on the group).
  - If it’s removed/undefined: the patcher reverts back to the node’s base style/attrs.
- **Transforms**
  - If `node.runtime.scale` and/or `node.runtime.rotation` is set: the patcher applies a group `transform`.
  - If both are unset: the patcher removes the `transform` attribute.
- **Edge dash offset**
  - If `edge.runtime.strokeDashoffset` is set: it patches dashoffset inline.
  - If removed/undefined: it removes the inline dashoffset.

## Use playback instead of writing your own per-frame driver

When you want timeline-style animation (including scrubbing):

- Prefer `builder.play(...)` or the low-level helpers `createBuilderPlayback(...)` / `playAnimationSpec(...)`.
- Playback is efficient because it:
  - writes only numeric runtime properties via the adapter (`get`/`set`)
  - calls a single `flush()` per frame (wired to `builder.patchRuntime(container)`)

For scrubbing, use `controller.seek(ms)` rather than rebuilding specs or remounting.

## Scale tips for “big” updates

When the scene is large, the expensive part is usually the _number of animated tracks_ and the _amount of geometry that must be recomputed_.

- **Minimize tracks**: per frame cost grows with the count of `(target, property)` pairs you update.
- **Prefer container motion**: if many nodes move together, animate the container node; children inherit the container’s runtime delta.
- **Prefer opacity/transform where acceptable**: moving many nodes forces edge path recomputation each patch.
- **Keep DOM queries out of the hot path**: `patchRuntime()` is already optimized to reuse a cached patch context for the mounted SVG.

## Overlays

- Overlays are registry-rendered and reconciled during `builder.patchRuntime(container)`.
- If you animate overlay params via the animation adapter (targets like `overlay:<key>`), the adapter marks overlays “dirty” so patching can skip unaffected overlays.
- If you mutate overlay params yourself, batch mutations and patch once (same rule as nodes/edges).

## When you must do a full rebuild/remount

Runtime patching is for _updating existing objects_, not changing topology.

- If you add/remove nodes or edges, or you materially change the SVG structure, do a full `build()` + `mount()`.
- If you only need motion/opacity/transform/dashoffset changes, prefer runtime patching.

## Practical checklist (agent-friendly)

- Mount once.
- Mutate many runtime values.
- Patch once per frame.
- Use playback helpers for timelines and scrubbing.
- Remount only for topology changes.
