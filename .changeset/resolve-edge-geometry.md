---
'vizcraft': minor
---

Add `resolveEdgeGeometry(scene, edgeId)` convenience function that resolves all rendered geometry for an edge in a single call — node lookup, self-loop detection, port/angle/boundary anchors, waypoints, routing, SVG path, midpoint, and label positions. Also exports `resolveEdgeGeometryFromData` for batch processing with a pre-built node map.
