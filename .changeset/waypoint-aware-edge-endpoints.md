---
'vizcraft': minor
---

Waypoint-aware edge endpoint anchoring: when an edge has waypoints, the source boundary anchor now aims toward the first waypoint and the target anchor aims toward the last waypoint, instead of toward the other node's center. This enables clean edge bundling where multiple edges sharing the same convergence waypoint anchor at the exact same perimeter point on the target node.
