---
name: typescript-strictness-and-types
description: "TypeScript quality standards for VizCraft: strict types, discriminated unions, safe generics, and extension via module augmentation. Use to keep APIs type-safe and portable across core + React packages."
license: Complete terms in LICENSE.txt
---

# TypeScript Strictness and Types

## Embrace strictness

- Keep code compatible with `strict: true` and `noUncheckedIndexedAccess`.
- Do your best to avoid `any` types. Strongly favor generics and explicit types that have been properly set instead of silencing errors with broad `any`.

## Aim for maintainability and avoid code duplication

- Avoid having multiple places to maintain types that refer to the same thing.
- If you have two related types where one builds upon the other, use TypeScript type utilities (`extends`, `Omit`, `Pick`, etc.) to unify them and maintain a single source of truth.

**Example:**
Instead of redefining shared fields:
```typescript
// ❌ Bad: Redundant fields
interface User {
  id: string;
  name: string;
  email: string;
}
interface UserPreview {
  id: string;
  name: string;
}
```
Use utility types to build on existing ones:
```typescript
// ✅ Good: Reusing existing types
interface User {
  id: string;
  name: string;
  email: string;
}

// Unify types and avoid duplication
type UserPreview = Pick<User, "id" | "name">;
type UserCreationPayload = Omit<User, "id">;

interface DetailedUser extends User {
  address: string;
}
```

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
