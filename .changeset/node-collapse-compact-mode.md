---
'vizcraft': minor
---

Add node collapse / compact mode for compartmented nodes.

- New `.collapsed(state?)` method on `NodeBuilder` — renders only the first compartment (header) while preserving all compartment data.
- Auto-sizes node height to first compartment when collapsed.
- Renders a collapse indicator triangle in the header.
- Adds `viz-node-collapsed` CSS class to the node group for styling hooks.
- Supports declarative `collapsed: true` in `NodeOptions`.
- Works in both DOM mount and SVG export.
- New `.onClick(handler)` method on `CompartmentBuilder` — registers a click handler that receives `CompartmentClickContext` with `nodeId`, `compartmentId`, `collapsed` state, `collapseAnchor`, and a `toggle()` helper for animated collapse/expand.
- Collapse indicator rendered when first compartment has an `onClick` handler.
- New `.collapseIndicator(opts)` method — customise colour, hide, or supply custom SVG for the chevron.
- New `.collapseAnchor(anchor)` method — control which edge stays fixed during collapse animation (`'top'`, `'center'`, `'bottom'`). Also available per-toggle via `ctx.toggle({ anchor })`.
- `CompartmentClickContext` exposes `collapseAnchor` as a readable field.
