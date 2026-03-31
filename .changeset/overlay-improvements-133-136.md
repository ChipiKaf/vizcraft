---
'vizcraft': minor
---

Add a grouped set of overlay improvements across issues 133 to 136:

- Add node-relative positioning to primitive overlays with optional offsets while preserving existing absolute-coordinate behavior.
- Let built-in `signal` overlays follow resolved edge paths instead of only using straight-line motion.
- Add resting and parked positioning options so signals can remain visible inside a node after arrival.
- Add declarative multi-hop signal chains with hop-by-hop progress, routed edge following, and automatic parking at the final node.