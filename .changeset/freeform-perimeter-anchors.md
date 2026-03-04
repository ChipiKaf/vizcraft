---
'vizcraft': minor
---

- Add freeform perimeter anchors for edges (`fromAngle` / `toAngle`). Edges can now leave or arrive at a fixed angle on any node shape, overriding the default boundary projection. Supported via fluent `.fromAngle(deg)` / `.toAngle(deg)` methods and declarative `EdgeOptions`. Also exports `computeNodeAnchorAtAngle(node, angleDeg)` for advanced use.

- Support dangling edges with free endpoints (source-only or target-only) for interactive diagrams. Added `danglingEdge()` builder method, `fromAt()`/`toAt()` on `EdgeBuilder`, and made `VizEdge.from`/`VizEdge.to` optional. Dangling edges work with all edge features including routing, markers, labels, styling, hit testing, SVG export, and DOM mounting.