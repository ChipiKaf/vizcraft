---
'vizcraft': minor
---

Add structural and semantic diagramming to the declarative spec (`fromSpec`): container groups, zones, auto-layout, edge ports & smart routing, semantic kinds, legends/titles/notes, collapse/expand, focus, and container-aware signals.

**Containers (FR-1).** `type: 'group'` nodes own children declared via `parent`. Groups auto-size to hug their children plus `padding`, render the label in a header strip (`labelPlacement`), nest recursively, and move all descendants with them (`parentId` in the built scene). Flat specs compile byte-identically — fully backward compatible.

**Zones (FR-2).** `type: 'zone'` nodes render as dashed, faintly tinted regions behind real nodes with a corner label. Membership is explicit (`zone: '<id>'` on members) or geometric (pinned bounds); zones never re-parent members and can overlap groups.

**Ports & routing (FR-3).** Edge endpoints accept `nodeId.port` suffixes (`n`/`e`/`s`/`w` side aliases plus named ports from `NodeSpec.ports`), or the declarative `fromPort`/`toPort` fields. Edges that cross a group boundary automatically exit through the container wall with clean orthogonal stubs. `routing: 'avoid'` routes orthogonally around other nodes/containers via a deterministic A\* router. Parallel edges between the same node pair fan out with consistent gap spacing.

**Auto-layout (FR-4).** `x`/`y` are now optional. `view.layout` and per-group `layout` select deterministic engines — `layered` (rank-based DAG), `grid`, `stack`, `manual` — with `direction` and `spacing` controls. Pinned coordinates always win; mixed pin/auto mode works. Container children lay out inside the parent using the parent's engine.

**Semantic kinds (FR-5).** `kind` on edges (`sync`, `async`, `data`, `contains`, `contributes-to`, `event`) and nodes (`service`, `datastore`, `external`, `queue`, `ui`) maps to built-in visual tokens. A diagram-level `theme` block overrides or extends the palette in one place; explicit per-element styles win last.

**Legend, title, notes (FR-6).** `legend: 'auto'` renders a legend of every kind actually used (explicit entries and positioning also supported). `view.title`/`view.subtitle` render in a fixed header band that offsets auto-laid content. `type: 'note'` nodes render sticky-note annotations, and `anchor: '<nodeId>'` places them beside the anchor with a dotted leader line.

**Collapse & focus (FR-7).** `collapsed: true` renders a group as a summary node with a hidden-child-count badge; edges to hidden descendants re-terminate on the group and dedupe. Clicking a group toggles collapse/expand at runtime. `focus: '<id>'` dims everything not connected to the chosen node/group.

**Container-aware signals (FR-8).** Signal overlays now follow the rendered edge path **by default** — waypoints, curves, orthogonal and boundary routing — instead of interpolating centre-to-centre; reverse hops sample the path backwards, parallel edges resolve to the first declared one (`edgeId` pins a specific edge), and `followEdge: false` restores straight interpolation. Chains can reference group ids (the dot travels to the group boundary), and step `highlight` entries naming a group expand to the frame plus all descendants.

New exports: `compileSpec`, `CompiledSpec`, `ResolvedNode`, `ResolvedEdge`, plus spec types (`NodeTypeSpec`, `LayoutEngineSpec`, `EdgeKindToken`, `NodeKindToken`, `VizThemeSpec`, `LegendSpec`, `ViewSpec`, …).
