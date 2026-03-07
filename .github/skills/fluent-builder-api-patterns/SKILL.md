---
name: fluent-builder-api-patterns
description: "How to evolve VizCraft’s fluent Builder APIs: chainable methods, predictable defaults, stable id conventions, and careful back-compat overloads. Use when adding new builder methods or refactoring chaining."
license: Complete terms in LICENSE.txt
---

# Fluent Builder API Patterns

## Make chaining predictable

- Builder methods return the builder (or a nested builder) consistently.
- Defaults should be documented and stable.
- Avoid surprising mutations; mutate only the builder instance state.

## Keep state internal and serializable

- Build functions produce data-only scenes/specs that can be serialized.
- Keep DOM/runtime-only state out of serialized structures.

## Use stable id conventions

- Prefer explicit ids when provided; otherwise use deterministic conventions.
- Keep ids stable across rebuilds to support runtime patching.

## Back-compat without confusion

- Use overloads to preserve old entry points while enabling typed variants.
- Separate “legacy registry animations” from “data-only timeline specs”.

## Provide internal escape hatches

- Internal methods (e.g. underscored helpers) are allowed for advanced use.
- Keep escape hatches documented and intentionally limited.
