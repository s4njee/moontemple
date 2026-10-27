import { describe, expect, it } from 'vitest';
import { moonAlbedo, moonLight, moonRadiance, moonRadiusPx } from '../src/gpu/optics/moon.ts';

// The shared moon (Epic 5): its size, its flat full face, and its light falling with phase.

describe('the moon', () => {
  it('is half a degree across', () => {
    // A 50 mm lens on full frame, 1080 pixels tall: the moon is about 10 pixels across.
    expect(2 * moonRadiusPx(24 / 50, 1080)).toBeCloseTo(20.3, 0);
  });

  it('is a flat coin when full, not a lit ball', () => {
    // Lommel-Seeliger at full: mu0 = mu everywhere, so only the albedo varies across the face,
    // where Lambert would darken the limb to nothing.
    for (const [x, y] of [
      [0, 0],
      [0.9, 0.1],
      [-0.2, 0.95],
    ] as const) {
      expect(moonRadiance(x, y, 0.5) / moonAlbedo(x, y)).toBeCloseTo(1, 5);
    }
  });

  it('is lit on the right while waxing, and its light falls towards new', () => {
    expect(moonRadiance(0.5, 0, 0.25)).toBeGreaterThan(0.1);
    expect(moonRadiance(-0.5, 0, 0.25)).toBeLessThan(0.01);
    const full = moonLight(0.5);
    const quarter = moonLight(0.25);
    const crescent = moonLight(0.08);
    expect(full).toBeGreaterThan(0.75);
    expect(quarter / full).toBeGreaterThan(0.3);
    expect(quarter / full).toBeLessThan(0.55);
    expect(crescent).toBeLessThan(quarter);
  });
});
