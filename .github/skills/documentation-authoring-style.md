---
name: documentation-authoring-style
description: "How to write VizCraft docs in the repo’s existing style: Docusaurus-first, MDX when interactive examples help, structured sections, and type-linked references. Use when creating or expanding docs pages."
license: Complete terms in LICENSE.txt
---

# Documentation Authoring Style

## Prefer Docusaurus for comprehensive docs

- Primary docs live in `packages/docs/docs/`.
- Use Markdown for simple pages; use MDX when you need interactive previews.

## Follow the house structure

For new pages, aim for:

- Overview (what, when to use)
- Mental model (how to think about it)
- Quick start (minimal example)
- API reference (method-by-method, with return types and gotchas)
- Examples (one minimal, one realistic)
- Notes (edge cases, back-compat, performance)

## Write examples like the repo

- Use the fluent builder style (`viz().view(...).node(...).edge(...).done()`).
- Prefer deterministic ids (e.g. `a->b`) and explain conventions.
- Keep snippets copy/paste-able and consistent with `README.md`.

## Use interactive MDX patterns when useful

- For anything screen-visible (rendering, overlays, animations, shapes, interactions), interactive MDX is required.
- Use `CodePreview` + `VizMount` (and `VizPlaybackControls` for timelines) like existing docs.
- Keep demo builders/scenes declared near the top of the MDX file.

## Add a concrete interactive example for new visuals

- New shape/overlay/animation/rendering change must have a live example.
- Prefer updating an existing page/section if it already covers the topic.
- Otherwise add a new section with a minimal example + a realistic example.

## Link to types

- When referencing types/specs, link to `types.mdx` anchors (e.g. `AnimationSpec`, `TweenSpec`).
- Update `types.mdx` when new public types or fields are introduced.
