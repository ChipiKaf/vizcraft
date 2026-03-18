---
"vizcraft": minor
---

Add `padding` and `className` to `EntryOptions` for per-entry vertical spacing and custom CSS targeting. Padding accepts a uniform number or `{ top, bottom }` and increases entry height while keeping text vertically centered. `className` is appended to the entry element's internal class string.

Add `angleBetween` utility and `straightLine()` / `straightLineFrom()` / `straightLineTo()` EdgeBuilder methods for automatic straight-edge routing. When two nodes overlap horizontally the edge drops vertically through the overlap midpoint; when they overlap vertically it runs horizontally. Falls back to a center-to-center diagonal when no overlap exists. Also available via the declarative `{ straightLine: true | 'from' | 'to' }` EdgeOptions form.
