---
name: testing-with-vitest
description: "Testing patterns used in VizCraft: small focused Vitest suites, deterministic state, numeric assertions for animation, and avoiding brittle DOM coupling. Use when adding tests or refactoring behavior."
license: Complete terms in LICENSE.txt
---

# Testing with Vitest

## Keep tests small and direct

- Test one behavior per test.
- Prefer plain objects/maps over complex fixtures.

## Assert numeric behavior safely

- Use `toBeCloseTo` for interpolation/easing.
- Cover edge cases (zero durations, missing inputs, sequential tweens).

## Avoid brittle coupling

- Don’t depend on DOM layout unless the unit is explicitly DOM-based.
- Prefer adapter-based testing when the implementation supports it.

## Make failures readable

- Use descriptive test names.
- Keep expected values near the assertion.
