---
"vizcraft": minor
---

Add tooltip/hover info API and text badge API; reduce bundle size.

- **Tooltip API (#109)**: Attach hover info to nodes and edges via `.tooltip(content, opts?)` (fluent) or `tooltip` option (declarative). Supports plain text and structured title/body content, configurable placement and delay.
- **Text Badge API (#108)**: Pin 1–2 character indicators to node corners via `.badge(text, opts?)` (fluent) or `badges` array (declarative). Four corner positions, customisable fill/background/fontSize.
- **Bundle size reduction (#106)**: Tree-shaking improvements via `sideEffects: false`, refined `exports` map, dead code removal, and module extraction.
