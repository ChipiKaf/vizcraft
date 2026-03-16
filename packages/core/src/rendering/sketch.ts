/** Deterministic filter id for sketch displacement keyed by seed. */
export function sketchFilterId(seed: number): string {
  return `viz-sketch-${seed}`;
}

/** Simple seeded float in [0, 1) derived from a seed via xorshift-like mix. */
export function sketchRand(seed: number, salt: number): number {
  let s = ((seed ^ (salt * 2654435761)) >>> 0) | 1;
  s ^= s << 13;
  s ^= s >>> 17;
  s ^= s << 5;
  return (s >>> 0) / 4294967296;
}

/** Lerp a value between min and max using a seeded random. */
export function sketchLerp(
  seed: number,
  salt: number,
  min: number,
  max: number
): number {
  return min + sketchRand(seed, salt) * (max - min);
}

/** SVG markup for a sketch `<filter>` using dual-pass displacement for a hand-drawn double-stroke look. */
export function sketchFilterSvg(id: string, seed: number): string {
  const s2 = seed + 37;
  // Derive unique per-seed parameters
  const freq2 = sketchLerp(seed, 1, 0.009, 0.015).toFixed(4);
  const scale1 = sketchLerp(seed, 2, 2.5, 4).toFixed(1);
  const scale2 = sketchLerp(seed, 3, 3, 5).toFixed(1);
  const dx = sketchLerp(seed, 4, 0.3, 1.6).toFixed(2);
  const dy = sketchLerp(seed, 5, 0.2, 1.3).toFixed(2);
  return (
    `<filter id="${id}" filterUnits="userSpaceOnUse" x="-10000" y="-10000" width="20000" height="20000">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves="2" seed="${seed}" result="n1"/>` +
    `<feTurbulence type="fractalNoise" baseFrequency="${freq2}" numOctaves="2" seed="${s2}" result="n2"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="n1" scale="${scale1}" xChannelSelector="R" yChannelSelector="G" result="s1"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="n2" scale="${scale2}" xChannelSelector="G" yChannelSelector="R" result="s2"/>` +
    `<feOffset in="s2" dx="${dx}" dy="${dy}" result="s2off"/>` +
    '<feComposite in="s1" in2="s2off" operator="over"/>' +
    '</filter>'
  );
}

/** Resolve the effective sketch seed for a node, falling back to the hash of its id. */
export function resolveSketchSeed(
  nodeStyle: { sketchSeed?: number } | undefined,
  id: string
): number {
  if (nodeStyle?.sketchSeed !== undefined) return nodeStyle.sketchSeed;
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
