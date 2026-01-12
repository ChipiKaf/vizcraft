# VizCraft

**A declarative, builder-based library for creating animated SVG network visualizations and algorithm demos.**

VizCraft is designed to make creating beautiful, animated node-link diagrams and complex visualizations intuitive and powerful. Whether you are building an educational tool, explaining an algorithm, or just need a great looking graph, VizCraft provides the primitives you need.

## ✨ Features

- **Fluent Builder API**: Define your visualization scene using a readable, chainable API.
- **Grid System**: Built-in 2D grid system for easy, structured layout of nodes.
- **Declarative Animations**: Animate layout changes, edge flow, and node states with a simple declarative config.
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

VizCraft supports declarative animations. You define _what_ happens, and the renderer handles the interpolation.

- **`stream`**: Particles flowing along an edge.
- **`pulse`**: Rhythmic scaling or opacity changes.
- **Transition**: Moving a node from one position to another.

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

MIT License © Chipili Kafwilo
