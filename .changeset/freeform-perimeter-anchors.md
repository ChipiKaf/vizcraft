---
'vizcraft': minor
---

Add freeform perimeter anchors for edges (`fromAngle` / `toAngle`). Edges can now leave or arrive at a fixed angle on any node shape, overriding the default boundary projection. Supported via fluent `.fromAngle(deg)` / `.toAngle(deg)` methods and declarative `EdgeOptions`. Also exports `computeNodeAnchorAtAngle(node, angleDeg)` for advanced use.
