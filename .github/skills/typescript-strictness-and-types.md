---
name: typescript-strictness-and-types
description: "TypeScript quality standards for VizCraft: strict types, discriminated unions, safe generics, and extension via module augmentation. Use to keep APIs type-safe and portable across core + React packages."
license: Complete terms in LICENSE.txt
---

# TypeScript Strictness and Types

## Embrace strictness

- Keep code compatible with `strict: true` and `noUncheckedIndexedAccess`.
- Don’t silence errors with broad `any` unless it’s an intentional escape hatch.

## Prefer discriminated unions for domain models

- Model shapes and variants with `kind`-based unions.
- Switch on `kind` and make exhaustiveness obvious.

## Design APIs with safe generics

- Use generics to preserve type information across fluent chains.
- Avoid widening to `unknown`/`any` unless it’s explicitly part of the API.

## Support downstream extension safely

- Use TypeScript module augmentation patterns (e.g. registry interfaces) for extensibility.
- Keep a typed “known ids” path and a separate escape hatch for custom ids.

## Keep boundaries clean

- Use `import type …` for type-only imports.
- Export minimal public surface area; keep internal helpers private.
