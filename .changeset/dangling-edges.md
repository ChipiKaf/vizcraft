---
'vizcraft': minor
---

Support dangling edges with free endpoints (source-only or target-only) for interactive diagrams. Added `danglingEdge()` builder method, `fromAt()`/`toAt()` on `EdgeBuilder`, and made `VizEdge.from`/`VizEdge.to` optional. Dangling edges work with all edge features including routing, markers, labels, styling, hit testing, SVG export, and DOM mounting.
