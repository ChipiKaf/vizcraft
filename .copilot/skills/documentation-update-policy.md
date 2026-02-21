---
name: documentation-update-policy
description: "Hard rule for this repo: every user-facing feature/change includes docs updates (README + Docusaurus). Use whenever you add or change APIs, behaviors, defaults, CSS hooks, animations, overlays, or examples."
license: Complete terms in LICENSE.txt
---

# Documentation Update Policy

## Non-negotiable rule

- Every **user-facing change** must update documentation in the same PR.

## Interactive example requirement

- If a change is visible on screen (rendering, shapes, overlays, animations, CSS hooks, interaction), add/update an interactive Docusaurus example in `packages/docs/docs/**`.
- Prefer MDX using `CodePreview` + `VizMount` (and `VizPlaybackControls` when motion is involved).

User-facing includes:

- public APIs (builder methods, types, exports)
- behavior/defaults (layout, anchors, runtime patching conflict rules)
- animations/overlays (spec fields, playback semantics, registries)
- CSS hooks (classes, `--viz-*` variables)
- examples and demo behavior

## What to update

- `README.md` (high-level overview + quick start)
- `packages/core/README.md` (keep aligned with root README when relevant)
- `packages/docs/docs/**` (comprehensive documentation)

## What good doc updates look like

- Add a short “why” and a clear mental model.
- Provide copy/paste-able examples.
- Provide a live interactive example when the behavior is visual.
- Call out edge cases, back-compat, and migration notes.
- Link to type anchors in `types.mdx` when you introduce new concepts.

## Definition of done

- Code compiles/tests.
- Docs explain the new behavior.
- Examples reflect the final API and run without guesswork.
