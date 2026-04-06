---
"vizcraft": minor
---

Add `initialPan` mount option and `getState()` method to `PanZoomController` for persisting viewport state across scene rebuilds.

**New API:**
- `initialPan: Vec2` — set starting pan offset when `initialZoom` is a number
- `controller.getState()` — returns a `{ zoom, pan }` snapshot of the current viewport

This enables seamless viewport persistence by capturing `getState()` before destroy and passing the values as `initialZoom` / `initialPan` when remounting.
