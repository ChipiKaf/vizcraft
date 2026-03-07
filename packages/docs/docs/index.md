---
sidebar_position: 1
slug: /intro
title: Introduction
description: What VizCraft is, who it is for, and how to navigate these docs.
---

# Introduction

Welcome to the **VizCraft** documentation!

VizCraft is a fluent, type-safe SVG scene builder for composing nodes, edges, animations, and overlays — with incremental DOM updates and zero framework dependency.

## What VizCraft does

VizCraft lets you describe a graph or diagram as data, then renders it as SVG. You get:

- **A fluent builder API** — chainable calls like `viz().view().node().edge().build()`.
- **A declarative options API** — pass plain objects when data-driven creation is easier.
- **22 built-in node shapes** — circles, rectangles, diamonds, cylinders, hexagons, stars, clouds, and more.
- **Flexible edge routing** — straight, curved, or orthogonal edges with 10 marker types.
- **A timeline animation system** — data-only `AnimationSpec` with easing, sequencing, and scrubbing.
- **Overlays** — lightweight decorations (signals, data points, labels) hosted on the SVG canvas.
- **Hit testing & pan/zoom** — mathematical hit detection and viewport navigation, framework-free.

## Who these docs are for

| If you are…                    | Start with…                                                     |
| ------------------------------ | --------------------------------------------------------------- |
| Brand-new to VizCraft          | The [Getting Started](/docs/tutorials/getting-started) tutorial |
| Looking for a specific task    | The [How-To Guides](/docs/category/how-to-guides) section       |
| Searching for API details      | The [API Reference](/docs/category/reference) section           |
| Curious about design decisions | The [Explanations](/docs/category/explanations) section         |

## How these docs are organized

The documentation follows the [Diátaxis](https://diataxis.fr/) framework — four distinct types of content, each serving a different need:

- **Tutorials** — Learn by doing. Step-by-step walkthroughs that produce a meaningful result.
- **How-To Guides** — Solve a specific problem. Goal-oriented, minimal theory.
- **Reference** — Authoritative facts about the API. Complete, concise, indexable.
- **Explanations** — Understand the _why_. Architecture, design decisions, background.

## Quick install

```bash
npm install vizcraft
# or
pnpm add vizcraft
```

## Quick example

```typescript
import { viz } from 'vizcraft';

const builder = viz().view(400, 200);
builder.node('a').at(80, 100).circle(24).fill('#89b4fa').label('Hello');
builder.node('b').at(320, 100).rect(80, 40).fill('#a6e3a1').label('World');
builder.edge('a', 'b').arrow();

builder.mount(document.getElementById('my-container')!);
```

Ready to dive in? Head to the [Getting Started tutorial](/docs/tutorials/getting-started).

## Links

- [GitHub Repository](https://github.com/ChipiKaf/vizcraft)
- [npm: vizcraft](https://www.npmjs.com/package/vizcraft)

---

_Found a problem in the docs? [Open an issue](https://github.com/ChipiKaf/vizcraft/issues/new?labels=documentation&title=Docs:+) on GitHub._
