# Copilot Instructions (VizCraft)

These instructions apply to all changes you make in this repo.

## Non-negotiable: docs must be updated for every feature

When you add, remove, or change **any user-facing behavior** (API, defaults, runtime behavior, animation/overlay behavior, CSS classes/vars, examples), you MUST update documentation in the same change:

- Root README: `README.md`
- Package README (keep in sync when relevant): `packages/core/README.md`
- Docusaurus docs: `packages/docs/docs/**`

If the feature is substantial, prefer adding or expanding Docusaurus docs (MDX/Markdown) rather than only editing the README.

### Interactive examples required for anything screen-visible

If a change is visible on screen or affects rendering (new shape, overlay kind, animation, CSS hook, rendering behavior, interaction), you MUST add or update an interactive Docusaurus example under `packages/docs/docs/**`.

- Prefer MDX with live previews using `CodePreview`, `VizMount`, and `VizPlaybackControls`.
- Examples must be copy/paste-able and use the fluent builder style.
- Update existing examples when they are the best fit; add a new section/page when needed.

### What “update docs” means

- Explain the mental model and intended usage.
- Add or update code examples (copy/paste-able) consistent with the repo’s fluent builder style.
- For screen-visible behavior, include a live interactive example in Docusaurus.
- Update type references and links (e.g. `types.mdx` anchors) when public types change.
- Ensure docs reflect back-compat and any “two systems” distinctions (e.g. registry/CSS animations vs data-only timelines).

## Docusaurus authoring conventions

- Docs live in `packages/docs/docs/`.
- Use frontmatter (`title`, optional `sidebar_position`, optional `slug`) like existing docs.
- Prefer MDX for pages that benefit from live demos using `CodePreview`, `VizMount`, and `VizPlaybackControls`.
- Keep sections structured: Overview → Mental model → Quick start → API reference → Examples → Gotchas.

## Code quality conventions (high level)

- TypeScript strictness is required (`strict` + `noUncheckedIndexedAccess`).
- Keep control flow flat (guard-first), keep modules composable.
- Prefer data-only specs for portability; keep DOM/runtime mutation behind adapters.
- Keep lint and tests green (`pnpm lint`, `pnpm test`).
