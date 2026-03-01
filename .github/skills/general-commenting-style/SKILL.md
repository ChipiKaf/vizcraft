```skill
---
name: general-commenting-style
description: Keep comments simple and succinct. Prefer TSDoc for functions/classes and avoid verbose banners or multi-line narration.
license: Complete terms in LICENSE.txt
---

# Concise Comments + TSDoc (TypeScript)

Use comments sparingly. Prefer clear names and small functions. When you do comment, keep it short, specific, and useful.

## Goals

- Explain **intent** (why), not mechanics (what the code already says)
- Keep comments **one thought per comment**
- Prefer **TSDoc** for functions/classes that need API docs
- Avoid “decorative” comments (banners, separators, walls of text)

## Default Rules

- If a comment doesn’t add information beyond the code, delete it.
- Prefer **single-line** comments. If you need multiple lines, rewrite:
  - extract a helper
  - rename variables
  - move context into a TSDoc block
- Don’t narrate step-by-step in repeated `// ...` lines.
- Don’t use banner comments like:
  - `-------------- Plugins -----------------`
  - `================== Something ==================`

## When to Use Which Kind

### Inline `//` comment
Use for small, local intent that isn’t worth a doc block.

Good:

```ts
// Guard against stale selection after canvas reset.
if (!selectedId) return;
```

Too verbose:

```ts
// If there is no selected id
// then we should return early
// because there is nothing selected
if (!selectedId) return;
```

### TSDoc `/** */`
Use for exported/public-ish APIs, complex helpers, and classes.

Guidelines:

- First line: what it does, in one sentence.
- Add extra lines only for important constraints/side effects.
- Prefer `@param` / `@returns` only when non-obvious.
- Document invariants and edge cases.

Example (function):

```ts
/**
 * Normalizes a user-entered label for display.
 * Trims whitespace and collapses internal runs.
 */
export function normalizeLabel(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}
```

Example (class):

```ts
/**
 * Wires editor keyboard shortcuts and ensures listeners are cleaned up.
 */
export class KeyboardManager {
  // ...
}
```

## Content Checklist (keep it minimal)

A useful comment usually answers at least one:

- Why is this needed?
- What would break if we removed it?
- What invariant is being preserved?
- What external constraint exists (DOM quirk, library behavior, perf, ordering)?

If you can’t answer one of those, it’s probably noise.

## Preferred Style

- Start with a verb or a clear noun phrase.
  - “Guard against …”
  - “Normalize …”
  - “Workaround for …”
- Avoid subjective filler: “simply”, “just”, “obviously”.
- Keep punctuation simple; one sentence is usually enough.

## Refactor Instead of Commenting

If you find yourself writing a long comment, prefer:

- Extracting a helper with a good name
- Introducing a small type (e.g. `type PortId = string`)
- Replacing “magic” values with constants

## Don’ts

- Don’t add separators/banners for sections.
- Don’t restate the code.
- Don’t stack 4+ consecutive comment lines unless it’s TSDoc.

```
