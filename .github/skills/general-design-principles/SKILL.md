---
name: general-design-principles
description: "Portable engineering principles used across VizCraft: guard-first control flow, clear boundaries, composable design, and intent-driven naming. Use when starting new features or refactoring for maintainability."
license: Complete terms in LICENSE.txt
---

# General Design Principles

## Keep control flow flat

- Guard prerequisites early.
- Return early instead of nesting.
- Extract helpers instead of building deep branching trees.

## Keep modules composable

- Split behavior into focused units.
- Compose units via small interfaces.
- Prefer pure functions for calculations.

## Contain side effects

- Keep pure logic isolated.
- Put I/O, DOM mutation, and timers behind adapters/services.
- Make side-effectful functions easy to spot from names.

## Name by intent

- Prefer names like `create…`, `resolve…`, `ensure…`, `apply…`, `compute…`.
- Avoid abbreviations unless they’re domain standard.
- Prefer “what/why” names over “how” names.
