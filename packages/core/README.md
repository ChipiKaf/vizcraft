# VizCraft

[![npm version](https://img.shields.io/npm/v/vizcraft.svg)](https://www.npmjs.com/package/vizcraft)
[![npm downloads](https://img.shields.io/npm/dm/vizcraft.svg)](https://www.npmjs.com/package/vizcraft)
[![CI](https://github.com/ChipiKaf/vizcraft/actions/workflows/ci.yml/badge.svg)](https://github.com/ChipiKaf/vizcraft/actions/workflows/ci.yml)
[![Release](https://github.com/ChipiKaf/vizcraft/actions/workflows/release.yml/badge.svg)](https://github.com/ChipiKaf/vizcraft/actions/workflows/release.yml)
[![Snapshot](https://github.com/ChipiKaf/vizcraft/actions/workflows/snapshot.yml/badge.svg)](https://github.com/ChipiKaf/vizcraft/actions/workflows/snapshot.yml)
[![license](https://img.shields.io/npm/l/vizcraft.svg)](LICENSE)

📖 Full documentation: https://vizcraft-docs.vercel.app/

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
  .view(500, 500)
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

More walkthroughs and examples: https://vizcraft-docs.vercel.app/

## 📚 Documentation (Topics)

Full documentation site: https://vizcraft-docs.vercel.app/

For a guided walkthrough, the repo docs are organized like this:

- [Introduction](../../packages/docs/docs/intro.md)
- [Examples](../../packages/docs/docs/examples.mdx)
- [Essentials](../../packages/docs/docs/essentials.mdx)
- [Animations](../../packages/docs/docs/animations/index.mdx)
  - [Animation Builder API](../../packages/docs/docs/animations/animation-builder-api.mdx)
- [Advanced](../../packages/docs/docs/advanced.mdx)
- [Types](../../packages/docs/docs/types.mdx)

Run the docs locally (monorepo):

```bash
pnpm install
pnpm -C packages/docs start
```

## 📖 Core Concepts

### The Builder (`VizBuilder`)

The heart of VizCraft is the `VizBuilder`. It allows you to construct a `VizScene` which acts as the blueprint for your visualization.

```typescript
b.view(width, height) // Set the coordinate space
  .grid(cols, rows) // (Optional) Define layout grid
  .node(id) // Start defining a node
  .edge(from, to); // Start defining an edge
```

### Nodes

Nodes are the primary entities in your graph. They can have shapes, labels, and styles.

```typescript
b.node('n1')
 .at(x, y)               // Absolute position
 // OR
 .cell(col, row)         // Grid position
 .circle(radius)         // Shape definition
 .label('Text', { dy: 5 }) // Label with offset
 .class('css-class')     // Custom CSS class
 .data({ ... })          // Attach custom data
```

### Edges

Edges connect nodes and can be styled, directed, or animated.

```typescript
b.edge('n1', 'n2')
  .arrow() // Add an arrowhead
  .straight() // (Default) Straight line
  .label('Connection')
  .animate('flow'); // Add animation
```

### Animations

See the full Animations guide: https://vizcraft-docs.vercel.app/

VizCraft supports **two complementary animation approaches**:

1. **Registry/CSS animations** (simple, reusable effects)

Attach an animation by name to a node/edge. The default core registry includes:

- `flow` (edge)

```ts
import { viz } from 'vizcraft';

const b = viz().view(520, 160);

b.node('a')
  .at(70, 80)
  .circle(18)
  .label('A')
  .node('b')
  .at(450, 80)
  .rect(70, 44, 10)
  .label('B')
  .edge('a', 'b')
  .arrow()
  .animate('flow', { duration: '1s' })
  .done();
```

2. **Data-only timeline animations (`AnimationSpec`)** (sequenced tweens)

- Author with `builder.animate((anim) => ...)`.
- VizCraft stores compiled specs on the scene as `scene.animationSpecs`.
- Play them with `builder.play()`.

```ts
import { viz } from 'vizcraft';

const b = viz().view(520, 240);

b.node('a')
  .at(120, 120)
  .circle(20)
  .label('A')
  .node('b')
  .at(400, 120)
  .rect(70, 44, 10)
  .label('B')
  .edge('a', 'b')
  .arrow()
  .done();

b.animate((anim) =>
  anim
    .node('a')
    .to({ x: 200, opacity: 0.35 }, { duration: 600 })
    .node('b')
    .to({ x: 440, y: 170 }, { duration: 700 })
    .edge('a->b')
    .to({ strokeDashoffset: -120 }, { duration: 900 })
);

const container = document.getElementById('viz-basic');
if (container) {
  b.mount(container);
  b.play();
}
```

#### Animating edges with custom ids

If you create an edge with a custom id (third arg), target it explicitly in animations:

```ts
const b = viz().view(520, 240);
b.node('a')
  .at(120, 120)
  .circle(20)
  .node('b')
  .at(400, 120)
  .rect(70, 44, 10)
  .edge('a', 'b', 'e1')
  .done();

b.animate((anim) =>
  anim.edge('a', 'b', 'e1').to({ strokeDashoffset: -120 }, { duration: 900 })
);
```

#### Custom animatable properties (advanced)

Specs can carry adapter extensions so you can animate your own numeric properties:

```ts
b.animate((anim) =>
  anim
    .extendAdapter((adapter) => {
      adapter.register?.('node', 'r', {
        get: (target) => adapter.get(target, 'r'),
        set: (target, v) => adapter.set(target, 'r', v),
      });
    })
    .node('a')
    .to({ r: 42 }, { duration: 500 })
);
```

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

/* Edge styling */
.viz-edge {
  stroke: #ccc;
  stroke-width: 2;
}
```

## 🤝 Contributing

Contributions are welcome! This is a monorepo managed with Turbo.

1. Clone the repo
2. Install dependencies: `pnpm install`
3. Run dev server: `pnpm dev`

## 📄 License

MIT License
