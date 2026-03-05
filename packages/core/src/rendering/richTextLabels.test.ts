// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { viz } from './builder';
import { renderSvgText } from './textUtils';
import { patchRuntime, type RuntimePatchCtx } from './runtimePatcher';

function stripWhitespace(s: string) {
  return s.replace(/\s+/g, ' ');
}

describe('rich text labels', () => {
  it('renders nested tspans + links in SVG export', () => {
    const builder = viz()
      .view(240, 120)
      .node('a')
      .at(60, 60)
      .circle(12)
      .richLabel((r) =>
        r
          .text('Hello ')
          .bold('World')
          .text(' ')
          .link('Docs', 'https://example.com')
          .newline()
          .sup('2')
          .text(' + ')
          .sub('n')
          .text(' ')
          .code('x')
      )
      .done();

    const svg = stripWhitespace(builder.svg());

    // Line-start tspans are tagged so runtime patching can update only them.
    expect(svg).toContain('data-viz-role="text-line"');

    // Nested span formatting is expressed via tspan attributes.
    expect(svg).toContain('font-weight="bold"');
    expect(svg).toContain('<a href="https://example.com">');
    expect(svg).toContain('baseline-shift="super"');
    expect(svg).toContain('baseline-shift="sub"');
    expect(svg).toContain('font-family="monospace"');

    // Ensure we rendered at least 2 lines (newline token).
    const lineCount = (svg.match(/data-viz-role="text-line"/g) ?? []).length;
    expect(lineCount).toBeGreaterThanOrEqual(2);
  });

  it('renderSvgText adds default font-size for sub/sup when omitted', () => {
    const rich = {
      kind: 'rich' as const,
      tokens: [
        { kind: 'span' as const, text: 'H' },
        { kind: 'span' as const, text: '2', baselineShift: 'sub' as const },
        { kind: 'span' as const, text: 'O' },
      ],
    };

    const svgText = stripWhitespace(renderSvgText(10, 10, rich));
    expect(svgText).toContain('baseline-shift="sub"');
    expect(svgText).toContain('font-size="0.8em"');
  });

  it('patchRuntime only syncs x on line-start tspans (not nested spans)', () => {
    const builder = viz()
      .view(240, 120)
      .node('a')
      .at(10, 10)
      .circle(5)
      .richLabel((r) => r.text('A').bold('B'))
      .done();

    const scene = builder.build();
    const node = scene.nodes[0]!;
    node.runtime = { x: 100, y: 100 };

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg') as unknown as SVGSVGElement;
    const group = document.createElementNS(ns, 'g') as SVGGElement;
    const shape = document.createElementNS(
      ns,
      'circle'
    ) as unknown as SVGElement;

    // Use the same rich text renderer to build label tspans.
    const labelMarkup = renderSvgText(10, 10, node.label!.rich!);
    const parsed = new DOMParser().parseFromString(
      `<svg xmlns="${ns}">${labelMarkup}</svg>`,
      'image/svg+xml'
    );
    const label = parsed.querySelector('text') as unknown as SVGTextElement;

    const ctx: RuntimePatchCtx = {
      svg,
      edgePathResolver: null,
      nodeGroupsById: new Map([[node.id, group]]),
      nodeShapesById: new Map([[node.id, shape]]),
      nodeLabelsById: new Map([[node.id, label]]),
      nodeImagesById: new Map(),
      nodeIconsById: new Map(),
      nodeSvgsById: new Map(),
      edgeGroupsById: new Map(),
      edgeLinesById: new Map(),
      edgeHitsById: new Map(),
      edgeLabelsById: new Map(),
    };

    const lineTspan = label.querySelector(
      'tspan[data-viz-role="text-line"]'
    ) as SVGTSpanElement;
    const nestedTspan = label.querySelector(
      'tspan[data-viz-role="text-line"] tspan'
    ) as SVGTSpanElement;

    expect(lineTspan.getAttribute('x')).toBe('10');
    expect(nestedTspan.getAttribute('x')).toBeNull();

    patchRuntime(scene, ctx);

    expect(label.getAttribute('x')).toBe('100');
    expect(lineTspan.getAttribute('x')).toBe('100');
    expect(nestedTspan.getAttribute('x')).toBeNull();
  });
});
