import { describe, it, expect } from 'vitest';
import { viz } from './builder';

function stripWhitespace(s: string) {
  return s.replace(/\s+/g, ' ');
}

describe('svg export includeRuntime', () => {
  it('defaults to static export (ignores runtime overrides)', () => {
    const builder = viz().view(200, 120).node('a').at(10, 10).circle(5).done();

    const scene = builder.build();
    scene.nodes[0]!.runtime = {
      x: 80,
      y: 60,
      opacity: 0.25,
      scale: 1.4,
    };

    const svgStatic = stripWhitespace(builder.svg());
    expect(svgStatic).toContain('cx="10"');
    expect(svgStatic).toContain('cy="10"');
    expect(svgStatic).not.toContain('cx="80"');
    expect(svgStatic).not.toContain('opacity: 0.25');
    expect(svgStatic).not.toContain('rotate(');
  });

  it('includes runtime geometry and transforms when includeRuntime=true', () => {
    const builder = viz().view(200, 120).node('a').at(10, 10).circle(5).done();

    const scene = builder.build();
    scene.nodes[0]!.runtime = {
      x: 80,
      y: 60,
      opacity: 0.25,
      scale: 1.4,
      rotation: 15,
    };

    const svgRuntime = stripWhitespace(builder.svg({ includeRuntime: true }));
    expect(svgRuntime).toContain('cx="80"');
    expect(svgRuntime).toContain('cy="60"');
    expect(svgRuntime).toContain('opacity: 0.25');
    expect(svgRuntime).toContain(
      'transform="translate(80 60) rotate(15) scale(1.4) translate(-80 -60)"'
    );
  });

  it('includes runtime edge props only when includeRuntime=true', () => {
    const builder = viz()
      .view(240, 120)
      .node('a')
      .at(40, 60)
      .circle(10)
      .done()
      .node('b')
      .at(200, 60)
      .circle(10)
      .done()
      .edge('a', 'b')
      .stroke('#000', 2)
      .done();

    const scene = builder.build();
    scene.edges[0]!.runtime = { strokeDashoffset: -120, opacity: 0.5 };

    const svgStatic = stripWhitespace(builder.svg());
    expect(svgStatic).not.toContain('stroke-dashoffset="-120"');
    expect(svgStatic).not.toContain('opacity: 0.5');

    const svgRuntime = stripWhitespace(builder.svg({ includeRuntime: true }));
    expect(svgRuntime).toContain('stroke-dashoffset="-120"');
    expect(svgRuntime).toContain('opacity: 0.5');
  });
});
