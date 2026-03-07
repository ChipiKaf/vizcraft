---
name: dual-fluent-and-declarative-apis
description: "VizCraft API design rule: every fluent chained workflow should have an equivalent declarative options-object form (and vice versa) for data-driven usage, serialization, and editor integration. Use when adding new builder entry points or refactoring existing ones."
license: Complete terms in LICENSE.txt
---

# Dual Fluent and Declarative APIs

## Principle

- Prefer supporting **both**:
  - **Fluent chaining** for interactive/exploratory authoring.
  - **Declarative options objects** for programmatic, data-driven construction.

The declarative form should feel “native”, not like a second-class wrapper.

## Requirements for options-object overloads

### 1) Zero new rendering logic

- Options overloads should compile to the **same internal state** as fluent chaining.
- Implement options by calling existing builder methods (syntactic sugar only).

### 2) Coexistence with chaining

- Both forms must compose in one builder chain:
  - declarative for bulk/data-driven elements
  - fluent for one-off complex elements

### 3) Return value signals completeness

- If options are provided, treat the element as “complete” and return the **parent builder**.
- If options are omitted, return the element builder for chaining.

Example pattern:

- `node(id)` → `NodeBuilder`
- `node(id, opts)` → `VizBuilder`
- `edge(from, to, id?)` → `EdgeBuilder`
- `edge(from, to, opts)` → `VizBuilder`

### 4) Overload discrimination must be obvious

- Prefer TypeScript overloads where `string` vs `object` selects the path.
- At runtime, use a minimal check (e.g. `typeof arg === 'string'`) and fail fast on invalid shapes.

### 5) Shorthand ergonomics (keep consistent)

- Support “string or object” shorthands where they reduce verbosity:
  - `stroke: string | { color: string; width?: number }`
  - `label: string | { text: string } & Partial<...>`

## Documentation obligations

- Any new declarative overload is a **user-facing API change**:
  - update `README.md` and `packages/core/README.md` when relevant
  - add/update comprehensive docs in `packages/docs/docs/**`
- If the change affects screen-visible behavior (rendering, CSS hooks, new shapes/overlays/animations), include an interactive MDX example using `CodePreview` + `VizMount` (and `VizPlaybackControls` for timelines).

## Definition of done

- Fluent and declarative forms produce equivalent scenes/specs.
- Types guide correct usage (good autocomplete; minimal `any`).
- Examples show both forms and when to use each.
