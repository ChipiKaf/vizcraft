/**
 * Utilities for SVG text measuring and wrapping.
 *
 * SVG `<text>` elements do not natively support word wrapping.
 * This module provides functions to approximate text width and
 * generate multi-line `<tspan>` nodes.
 */

import type { RichText, RichTextToken } from './types';

// Rough approximation of character widths relative to font-size.
// Without DOM measurement, we assume an average character is ~0.6em wide,
// with some tweaks for caps/narrow chars if needed (simplified here).
const AVG_CHAR_WIDTH_RATIO = 0.6;

/**
 * Split text into lines based on explicit newlines and/or maxWidth word wrapping.
 */
export function wrapText(
  text: string,
  maxWidth?: number,
  fontSize: number = 12
): string[] {
  const explicitLines = text.split('\n');
  if (!maxWidth) return explicitLines;

  const wrappedLines: string[] = [];
  const approxMaxChars = Math.max(
    1,
    Math.floor(maxWidth / (fontSize * AVG_CHAR_WIDTH_RATIO))
  );

  for (const line of explicitLines) {
    if (line.length <= approxMaxChars) {
      wrappedLines.push(line);
      continue;
    }

    const words = line.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (testLine.length <= approxMaxChars) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          wrappedLines.push(currentLine);
          currentLine = word;
        } else {
          // Word itself is longer than maxChars, force break it or keep it
          // depending on overflow behavior (for now, we just keep it on one line)
          wrappedLines.push(word);
          currentLine = '';
        }
      }
    }
    if (currentLine) {
      wrappedLines.push(currentLine);
    }
  }

  return wrappedLines;
}

/**
 * Default line height multiplier.
 */
export const DEFAULT_LINE_HEIGHT = 1.2;

export interface RenderTextOptions {
  className?: string;
  fill?: string;
  fontSize?: number | string;
  fontWeight?: number | string;
  textAnchor?: 'start' | 'middle' | 'end';
  dominantBaseline?: string;

  maxWidth?: number;
  lineHeight?: number;
  verticalAlign?: 'top' | 'middle' | 'bottom';
  overflow?: 'visible' | 'ellipsis' | 'clip';
}

/**
 * Returns an SVG `<text>` element string containing `<tspan>` children
 * for multi-line text.
 *
 * @param x x coordinate of the text anchor
 * @param y base y coordinate
 * @param text the raw text string (may contain \n)
 * @param options layout and styling options
 */
export function renderSvgText(
  x: number,
  y: number,
  text: string | RichText,
  options: RenderTextOptions = {}
): string {
  const {
    className = '',
    fill,
    fontSize,
    fontWeight,
    textAnchor = 'middle',
    dominantBaseline = 'middle',
    maxWidth,
    lineHeight = DEFAULT_LINE_HEIGHT,
    verticalAlign = 'middle',
    overflow,
  } = options;

  // Resolve numeric font size for wrapping
  let numericFontSize = 12; // fallback
  if (typeof fontSize === 'number') {
    numericFontSize = fontSize;
  } else if (typeof fontSize === 'string') {
    const parsed = parseFloat(fontSize);
    if (!isNaN(parsed)) numericFontSize = parsed;
  }

  const isRich = typeof text !== 'string';

  let plainLines: string[] = [];
  let richLines: Array<Array<Extract<RichTextToken, { kind: 'span' }>>> = [];

  if (!isRich) {
    plainLines = wrapText(text, maxWidth, numericFontSize);

    if (maxWidth && overflow && overflow !== 'visible') {
      // Very basic ellipsis logic for now - just truncate to first 2 lines
      // Real robust ellipsis in purely string SVG generation is complex
      if (overflow === 'ellipsis' && plainLines.length > 2) {
        const line2 = plainLines[1];
        if (line2) {
          plainLines = [
            plainLines[0]!,
            line2.substring(0, Math.max(0, line2.length - 3)) + '...',
          ];
        }
      } else if (overflow === 'clip' && plainLines.length > 2) {
        plainLines = [plainLines[0]!, plainLines[1]!];
      }
    }
  } else {
    richLines = splitRichTextIntoLines(text.tokens);
  }

  const attrs: string[] = [];
  if (fill !== undefined) attrs.push(`fill="${fill}"`);
  if (fontSize !== undefined) attrs.push(`font-size="${fontSize}"`);
  if (fontWeight !== undefined) attrs.push(`font-weight="${fontWeight}"`);
  attrs.push(`text-anchor="${textAnchor}"`);

  // Only apply dominant-baseline if it evaluates to a single line safely,
  // or apply to the group. Usually best on the <text> element.
  if (dominantBaseline) attrs.push(`dominant-baseline="${dominantBaseline}"`);

  const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';

  // Calculate vertical starting offset based on alignment
  // 'middle' means the *center* of the line block is at (x,y).
  // 'top' means the *top* of the first line is at y.
  // 'bottom' means the *bottom* of the last line is at y.

  const totalLines = isRich ? richLines.length : plainLines.length;
  let startDyEm = 0;

  if (verticalAlign === 'middle') {
    // If 1 line, dy=0.
    // If 2 lines, dy=-0.6em (half a line up).
    // If 3 lines, dy=-1.2em (one full line up).
    startDyEm = -((totalLines - 1) * lineHeight) / 2;
  } else if (verticalAlign === 'bottom') {
    startDyEm = -((totalLines - 1) * lineHeight);
  } else if (verticalAlign === 'top') {
    startDyEm = 0; // The first line's dominant-baseline is already centered or top-aligned based on dominantBaseline attr
  }

  const tspans = isRich
    ? richLines.map((lineTokens, i) => {
        const dy = dyForLine(i, startDyEm, lineHeight);
        const inner = lineTokens
          .map((tok) => renderRichSpanTspan(tok))
          .join('');
        return `<tspan data-viz-role="text-line" x="${x}" dy="${dy}">${inner}</tspan>`;
      })
    : plainLines.map((line, i) => {
        const dy = dyForLine(i, startDyEm, lineHeight);
        return `<tspan data-viz-role="text-line" x="${x}" dy="${dy}">${escapeXmlString(line)}</tspan>`;
      });

  return `<text x="${x}" y="${y}" class="${className}"${attrStr}>${tspans.join('')}</text>`;
}

function dyForLine(i: number, startDyEm: number, lineHeight: number): string {
  if (i === 0) return startDyEm === 0 ? '0' : `${startDyEm}em`;
  return `${lineHeight}em`;
}

function splitRichTextIntoLines(
  tokens: RichTextToken[]
): Array<Array<Extract<RichTextToken, { kind: 'span' }>>> {
  const lines: Array<Array<Extract<RichTextToken, { kind: 'span' }>>> = [[]];

  for (const tok of tokens) {
    if (tok.kind === 'newline') {
      lines.push([]);
      continue;
    }
    if (tok.kind === 'span') {
      lines[lines.length - 1]!.push(tok);
    }
  }

  // Ensure we always render at least one line.
  if (lines.length === 0) return [[]];
  return lines;
}

function renderRichSpanTspan(tok: Extract<RichTextToken, { kind: 'span' }>) {
  const attrs: string[] = [];

  if (tok.className) attrs.push(`class="${escapeXmlAttr(tok.className)}"`);
  if (tok.fill !== undefined) attrs.push(`fill="${escapeXmlAttr(tok.fill)}"`);
  if (tok.fontSize !== undefined) attrs.push(`font-size="${tok.fontSize}"`);

  if (tok.fontFamily)
    attrs.push(`font-family="${escapeXmlAttr(tok.fontFamily)}"`);
  else if (tok.code) attrs.push('font-family="monospace"');

  const weight = tok.fontWeight ?? (tok.bold ? 'bold' : undefined);
  if (weight !== undefined) attrs.push(`font-weight="${weight}"`);

  if (tok.italic) attrs.push('font-style="italic"');
  if (tok.underline) attrs.push('text-decoration="underline"');

  if (tok.baselineShift) {
    attrs.push(`baseline-shift="${tok.baselineShift}"`);
    if (tok.fontSize === undefined) {
      // Common default sizing for sub/sup.
      attrs.push('font-size="0.8em"');
    }
  }

  const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';
  const tspan = `<tspan${attrStr}>${escapeXmlString(tok.text)}</tspan>`;

  if (tok.href) {
    // SVG2 prefers `href`; many renderers also accept `xlink:href`.
    return `<a href="${escapeXmlAttr(tok.href)}">${tspan}</a>`;
  }

  return tspan;
}

function escapeXmlAttr(str: string): string {
  // Attributes use the same escaping rules as text nodes for our purposes.
  return escapeXmlString(str);
}

function escapeXmlString(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
