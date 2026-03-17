# vizcraft

## 1.10.1

### Patch Changes

- [#120](https://github.com/ChipiKaf/vizcraft/pull/120) [`df0fc64`](https://github.com/ChipiKaf/vizcraft/commit/df0fc644dbe07e4d6b8a0aae04c554f69efcc993) Thanks [@ChipiKaf](https://github.com/ChipiKaf)! - Fix entry height calculation to account for text wrapping when `maxWidth` is set on compartment entries. Entries that wrap to multiple lines now correctly compute their height and y-offsets, preventing overlap with subsequent entries.

## 1.10.0

### Minor Changes

- [`9715342`](https://github.com/ChipiKaf/vizcraft/commit/9715342cc6956aa34437959daa523430c8d0787e) Thanks [@ChipiKaf](https://github.com/ChipiKaf)! - Add compartment entry-level interactivity (#116): per-entry `.entry(id, text, opts?)` API on CompartmentBuilder with click handlers, tooltips, hover highlighting (`viz-entry-hover`), per-entry styling, and `entryId` in `hitTest()` results.

## 1.9.0

### Minor Changes

- [#110](https://github.com/ChipiKaf/vizcraft/pull/110) [`3ebfa5b`](https://github.com/ChipiKaf/vizcraft/commit/3ebfa5b082a8a6d37fc1bdfce95c0c9ecbedfd6c) Thanks [@ChipiKaf](https://github.com/ChipiKaf)! - Add compartmented node layout (UML-style multi-section nodes). Nodes can be divided into horizontal compartments separated by divider lines using the new `.compartment(id, cb?)` fluent API or the declarative `compartments` array in `NodeOptions`. Compartment heights are auto-sized from label content. Hit-testing returns `compartmentId` when clicking inside a specific section.

- [`5d29b3e`](https://github.com/ChipiKaf/vizcraft/commit/5d29b3e04862ef7d99a4196f568d3e44101a4f9e) Thanks [@ChipiKaf](https://github.com/ChipiKaf)! - Add tooltip/hover info API and text badge API; reduce bundle size.
  - **Tooltip API (#109)**: Attach hover info to nodes and edges via `.tooltip(content, opts?)` (fluent) or `tooltip` option (declarative). Supports plain text and structured title/body content, configurable placement and delay.
  - **Text Badge API (#108)**: Pin 1–2 character indicators to node corners via `.badge(text, opts?)` (fluent) or `badges` array (declarative). Four corner positions, customisable fill/background/fontSize.
  - **Bundle size reduction (#106)**: Tree-shaking improvements via `sideEffects: false`, refined `exports` map, dead code removal, and module extraction.

## 1.8.0

### Minor Changes

- [`dd6f311`](https://github.com/ChipiKaf/vizcraft/commit/dd6f311f3c89e78e85d66a85eb6df68b04c38aba) Thanks [@ChipiKaf](https://github.com/ChipiKaf)! - Add async layout support and `getNodeBoundingBox` utility. `LayoutAlgorithm` now accepts async algorithms via the new `.layoutAsync()` builder method. `getNodeBoundingBox(shape)` returns a tight axis-aligned bounding box for any `NodeShape`, accounting for orientation, direction, and pointer height.

## 1.7.1

### Patch Changes

- [#101](https://github.com/ChipiKaf/vizcraft/pull/101) [`c5084ad`](https://github.com/ChipiKaf/vizcraft/commit/c5084ad12a36b545df987cd425fd431cfb9903d4) Thanks [@ChipiKaf](https://github.com/ChipiKaf)! - Fix `resolveEdgeGeometry`: `startAnchor`/`endAnchor` now return the true boundary/port positions where the edge exits/enters each node, instead of the ~15%/~85% label positions. Added `startLabel` and `endLabel` fields as explicit aliases for the label positions. For self-loops, anchors correspond to the exit/entry points on the node boundary.

## 1.7.0

### Minor Changes

- [#98](https://github.com/ChipiKaf/vizcraft/pull/98) [`b513c21`](https://github.com/ChipiKaf/vizcraft/commit/b513c21308d115b0634cf63a0c63b3708684a172) Thanks [@ChipiKaf](https://github.com/ChipiKaf)! - Add `resolveEdgeGeometry(scene, edgeId)` convenience function that resolves all rendered geometry for an edge in a single call — node lookup, self-loop detection, port/angle/boundary anchors, waypoints, routing, SVG path, midpoint, and label positions. Also exports `resolveEdgeGeometryFromData` for batch processing with a pre-built node map.

## 1.6.0

### Minor Changes

- [`8020286`](https://github.com/ChipiKaf/vizcraft/commit/8020286d96d210f932a493184d820111e8c9ac7d) Thanks [@ChipiKaf](https://github.com/ChipiKaf)! - Added fromProt and toPort to attach edges to specific edges. Updated documentation to follow Diátaxis structure

## 1.5.0

### Minor Changes

- [`0560204`](https://github.com/ChipiKaf/vizcraft/commit/05602041266c5cb49b708b84c02b440584842d15) Thanks [@ChipiKaf](https://github.com/ChipiKaf)! - Added support for generation of 'n' equidistant ports for a given shape

## 1.4.0

### Minor Changes

- [#86](https://github.com/ChipiKaf/vizcraft/pull/86) [`04df81d`](https://github.com/ChipiKaf/vizcraft/commit/04df81dfa0e2f6f4a54232f28382d285de3030c6) Thanks [@ChipiKaf](https://github.com/ChipiKaf)! - Support dangling edges with free endpoints (source-only or target-only) for interactive diagrams. Added `danglingEdge()` builder method, `fromAt()`/`toAt()` on `EdgeBuilder`, and made `VizEdge.from`/`VizEdge.to` optional. Dangling edges work with all edge features including routing, markers, labels, styling, hit testing, SVG export, and DOM mounting.

- [#88](https://github.com/ChipiKaf/vizcraft/pull/88) [`28390fc`](https://github.com/ChipiKaf/vizcraft/commit/28390fc49d614dbb5c5f3c6a576b52a527a2b4dc) Thanks [@ChipiKaf](https://github.com/ChipiKaf)! - - Add freeform perimeter anchors for edges (`fromAngle` / `toAngle`). Edges can now leave or arrive at a fixed angle on any node shape, overriding the default boundary projection. Supported via fluent `.fromAngle(deg)` / `.toAngle(deg)` methods and declarative `EdgeOptions`. Also exports `computeNodeAnchorAtAngle(node, angleDeg)` for advanced use.
  - Support dangling edges with free endpoints (source-only or target-only) for interactive diagrams. Added `danglingEdge()` builder method, `fromAt()`/`toAt()` on `EdgeBuilder`, and made `VizEdge.from`/`VizEdge.to` optional. Dangling edges work with all edge features including routing, markers, labels, styling, hit testing, SVG export, and DOM mounting.

## 1.3.1

### Patch Changes

- [`086ef9e`](https://github.com/ChipiKaf/vizcraft/commit/086ef9e7b5d505cbb03f955e8d24297fb60a6b3e) Thanks [@ChipiKaf](https://github.com/ChipiKaf)! - The fix prevents commit() from using a stale cached runtimePatchCtx (which could reference detached DOM elements) by always recreating it after \_renderSceneToDOM, and removes the redundant strokeDasharray write from patchRuntime so that base style is owned by a single write path.

## 1.3.0

### Minor Changes

- [`3f55212`](https://github.com/ChipiKaf/vizcraft/commit/3f55212e56557994710d65a99fe339c6826cb2a7) Thanks [@ChipiKaf](https://github.com/ChipiKaf)! - Add new visual styling options for nodes and edges: a hand-drawn "sketch" rendering mode, configurable drop-shadow support for nodes, and node stroke dasharray (dashed strokes)

## 1.2.0

### Minor Changes

- [`f72dc04`](https://github.com/ChipiKaf/vizcraft/commit/f72dc0405ccd752ad13eb746349b6a5945448c79) Thanks [@ChipiKaf](https://github.com/ChipiKaf)! - Added rich text labels to VizCraft with support for mixed formatting and line breaks. Introduced fluent .richLabel() APIs and declarative label.rich support. Improved runtime updates to keep animations stable, extended React rendering, and added test coverage. Docs and READMEs now include a live example.

## 1.1.0

### Minor Changes

- [`86655bf`](https://github.com/ChipiKaf/vizcraft/commit/86655bf59c9641af18416b79d0775212a9ecd15e) Thanks [@ChipiKaf](https://github.com/ChipiKaf)! - Added support for incremental scene updates, node resizing, JSON serialization/deserialization, viewport pan and zoom functionality, multi-line labels with text wrapping, declarative API options for nodes and edges, and custom dashed/dotted edge line styles.

## 1.0.0

### Major Changes

- [`73ee1fb`](https://github.com/ChipiKaf/vizcraft/commit/73ee1fbd204bf1ba0447c764eba2c1b9d6981ee5) Thanks [@ChipiKaf](https://github.com/ChipiKaf)! - Added new shapes, connection ports, path based edges, Edge marker types, Multi-position edge labels, Containers and The overlay builder

## 0.3.0

### Minor Changes

- [`c5ffe75`](https://github.com/ChipiKaf/vizcraft/commit/c5ffe7546a2e2148618db057c24aea01ecf097e0) Thanks [@ChipiKaf](https://github.com/ChipiKaf)! - Add improved overlay api

## 0.2.2

### Patch Changes

- [`7c9eb18`](https://github.com/ChipiKaf/vizcraft/commit/7c9eb185e727bde899b4779c4661d8b176db8549) Thanks [@ChipiKaf](https://github.com/ChipiKaf)! - update documentation

## 0.2.1

### Patch Changes

- [`f8fd369`](https://github.com/ChipiKaf/vizcraft/commit/f8fd369ca32a4653059f8e6697a17dcea56edc8c) Thanks [@ChipiKaf](https://github.com/ChipiKaf)! - Update documentation

## 0.2.0

### Minor Changes

- [`c3984f2`](https://github.com/ChipiKaf/vizcraft/commit/c3984f200af3a3388b3a52f38fb068c8bc955ba1) Thanks [@ChipiKaf](https://github.com/ChipiKaf)! - Implemented the animation builder api

## 0.1.5

### Patch Changes

- [`ecb5ade`](https://github.com/ChipiKaf/vizcraft/commit/ecb5adef774e30589a0714699ccdb7839530bd50) Thanks [@ChipiKaf](https://github.com/ChipiKaf)! - update docs with correct code snippets

## 0.1.4

### Patch Changes

- [`10926fc`](https://github.com/ChipiKaf/vizcraft/commit/10926fcce211d00dfba2697eaac62948ac0ef69d) Thanks [@ChipiKaf](https://github.com/ChipiKaf)! - update readme

## 0.1.3

### Patch Changes

- [`7bae122`](https://github.com/ChipiKaf/vizcraft/commit/7bae122aa03cd25f55c8932d7c1c624d64ac2271) Thanks [@ChipiKaf](https://github.com/ChipiKaf)! - update readme

## 0.1.2

### Patch Changes

- [`f3e7c2d`](https://github.com/ChipiKaf/vizcraft/commit/f3e7c2dc01627abfe69c5e47381a1384904e360e) Thanks [@ChipiKaf](https://github.com/ChipiKaf)! - update package lock with correct details to fix publishing issue

## 0.1.1

### Patch Changes

- [`0d9ea7c`](https://github.com/ChipiKaf/vizcraft/commit/0d9ea7c4a59ef8d629b0c126b709f331d0c15e20) Thanks [@ChipiKaf](https://github.com/ChipiKaf)! - update access in config to public

## 0.1.0

### Minor Changes

- [`184a4ae`](https://github.com/ChipiKaf/vizcraft/commit/184a4ae8d664aeb96296f73a5975a900a6155ad9) Thanks [@ChipiKaf](https://github.com/ChipiKaf)! - Initial release of Vizcraft, a fluent, type-safe SVG scene builder for composing nodes, edges, animations, and overlays with incremental DOM updates and no framework dependency.
