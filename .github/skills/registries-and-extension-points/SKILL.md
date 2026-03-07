---
name: registries-and-extension-points
description: "Extensibility standards in VizCraft: registries for animations/overlays, typed ids when possible, safe fallbacks, and clear warnings. Use when adding new built-ins or extension hooks."
license: Complete terms in LICENSE.txt
---

# Registries and Extension Points

## Use registries for pluggable behavior

- Model “what to render” and “how to animate” as registry lookups.
- Keep default registries small and predictable.

## Prefer typed ids and params

- Use typed overlay id registries where possible.
- Keep an escape hatch for custom ids, but don’t let it pollute the common path.

## Fail soft with good diagnostics

- If a renderer is missing, warn and no-op rather than throw.
- Keep warnings actionable (include the missing id and context).

## Map params to CSS variables predictably

- When using CSS-driven animations, map params to `--viz-…` variables.
- Keep the naming convention stable.
