/**
 * Utilities for SVG text measuring and wrapping.
 *
 * SVG `<text>` elements do not natively support word wrapping.
 * This module provides functions to approximate text width and
 * generate multi-line `<tspan>` nodes.
 */

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
  text: string,
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

  let lines = wrapText(text, maxWidth, numericFontSize);

  if (maxWidth && overflow && overflow !== 'visible') {
    // Very basic ellipsis logic for now - just truncate to first 2 lines
    // Real robust ellipsis in purely string SVG generation is complex
    if (overflow === 'ellipsis' && lines.length > 2) {
      const line2 = lines[1];
      if (line2) {
        lines = [lines[0]!, line2.substring(0, line2.length - 3) + '...'];
      }
    } else if (overflow === 'clip' && lines.length > 2) {
      lines = [lines[0]!, lines[1]!];
    }
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

  const totalLines = lines.length;
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

  // Generate tspan elements
  const tspans = lines.map((line, i) => {
    // Determine the dy offset for this specific tspan
    let dy: string;
    if (i === 0) {
      // Use ems or fixed dx if startDyEm is 0?
      // We use em units to accurately position text lines relative to font-size.
      dy = startDyEm === 0 ? '0' : `${startDyEm}em`;
    } else {
      dy = `${lineHeight}em`;
    }

    // In order for text wrapping to work smoothly, each consecutive tspan
    // needs x="{x}" to return to the left edge of the anchor,
    // and dy="{lineHeight}em" to drop down a line.
    return `<tspan x="${x}" dy="${dy}">${escapeXmlString(line)}</tspan>`;
  });

  return `<text x="${x}" y="${y}" class="${className}"${attrStr}>${tspans.join('')}</text>`;
}

function escapeXmlString(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
