---
"vizcraft": minor
---

Add `createStepController` and `createStepControllerFromSpec` for zero-infrastructure step-through walkthroughs.

Each step mounts its own scene, runs its own signal animations via the internal animator, and fires `onReady` when animations complete — without a Redux store or external rAF loop.

New exports:

- `createStepController(opts)` — imperative API; accepts `StepDef[]` with per-step `builder` factories and `autoSignals`
- `createStepControllerFromSpec(spec, container, opts?)` — declarative API; converts `VizSpec.steps` (`VizStepSpec[]`) into step definitions, applies `highlight` dimming (non-highlighted nodes at 30% opacity), merges step overlays onto the base scene, and forces `loop: false` on all step signals
- `StepDef`, `StepControllerOptions`, `StepController` types

`VizSpec.steps` and `VizStepSpec` (previously stubs) are now fully wired.
