import {
  ATLAS_CELL_HEIGHT,
  ATLAS_CELL_WIDTH,
  ATLAS_COLUMNS,
  ATLAS_RANGE,
  ATLAS_WIDTH,
  layoutText,
  type GlyphMetrics,
} from '../../gpu/ui/atlas.ts';
import { createRandom } from '../../gpu/random.ts';

/*
 * Points inside a word, read from the MSDF atlas on the CPU (story 4.9, bokeh-text).
 *
 * The atlas (src/gpu/ui/atlas.ts) is decoded to bytes anyway to measure the glyphs, so the same
 * bytes answer "is this point ink?": bilinear-sample the three channels in the glyph's cell and
 * take the median, as msdf.wgsl does; above one half is inside the outline. No GPU read-back, no
 * Canvas 2D, and it runs the same in a test as in a browser.
 *
 * The word is set in up to three lines (whichever makes the type largest in the frame), then
 * sampled on a jittered hexagonal grid whose spacing is chosen from the ink's area so that about
 * `count` points land inside; the few over or under are trimmed or topped up from a fine grid, so
 * exactly `count` come back. The grid keeps a little in from the outline (`inset`), so a dot drawn
 * on a point does not spill over the letter's edge.
 *
 * Units are cell heights (the atlas cell is 2/3 of a height wide), origin at the top left of the
 * word's ink, y down.
 */

/** A cell is this many heights wide. */
const CELL_ASPECT = ATLAS_CELL_WIDTH / ATLAS_CELL_HEIGHT;
/** The field's range in cell heights: distances saturate at half of it either side of the edge. */
const RANGE = ATLAS_RANGE / ATLAS_CELL_HEIGHT;
/** Line pitch, in ink heights. */
const LINE_PITCH = 1.3;
/** The fine grid that measures the ink's area and tops the sample up, in cell heights. */
const FINE = 1 / 80;

export interface PlacedCell {
  /** Index into ATLAS_GLYPHS. */
  glyph: number;
  /** Top-left of the glyph's cell, cell heights from the word's ink origin. */
  x: number;
  y: number;
  /** The glyph's ink box in the same units. */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface WordLayout {
  cells: PlacedCell[];
  /** The word's ink box, cell heights. */
  width: number;
  height: number;
  lines: number;
  /** One line's ink height (capitals), cell heights. */
  lineHeight: number;
}

export interface WordSample {
  /** `count` (x, y) pairs, cell heights, in no spatial order. */
  points: Float32Array;
  /** The hexagonal grid's spacing, cell heights: about the distance between neighbours. */
  spacing: number;
}

/** Splits `words` into `lines` lines of about equal width, greedily. */
function split(words: string[], widths: number[], space: number, lines: number): string[][] {
  const total = widths.reduce((a, b) => a + b, 0) + space * (words.length - 1);
  const goal = total / lines;
  const out: string[][] = [[]];
  let run = 0;
  words.forEach((word, i) => {
    const w = widths[i]!;
    const current = out[out.length - 1]!;
    // Break before this word when it would overshoot the goal more than stopping short would.
    if (current.length > 0 && out.length < lines && run + space + w / 2 > goal) {
      out.push([word]);
      run = w;
      return;
    }
    run += (current.length > 0 ? space : 0) + w;
    current.push(word);
  });
  return out;
}

/** Sets `text` in `lines` lines (fewer when there are fewer words), centred. */
export function layoutWord(
  text: string,
  metrics: readonly GlyphMetrics[],
  lines: number,
): WordLayout {
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  const widths = words.map((word) => layoutText(word, metrics).width);
  const space = 0.2;
  const rows = split(words, widths, space, Math.max(1, Math.min(lines, words.length)));
  const laid = rows.map((row) => layoutText(row.join(' '), metrics)).filter((l) => l.glyphs.length);
  const all = laid.flatMap((l) => l.glyphs.map((g) => metrics[g.glyph]!));
  if (all.length === 0) return { cells: [], width: 0, height: 0, lines: 0, lineHeight: 0 };
  const top = Math.min(...all.map((m) => m.top));
  const bottom = Math.max(...all.map((m) => m.bottom));
  const lineHeight = bottom - top;
  const width = Math.max(...laid.map((l) => l.width));
  const cells: PlacedCell[] = [];
  laid.forEach((line, row) => {
    const dx = (width - line.width) / 2;
    const dy = row * LINE_PITCH * lineHeight - top;
    for (const g of line.glyphs) {
      const m = metrics[g.glyph]!;
      const x = g.x + dx;
      cells.push({
        glyph: g.glyph,
        x,
        y: dy,
        left: x + m.left,
        right: x + m.right,
        top: dy + m.top,
        bottom: dy + m.bottom,
      });
    }
  });
  const height = (laid.length - 1) * LINE_PITCH * lineHeight + lineHeight;
  return { cells, width, height, lines: laid.length, lineHeight };
}

export interface Fit {
  layout: WordLayout;
  /** Device pixels per cell height. */
  size: number;
}

/**
 * The layout of `text` in one to three lines that sets it largest in a `width` x `height` frame,
 * within `maxWidth` and `maxHeight` of it and with capitals no taller than `maxCap` of its height.
 */
export function fitWord(
  text: string,
  metrics: readonly GlyphMetrics[],
  width: number,
  height: number,
  { maxWidth = 0.84, maxHeight = 0.62, maxCap = 0.26 } = {},
): Fit {
  let best: Fit | undefined;
  for (let lines = 1; lines <= 3; lines++) {
    const layout = layoutWord(text, metrics, lines);
    if (layout.cells.length === 0) break;
    const size = Math.min(
      (maxWidth * width) / layout.width,
      (maxHeight * height) / layout.height,
      (maxCap * height) / layout.lineHeight,
    );
    // A clear gain only: an extra line costs reading order.
    if (!best || size > best.size * 1.08) best = { layout, size };
    if (layout.lines < lines) break;
  }
  return best ?? { layout: layoutWord('', metrics, 1), size: 1 };
}

/** The atlas's median at a point in a glyph's cell (0..1 across and down), 0..1. */
export function medianAt(atlas: Uint8Array, glyph: number, u: number, v: number): number {
  const ox = (glyph % ATLAS_COLUMNS) * ATLAS_CELL_WIDTH;
  const oy = Math.floor(glyph / ATLAS_COLUMNS) * ATLAS_CELL_HEIGHT;
  // Texel centres, clamped inside the cell so a sample never reads the neighbour's glyph.
  const ax = Math.min(Math.max(u * ATLAS_CELL_WIDTH - 0.5, 0), ATLAS_CELL_WIDTH - 1);
  const ay = Math.min(Math.max(v * ATLAS_CELL_HEIGHT - 0.5, 0), ATLAS_CELL_HEIGHT - 1);
  const x0 = Math.floor(ax);
  const y0 = Math.floor(ay);
  const x1 = Math.min(x0 + 1, ATLAS_CELL_WIDTH - 1);
  const y1 = Math.min(y0 + 1, ATLAS_CELL_HEIGHT - 1);
  const fx = ax - x0;
  const fy = ay - y0;
  const at = (x: number, y: number, c: number) => atlas[((oy + y) * ATLAS_WIDTH + ox + x) * 4 + c]!;
  const channel = (c: number) => {
    const a = at(x0, y0, c) + (at(x1, y0, c) - at(x0, y0, c)) * fx;
    const b = at(x0, y1, c) + (at(x1, y1, c) - at(x0, y1, c)) * fx;
    return (a + (b - a) * fy) / 255;
  };
  const r = channel(0);
  const g = channel(1);
  const b = channel(2);
  return Math.max(Math.min(r, g), Math.min(Math.max(r, g), b));
}

/** True when the word point (x, y) is ink at least `inset` cell heights in from the outline. */
export function isInk(
  atlas: Uint8Array,
  layout: WordLayout,
  x: number,
  y: number,
  inset = 0,
): boolean {
  // The median's 0.5 is the outline; the field falls by 1 / RANGE per cell height inside it.
  const threshold = 0.5 + Math.min(inset, 0.45 * RANGE) / RANGE;
  for (const cell of layout.cells) {
    if (x < cell.left || x > cell.right || y < cell.top || y > cell.bottom) continue;
    if (medianAt(atlas, cell.glyph, (x - cell.x) / CELL_ASPECT, y - cell.y) > threshold) {
      return true;
    }
  }
  return false;
}

/** Exactly `count` points inside the word's glyphs, evenly spread, the same for the same input. */
export function sampleWord(
  atlas: Uint8Array,
  layout: WordLayout,
  count: number,
  seed = 49,
): WordSample {
  const random = createRandom(seed);
  const points = new Float32Array(count * 2);
  if (layout.cells.length === 0 || count <= 0) return { points, spacing: 1 };

  // The ink, on a fine grid: its area sets the spacing, and it fills in any shortfall.
  const firstInset = 0.3 * Math.sqrt(estimateArea(atlas, layout) / count);
  const fine: number[] = [];
  for (const cell of layout.cells) {
    for (let y = cell.top + FINE / 2; y < cell.bottom; y += FINE)
      for (let x = cell.left + FINE / 2; x < cell.right; x += FINE)
        if (isInk(atlas, layout, x, y, firstInset)) fine.push(x, y);
  }
  const area = (fine.length / 2) * FINE * FINE;
  // A hexagonal cell of spacing s has area s^2 * sqrt(3) / 2.
  const spacing = Math.sqrt((2 / Math.sqrt(3)) * (area / count));
  const inset = Math.min(0.3 * spacing, firstInset);

  const found: number[] = [];
  const rowStep = (spacing * Math.sqrt(3)) / 2;
  const jitter = 0.18 * spacing;
  for (let row = 0, y = rowStep / 2; y < layout.height; row++, y += rowStep) {
    for (let x = (row % 2) * (spacing / 2); x < layout.width; x += spacing) {
      const px = x + (random() * 2 - 1) * jitter;
      const py = y + (random() * 2 - 1) * jitter;
      if (isInk(atlas, layout, px, py, inset)) found.push(px, py);
    }
  }
  // Too many: drop at random. Too few: top up from the fine grid, jittered.
  while (found.length / 2 > count) {
    const i = Math.floor(random() * (found.length / 2));
    found[2 * i] = found[found.length - 2]!;
    found[2 * i + 1] = found[found.length - 1]!;
    found.length -= 2;
  }
  while (found.length / 2 < count && fine.length > 0) {
    const i = Math.floor(random() * (fine.length / 2));
    found.push(fine[2 * i]! + (random() - 0.5) * FINE, fine[2 * i + 1]! + (random() - 0.5) * FINE);
  }
  // Shuffle, so an orb's index says nothing about where it lands.
  const n = found.length / 2;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    for (const k of [0, 1]) {
      const t = found[2 * i + k]!;
      found[2 * i + k] = found[2 * j + k]!;
      found[2 * j + k] = t;
    }
  }
  points.set(found.slice(0, count * 2));
  return { points, spacing };
}

/** The word's ink area at the outline, cell heights squared, from a coarse grid. */
function estimateArea(atlas: Uint8Array, layout: WordLayout): number {
  const step = 2 * FINE;
  let inside = 0;
  for (const cell of layout.cells)
    for (let y = cell.top + step / 2; y < cell.bottom; y += step)
      for (let x = cell.left + step / 2; x < cell.right; x += step)
        if (isInk(atlas, layout, x, y)) inside++;
  return Math.max(inside * step * step, 1e-6);
}
