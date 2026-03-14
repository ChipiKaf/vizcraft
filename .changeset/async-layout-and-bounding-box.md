---
"vizcraft": minor
---

Add async layout support and `getNodeBoundingBox` utility. `LayoutAlgorithm` now accepts async algorithms via the new `.layoutAsync()` builder method. `getNodeBoundingBox(shape)` returns a tight axis-aligned bounding box for any `NodeShape`, accounting for orientation, direction, and pointer height.
