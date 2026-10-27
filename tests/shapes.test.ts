import { describe, expect, it } from 'vitest';
import { apertureArea, apertureRadius } from '../src/gpu/optics/aperture.ts';
import {
  heart,
  polarTable,
  regularPolygon,
  star,
  tableArea,
  tableRadius,
} from '../src/gpu/optics/shapes.ts';

// Story 2.2: shapes baked into a radius table, against the analytic polygon they stand for.

describe('aperture radius tables', () => {
  it.each([5, 6, 7, 9])('bakes a %i-bladed polygon to within 3% of its radius', (blades) => {
    const rotation = 0.3;
    const table = polarTable(regularPolygon(blades, rotation));
    let worst = 0;
    for (let i = 0; i < 4096; i++) {
      const theta = (i / 4096) * 2 * Math.PI;
      const exact = apertureRadius(theta, blades, rotation, 0);
      worst = Math.max(worst, Math.abs(tableRadius(table, theta) / exact - 1));
    }
    // 64 entries round the corners: 2.9% at five blades, 1.4% at nine.
    expect(worst).toBeLessThan(0.03);
    // The table's own area is what the light is normalised by; it is within 1% of the polygon's.
    expect(Math.abs(tableArea(table) / apertureArea(blades, rotation, 0) - 1)).toBeLessThan(0.01);
  });

  it('bakes shapes with no formula, star-shaped about their centre', () => {
    for (const shape of [heart(), star()]) {
      const table = polarTable(shape);
      expect(Math.max(...table)).toBeCloseTo(1, 6);
      // Every ray leaves the shape once: no radius is zero.
      expect(Math.min(...table)).toBeGreaterThan(0.2);
    }
  });
});
