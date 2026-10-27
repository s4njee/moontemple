import { describe, expect, it } from 'vitest';
import { gatherAt, loopProgress } from '../src/effects/bokeh-text/index.ts';
import { fitWord, isInk, layoutWord, sampleWord } from '../src/effects/bokeh-text/glyph-points.ts';
import { decodeAtlas, measureGlyphs } from '../src/gpu/ui/atlas.ts';

// Story 4.9: the orbs' targets are points inside the word's glyphs, read from the MSDF atlas on the
// CPU. They must all be ink, there must be exactly as many as orbs, and the same word must give
// the same points on every load.

describe('bokeh-text glyph sampling', async () => {
  const atlas = await decodeAtlas();
  const metrics = measureGlyphs(atlas);

  it('gives exactly the asked-for count, every point inside a glyph', () => {
    const layout = layoutWord('MOON TEMPLE', metrics, 1);
    for (const count of [300, 1400, 4000]) {
      const { points, spacing } = sampleWord(atlas, layout, count);
      expect(points.length).toBe(count * 2);
      expect(spacing).toBeGreaterThan(0);
      let outside = 0;
      for (let i = 0; i < count; i++) {
        if (!isInk(atlas, layout, points[2 * i]!, points[2 * i + 1]!)) outside++;
      }
      expect(outside).toBe(0);
    }
  });

  it('spreads the points over every glyph, not a few', () => {
    const layout = layoutWord('HELLO 2026', metrics, 1);
    const { points } = sampleWord(atlas, layout, 1000);
    const perCell = layout.cells.map(() => 0);
    for (let i = 0; i < 1000; i++) {
      const x = points[2 * i]!;
      const cell = layout.cells.findIndex((c) => x >= c.left && x <= c.right);
      if (cell >= 0) perCell[cell]!++;
    }
    // Nine glyphs: each holds a fair share (an I or a 1 holds less than an M).
    for (const n of perCell) expect(n).toBeGreaterThan(1000 / 9 / 3);
  });

  it('is the same on every load', () => {
    const layout = layoutWord('BOKEH', metrics, 1);
    expect(sampleWord(atlas, layout, 500).points).toEqual(sampleWord(atlas, layout, 500).points);
  });

  it('breaks the line where that sets the type larger', () => {
    expect(fitWord('MOON TEMPLE', metrics, 960, 540).layout.lines).toBe(1);
    expect(fitWord('MOON TEMPLE', metrics, 540, 960).layout.lines).toBe(2);
    expect(fitWord('BOKEH', metrics, 540, 960).layout.lines).toBe(1);
  });

  it('keeps unknown characters out and survives an empty word', () => {
    expect(layoutWord('A-B', metrics, 1).cells).toHaveLength(2);
    const empty = layoutWord('', metrics, 1);
    expect(empty.cells).toHaveLength(0);
    expect(sampleWord(atlas, empty, 10).points).toHaveLength(20);
  });
});

describe('bokeh-text timing', () => {
  it('loops from scattered to resolved and back', () => {
    expect(loopProgress(0, 2)).toBe(0);
    expect(loopProgress(1, 2)).toBeCloseTo(0.5);
    expect(loopProgress(2.5, 2)).toBe(1);
    expect(loopProgress(-0.001, 2)).toBe(0);
  });

  it('gathers every orb by full progress and none at zero', () => {
    for (const delay of [0, 0.3, 0.999]) {
      expect(gatherAt(0, delay)).toBe(0);
      expect(gatherAt(1, delay)).toBe(1);
    }
  });
});
