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
