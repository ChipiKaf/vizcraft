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

More walkthroughs and examples: [docs here](https://vizcraft-docs.vercel.app/docs/examples).

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

Run the docs locally (monorepo):

```bash
pnpm install
pnpm -C packages/docs start
```

## 📖 Core Concepts

### The Builder (`VizBuilder`)

The heart of VizCraft is the `VizBuilder`. It allows you to construct a `VizScene` which acts as the blueprint for your visualization.

For exporting frame snapshots during data-only playback, you can export an SVG that includes runtime overrides:

```ts
const svg = builder.svg({ includeRuntime: true });
```

```typescript
b.view(width, height) // Set the coordinate space
  .grid(cols, rows) // (Optional) Define layout grid
  .node(id) // Start defining a node
  .edge(from, to); // Start defining an edge
```

### Plugins

Extend the builder's functionality seamlessly using `.use()`. Plugins are functions that take the builder instance and optional configuration, allowing you to encapsulate reusable behaviors, export utilities, or composite nodes.

```typescript
import { viz, VizPlugin } from 'vizcraft';

const watermarkPlugin: VizPlugin<{ text: string }> = (builder, opts) => {
  builder.node('watermark', {
    at: { x: 50, y: 20 },
    rect: { w: 100, h: 20 },
    label: opts?.text ?? 'Draft',
    opacity: 0.5,
  });
};

viz()
  .view(800, 600)
  .node('n1', { circle: { r: 20 } })
  .use(watermarkPlugin, { text: 'Confidential' })
  .build();
```

**Event Hooks**

Plugins (or your own code) can also tap into the builder's lifecycle using `.on()`. This is particularly useful for interactive plugins that need to append HTML elements (like export buttons or tooltips) after VizCraft mounts the SVG to the DOM.

```typescript
const exportUiPlugin: VizPlugin = (builder) => {
  // Listen for the 'mount' event to inject a button next to the SVG
  builder.on('mount', ({ container }) => {
    const btn = document.createElement('button');
    btn.innerText = 'Download PNG';
    btn.onclick = () => {
      /* export logic */
    };

    // Position the button absolutely over the container
    btn.style.position = 'absolute';
    btn.style.top = '10px';
    btn.style.right = '10px';
    container.appendChild(btn);
  });
};
```

### Declarative Options Overloads

You can also configure nodes and edges in a single declarative call by passing an options object:

```typescript
// Declarative — pass all options at once, returns VizBuilder
b.node('a', {
  at: { x: 100, y: 100 },
  rect: { w: 80, h: 40 },
  fill: 'steelblue',
  label: 'A',
})
  .node('b', { circle: { r: 20 }, at: { x: 300, y: 100 }, label: 'B' })
  .edge('a', 'b', { arrow: true, stroke: 'red', dash: 'dashed' })
  .build();
```

Both `NodeOptions` and `EdgeOptions` types are exported for full type-safety. See the [Essentials docs](https://vizcraft.dev/docs/essentials) for the complete options reference.

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
 .richLabel((l) => l.text('Hello ').bold('World')) // Rich / mixed-format label
 .image(href, w, h, opts?) // Embed an <image> inside the node
 .icon(id, opts?)         // Embed an icon from the icon registry (see registerIcon)
 .svgContent(svg, opts)   // Embed inline SVG content inside the node
 .fill('#f0f0f0')          // Fill color
 .stroke('#333', 2)       // Stroke color and optional width
 .opacity(0.8)            // Opacity
 .dashed()                // Dashed border (8, 4)
 .dotted()                // Dotted border (2, 4)
 .dash('12, 3, 3, 3')     // Custom dash pattern
 .class('css-class')     // Custom CSS class
 .data({ ... })          // Attach custom data
 .port('out', { x: 50, y: 0 }) // Named connection port
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
  .container({ headerHeight: 36 });

b.node('step1').at(150, 220).rect(100, 50).parent('lane');
b.node('step2').at(350, 220).rect(100, 50).parent('lane');
```

Container children are nested inside the container `<g>` in the SVG and follow the container when moved at runtime.

### Edges

Edges connect nodes and can be styled, directed, or animated.
All edges are rendered as `<path>` elements supporting three routing modes.

```typescript
b.edge('n1', 'n2')
  .arrow() // Add an arrowhead
  .straight() // (Default) Straight line
  .label('Connection')
  .richLabel((l) => l.text('p').sup('95').text(' = ').bold('10ms'))
  .animate('flow'); // Add animation

// Curved edge
b.edge('a', 'b').curved().arrow();

// Orthogonal (right-angle) edge
b.edge('a', 'c').orthogonal().arrow();

// Waypoints — intermediate points the edge passes through
b.edge('x', 'y').curved().via(150, 50).via(200, 100).arrow();

// Arbitrary edge metadata (for routing flags, categories, etc.)
b.edge('a', 'b').meta({ customRouting: true, padding: 10 });

// Override edge path computation with a resolver hook
b.setEdgePathResolver((edge, scene, defaultResolver) => {
  if (edge.meta?.customRouting) {
    // Return an SVG path `d` string
    return `M 0 0 L 10 10`;
  }
  return defaultResolver(edge, scene);
});

// Per-edge styling (overrides CSS defaults)
b.edge('a', 'b').stroke('#ff0000', 3).fill('none').opacity(0.8);

// Dashed, dotted, and custom dash patterns
b.edge('a', 'b').dashed().stroke('#6c7086'); // dashed line
b.edge('a', 'b').dotted(); // dotted line
b.edge('a', 'b').dash('12, 3, 3, 3').stroke('#cba6f7'); // custom pattern

// Multi-position edge labels (start / mid / end)
b.edge('a', 'b')
  .label('1', { position: 'start' })
  .label('*', { position: 'end' })
  .arrow();

// Rich text labels (mixed formatting)
b.edge('a', 'b')
  .richLabel((l) => l.text('p').sup('95').text(' ').bold('12ms'))
  .arrow();

// Edge markers / arrowhead types
b.edge('a', 'b').markerEnd('arrowOpen'); // Open arrow (inheritance)
b.edge('a', 'b').markerStart('diamond').markerEnd('arrow'); // UML composition
b.edge('a', 'b').markerStart('diamondOpen').markerEnd('arrow'); // UML aggregation
b.edge('a', 'b').arrow('both'); // Bidirectional arrows
b.edge('a', 'b').markerStart('circleOpen').markerEnd('arrow'); // Association
// Self-loops (exits and enters the same node)
b.edge('n1', 'n1').loopSide('right').loopSize(40).arrow();
b.edge('a', 'b').markerEnd('bar'); // ER cardinality

// Connection ports — edges attach to specific points on nodes
b.node('srv')
  .at(100, 100)
  .rect(80, 60)
  .port('out-1', { x: 40, y: -15 })
  .port('out-2', { x: 40, y: 15 });
b.node('db').at(400, 100).cylinder(80, 60).port('in', { x: -40, y: 0 });
b.edge('srv', 'db').fromPort('out-1').toPort('in').arrow();

// Default ports (no .port() needed) — every shape has built-in ports
b.edge('a', 'b').fromPort('right').toPort('left').arrow();
```

| Method                   | Description                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `.straight()`            | Direct line (default). With waypoints → polyline.                                                                                     |
| `.curved()`              | Smooth bezier curve. With waypoints → Catmull-Rom spline.                                                                             |
| `.orthogonal()`          | Right-angle elbows.                                                                                                                   |
| `.routing(mode)`         | Set mode programmatically.                                                                                                            |
| `.via(x, y)`             | Add an intermediate waypoint (chainable).                                                                                             |
| `.label(text, opts?)`    | Add a text label. Chain multiple calls for multi-position labels. `opts.position` can be `'start'`, `'mid'` (default), or `'end'`.    |
| `.richLabel(cb, opts?)`  | Add a rich / mixed-format label (nested SVG `<tspan>`s). Use `.newline()` in the callback to control line breaks.                     |
| `.arrow([enabled])`      | Shorthand for arrow markers. `true`/no-arg → markerEnd arrow. `'both'` → both ends. `'start'`/`'end'` → specific end. `false` → none. |
| `.markerEnd(type)`       | Set marker type at the target end. See `EdgeMarkerType`.                                                                              |
| `.markerStart(type)`     | Set marker type at the source end. See `EdgeMarkerType`.                                                                              |
| `.fromPort(portId)`      | Connect from a specific named port on the source node.                                                                                |
| `.toPort(portId)`        | Connect to a specific named port on the target node.                                                                                  |
| `.stroke(color, width?)` | Set stroke color and optional width.                                                                                                  |
| `.fill(color)`           | Set fill color.                                                                                                                       |
| `.opacity(value)`        | Set opacity (0–1).                                                                                                                    |
| `.dashed()`              | Dashed stroke (`8, 4`).                                                                                                               |
| `.dotted()`              | Dotted stroke (`2, 4`).                                                                                                               |
| `.dash(pattern)`         | Custom SVG dasharray or preset (`'dashed'`, `'dotted'`, `'dash-dot'`, `'solid'`).                                                     |

**`EdgeMarkerType`** values: `'none'`, `'arrow'`, `'arrowOpen'`, `'diamond'`, `'diamondOpen'`, `'circle'`, `'circleOpen'`, `'square'`, `'bar'`, `'halfArrow'`.

### Animations

See the full Animations guide [docs here](https://vizcraft-docs.vercel.app/docs/animations).

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

- Author with `builder.animate((aBuilder) => ...)`.
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

b.animate((aBuilder) =>
  aBuilder
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

b.animate((aBuilder) =>
  aBuilder
    .edge('a', 'b', 'e1')
    .to({ strokeDashoffset: -120 }, { duration: 900 })
);
```

#### Custom animatable properties (advanced)

Specs can carry adapter extensions so you can animate your own numeric properties:

```ts
b.animate((aBuilder) =>
  aBuilder
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

/* Edge styling (CSS defaults) */
.viz-edge {
  stroke: #ccc;
  stroke-width: 2;
}
```

Edges can also be styled **per-edge** via the builder (inline SVG attributes override CSS):

```ts
b.edge('a', 'b').stroke('#e74c3c', 3).fill('none').opacity(0.8);
```

## 🤝 Contributing

Contributions are welcome! This is a monorepo managed with Turbo.

1. Clone the repo
2. Install dependencies: `pnpm install`
3. Run dev server: `pnpm dev`

## 📄 License

MIT License
