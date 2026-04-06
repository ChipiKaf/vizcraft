---
"vizcraft": minor
---

Add `color` and `glowColor` options to `SignalOverlayParams` for per-signal ball color overrides.

**New fields in `SignalOverlayBaseParams`:**
- `color?: string` — CSS color applied as an inline fill on the signal ball, overriding the CSS class default (`#3b82f6`). Works on both single-hop and chain signals.
- `glowColor?: string` — CSS color applied as a `drop-shadow` filter on the signal shape for a halo effect. Defaults to `color` when omitted.

When neither field is set, rendering is identical to before (full back-compat).

**Example:**

```ts
// Green ball — majority committed
overlays.add('signal', {
  from: 'primary',
  to: 'reader',
  edgeId: 'primary-reader',
  progress: 0.6,
  magnitude: 0.85,
  color: '#22c55e',
});

// Amber ball — stale snapshot
overlays.add('signal', {
  from: 'primary',
  to: 'reader',
  edgeId: 'primary-reader',
  progress: 0.6,
  magnitude: 0.85,
  color: '#f59e0b',
});
```
