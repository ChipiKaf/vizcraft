# VizCraft

[![npm version](https://img.shields.io/npm/v/vizcraft.svg)](https://www.npmjs.com/package/vizcraft)
[![npm downloads](https://img.shields.io/npm/dm/vizcraft.svg)](https://www.npmjs.com/package/vizcraft)
[![CI](https://github.com/ChipiKaf/vizcraft/actions/workflows/ci.yml/badge.svg)](https://github.com/ChipiKaf/vizcraft/actions/workflows/ci.yml)
[![Release](https://github.com/ChipiKaf/vizcraft/actions/workflows/release.yml/badge.svg)](https://github.com/ChipiKaf/vizcraft/actions/workflows/release.yml)
[![Snapshot](https://github.com/ChipiKaf/vizcraft/actions/workflows/snapshot.yml/badge.svg)](https://github.com/ChipiKaf/vizcraft/actions/workflows/snapshot.yml)
[![license](https://img.shields.io/npm/l/vizcraft.svg)](LICENSE)

📖 Full documentation: [docs here](https://vizcraft-docs.vercel.app/docs/intro)

**A declarative, builder-based library for creating animated SVG network visualizations and algorithm demos.**

VizCraft is designed to make creating beautiful, animated node-link diagrams and complex visualizations intuitive and powerful. Whether you are building an educational tool, explaining an algorithm, or just need a great looking graph, VizCraft provides the primitives you need.

## ✨ Features

- **Fluent Builder API**: Define your visualization scene using a readable, chainable API.
- **Grid System**: Built-in 2D grid system for easy, structured layout of nodes.
- **Two Animation Systems**: Lightweight registry/CSS animations (e.g. edge `flow`) and data-only timeline animations (`AnimationSpec`).
- **Framework Agnostic**: The core logic is pure TypeScript and can be used with any framework or Vanilla JS.
- **Custom Overlays**: Create complex, custom UI elements that float on top of your visualization.

## 📦 Installation

```bash
npm install vizcraft
# or
pnpm add vizcraft
# or
yarn add vizcraft
```

## 🚀 Getting Started

You can use the core library directly to generate SVG content or mount to a DOM element.

```typescript
import { viz } from 'vizcraft';

const builder = viz().view(800, 600);

builder
  .node('a')
  .at(100, 100)
  .circle(15)
  .label('A')
  .node('b')
  .at(400, 100)
  .circle(15)
  .label('B')
  .edge('a', 'b')
  .arrow();

const container = document.getElementById('viz-basic');
if (container) builder.mount(container);
```

For more examples and best practices, see [docs here](https://vizcraft-docs.vercel.app/docs/examples).

## 📚 Documentation (Topics)

Full documentation site: [docs here](https://vizcraft-docs.vercel.app/docs/intro)

Docs topics (same as the sidebar):

- [Introduction](https://vizcraft-docs.vercel.app/docs/intro)
- [Examples](https://vizcraft-docs.vercel.app/docs/examples)
- [Essentials](https://vizcraft-docs.vercel.app/docs/essentials)
- [Animations](https://vizcraft-docs.vercel.app/docs/animations)
  - [Animation Builder API](https://vizcraft-docs.vercel.app/docs/animations/animation-builder-api)
- [Advanced](https://vizcraft-docs.vercel.app/docs/advanced)
- [Types](https://vizcraft-docs.vercel.app/docs/types)

Run the docs locally:

```bash
pnpm install
pnpm -C packages/docs start
```

## 📖 Core Concepts

### The Builder (`VizBuilder`)
The heart of VizCraft is the `VizBuilder`. It allows you to construct a `VizScene` which acts as the blueprint for your visualization.

```typescript
b.view(width, height)    // Set the coordinate space
 .grid(cols, rows)       // (Optional) Define layout grid
 .node(id)               // Start defining a node
 .edge(from, to)         // Start defining an edge
```

Common lifecycle:

- `builder.build()` creates a serializable `VizScene`.
- `builder.mount(container)` renders into an SVG inside your container.
- `builder.play()` plays any compiled timeline specs.
- `builder.patchRuntime(container)` applies runtime-only updates (useful for per-frame updates without remounting).

### Nodes
Nodes are the primary entities in your graph. They can have shapes, labels, and styles.

```typescript
b.node('n1')
 .at(x, y)               // Absolute position
 // OR
 .cell(col, row)         // Grid position
 .circle(radius)         // Circle shape
 .rect(w, h, [rx])       // Rectangle (optional corner radius)
 .diamond(w, h)          // Diamond shape
 .cylinder(w, h, [arcHeight]) // Cylinder (database symbol)
 .hexagon(r, [orientation])   // Hexagon ('pointy' or 'flat')
 .ellipse(rx, ry)        // Ellipse / oval
 .arc(r, start, end, [closed]) // Arc / pie slice
 .blockArrow(len, bodyW, headW, headLen, [dir]) // Block arrow
 .callout(w, h, [opts])   // Speech bubble / callout
 .cloud(w, h)             // Cloud / thought bubble
 .cross(size, [barWidth])  // Cross / plus sign
 .cube(w, h, [depth])      // 3D isometric cube
 .path(d, w, h)            // Custom SVG path
 .document(w, h, [wave])   // Document (wavy bottom)
 .note(w, h, [foldSize])   // Note (folded corner)
 .parallelogram(w, h, [skew]) // Parallelogram (I/O)
 .star(points, outerR, [innerR]) // Star / badge
 .trapezoid(topW, bottomW, h) // Trapezoid
 .triangle(w, h, [direction]) // Triangle
 .label('Text', { dy: 5 }) // Label with offset
 .class('css-class')     // Custom CSS class
 .data({ ... })          // Attach custom data
 .container(config?)     // Mark as container / group node
 .parent('containerId')  // Make child of a container
```

### Container / Group Nodes

Group related nodes into visual containers (swimlanes, sub-processes, etc.).

```typescript
b.node('lane')
 .at(250, 170)
 .rect(460, 300)
 .label('Process Phase')
 .container({ headerHeight: 36 })

b.node('step1').at(150, 220).rect(100, 50).parent('lane')
b.node('step2').at(350, 220).rect(100, 50).parent('lane')
```

Container children are nested inside the container `<g>` in the SVG and follow the container when moved at runtime.

### Edges
Edges connect nodes and can be styled, directed, or animated.
All edges are rendered as `<path>` elements supporting three routing modes.

```typescript
b.edge('n1', 'n2')
 .arrow()                // Add an arrowhead
 .straight()             // (Default) Straight line
 .label('Connection')
 .animate('flow')        // Add animation

// Curved edge
b.edge('a', 'b').curved().arrow()

// Orthogonal (right-angle) edge
b.edge('a', 'c').orthogonal().arrow()

// Waypoints — intermediate points the edge passes through
b.edge('x', 'y').curved().via(150, 50).via(200, 100).arrow()

// Per-edge styling (overrides CSS defaults)
b.edge('a', 'b').stroke('#ff0000', 3).fill('none').opacity(0.8)

// Multi-position edge labels (start / mid / end)
b.edge('a', 'b')
 .label('1', { position: 'start' })
 .label('*', { position: 'end' })
 .arrow()

// Edge markers / arrowhead types
b.edge('a', 'b').markerEnd('arrowOpen')                    // Open arrow (inheritance)
b.edge('a', 'b').markerStart('diamond').markerEnd('arrow')  // UML composition
b.edge('a', 'b').markerStart('diamondOpen').markerEnd('arrow')  // UML aggregation
b.edge('a', 'b').arrow('both')                              // Bidirectional arrows
b.edge('a', 'b').markerStart('circleOpen').markerEnd('arrow')   // Association
b.edge('a', 'b').markerEnd('bar')                           // ER cardinality
```

| Method | Description |
|--------|-------------|
| `.straight()` | Direct line (default). With waypoints → polyline. |
| `.curved()` | Smooth bezier curve. With waypoints → Catmull-Rom spline. |
| `.orthogonal()` | Right-angle elbows. |
| `.routing(mode)` | Set mode programmatically. |
| `.via(x, y)` | Add an intermediate waypoint (chainable). |
| `.label(text, opts?)` | Add a text label. Chain multiple calls for multi-position labels. `opts.position` can be `'start'`, `'mid'` (default), or `'end'`. |
| `.arrow([enabled])` | Shorthand for arrow markers. `true`/no-arg → markerEnd arrow. `'both'` → both ends. `'start'`/`'end'` → specific end. `false` → none. |
| `.markerEnd(type)` | Set marker type at the target end (see `EdgeMarkerType`). |
| `.markerStart(type)` | Set marker type at the source end (see `EdgeMarkerType`). |
| `.stroke(color, width?)` | Set stroke color and optional width. |
| `.fill(color)` | Set fill color. |
| `.opacity(value)` | Set opacity (0–1). |

**`EdgeMarkerType`** values: `'none'`, `'arrow'`, `'arrowOpen'`, `'diamond'`, `'diamondOpen'`, `'circle'`, `'circleOpen'`, `'square'`, `'bar'`, `'halfArrow'`.

### Animations

See the full Animations guide [docs here](https://vizcraft-docs.vercel.app/docs/animations).

VizCraft supports **two complementary animation approaches**:

1) **Registry/CSS animations** (simple, reusable effects)

Attach an animation by name to a node/edge. The default core registry includes:

- `flow` (edge)

```ts
import { viz } from 'vizcraft';

const b = viz().view(520, 160);

b.node('a').at(70, 80).circle(18).label('A')
 .node('b').at(450, 80).rect(70, 44, 10).label('B')
 .edge('a', 'b')
 .arrow()
 .animate('flow', { duration: '1s' })
 .done();
```

2) **Data-only timeline animations (`AnimationSpec`)** (sequenced tweens)

- Author with `builder.animate((aBuilder) => ...)`.
- VizCraft stores compiled specs on the scene as `scene.animationSpecs`.
- Play them with `builder.play()`.

```ts
import { viz } from 'vizcraft';

const b = viz().view(520, 240);

b.node('a').at(120, 120).circle(20).label('A')
 .node('b').at(400, 120).rect(70, 44, 10).label('B')
 .edge('a', 'b').arrow()
 .done();

// Create + store a data-only AnimationSpec
b.animate((aBuilder) =>
  aBuilder
    .node('a').to({ x: 200, opacity: 0.35 }, { duration: 600 })
    .node('b').to({ x: 440, y: 170 }, { duration: 700 })
    .edge('a->b').to({ strokeDashoffset: -120 }, { duration: 900 })
);

const container = document.getElementById('viz-basic');
if (container) {
  b.mount(container);
  b.play(); // Warns + no-ops if mount wasn't called
}
```

#### Animating edges with custom ids

Edges can have any id (you can pass it as the optional third argument to `builder.edge(from, to, id)`):

```ts
const b = viz().view(520, 240);
b.node('a').at(120, 120).circle(20).label('A')
 .node('b').at(400, 120).rect(70, 44, 10).label('B')
 .edge('a', 'b', 'e1').arrow()
 .done();

b.animate((aBuilder) =>
  aBuilder.edge('a', 'b', 'e1').to({ strokeDashoffset: -120 }, { duration: 900 })
);
```

When you don’t provide an explicit edge id, the default convention is `"from->to"`.

#### Custom animatable properties (advanced)

You can animate properties that aren’t in the core set by extending the adapter for a specific spec:

```ts
b.animate((aBuilder) =>
  aBuilder
    .extendAdapter((adapter) => {
      // adapter may support register(kind, prop, { get, set })
      adapter.register?.('node', 'r', {
        get: (target) => adapter.get(target, 'r'),
        set: (target, v) => adapter.set(target, 'r', v),
      });
    })
    .node('a')
    .to({ r: 42 }, { duration: 500 })
);
```

See the docs for the recommended `get/set` implementations for SVG attributes.

### Playback controls

`builder.play()` returns a controller with `pause()`, `play()` (resume), and `stop()`.

```ts
const controller = b.play();
controller?.pause();
controller?.play();
controller?.stop();
```

### Supported properties (core adapter)

Out of the box, timeline playback supports these numeric properties:

- Node: `x`, `y`, `opacity`, `scale`, `rotation`
- Edge: `opacity`, `strokeDashoffset`

## 🎨 Styling

VizCraft generates standard SVG elements with predictable classes, making it easy to style with CSS.

```css
/* Custom node style */
.viz-node-shape {
  fill: #fff;
  stroke: #333;
  stroke-width: 2px;
}

/* Specific node class */
.my-node .viz-node-shape {
  fill: #ff6b6b;
}

/* Edge styling (CSS defaults) */
.viz-edge {
  stroke: #ccc;
  stroke-width: 2;
}
```

Edges can also be styled **per-edge** via the builder (inline SVG attributes override CSS):

```ts
b.edge('a', 'b').stroke('#e74c3c', 3).fill('none').opacity(0.8)
```

## 🧭 Advanced Topics

For deeper guides and API references, see [docs here](https://vizcraft-docs.vercel.app/docs/advanced).

- **Interactivity**: attach `onClick` handlers to nodes/edges.
- **Overlays**: add non-node/edge visuals using `.overlay(id, params, key?)`.
- **React integration**: see the workspace package [packages/react-vizcraft](packages/react-vizcraft) (monorepo).

## 🤝 Contributing

Contributions are welcome! This is a monorepo managed with Turbo.

1. Clone the repo
2. Install dependencies: `pnpm install`
3. Run dev server: `pnpm dev`

## 📄 License

MIT License
