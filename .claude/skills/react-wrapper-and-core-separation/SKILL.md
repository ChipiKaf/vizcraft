---
name: react-wrapper-and-core-separation
description: "Standards for React integration: keep core framework-agnostic, keep React as a thin adapter, and preserve predictable rendering/animation behavior. Use when changing react-vizcraft or adding new UI helpers."
license: Complete terms in LICENSE.txt
---

# React Wrapper and Core Separation

## Keep core framework-agnostic

- Core packages should not depend on React.
- Prefer portable data-only scenes and specs.

## React layer is an adapter

- React components should translate scenes/specs to DOM output.
- Keep registries injectable via props with sensible defaults.

## Avoid unnecessary rerenders

- Use memoization for lookup maps and derived structures.
- Use layout effects for animation loops that must sync with paint.

## Diagnostics should be non-fatal

- Warn on missing registry entries.
- Prefer no-op rendering over throwing in the UI path.
