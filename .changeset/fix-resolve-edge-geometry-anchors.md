---
'vizcraft': patch
---

Fix `resolveEdgeGeometry`: `startAnchor`/`endAnchor` now return the true boundary/port positions where the edge exits/enters each node, instead of the ~15%/~85% label positions. Added `startLabel` and `endLabel` fields as explicit aliases for the label positions. For self-loops, anchors correspond to the exit/entry points on the node boundary.
