import { describe, expect, it } from 'vitest';
import { cocRadius, depthForCoc, lensFromCamera } from '../src/gpu/optics/lens.ts';

describe('thin lens', () => {
  // 50 mm at f/1.8 focused at 2 m on a full-frame sensor, imaged 1080 px tall: the aperture is
  // 27.8 mm across, and a point at infinity is a disc 0.712 mm across on the sensor, 32.05 px.
  const lens = lensFromCamera({
    focalLength: 50,
    fNumber: 1.8,
    focusDistance: 2,
    imageHeight: 1080,
  });

  it('gives the textbook disc for a point at infinity', () => {
    const diameterMm = (50 / 1.8) * (50 / (2000 - 50));
    expect(diameterMm).toBeCloseTo(0.7123, 4);
    expect(lens.blurAtInfinity * 2).toBeCloseTo((diameterMm * 1080) / 24, 6);
    expect(cocRadius(lens, 1e9)).toBeCloseTo(lens.blurAtInfinity, 4);
  });

  it('is zero in focus, positive beyond it and negative in front', () => {
    expect(cocRadius(lens, 2)).toBeCloseTo(0, 9);
    expect(cocRadius(lens, 4)).toBeCloseTo(lens.blurAtInfinity / 2, 6);
    expect(cocRadius(lens, 1)).toBeCloseTo(-lens.blurAtInfinity, 6);
    expect(cocRadius(lens, 0.5)).toBeCloseTo(-3 * lens.blurAtInfinity, 6);
  });

  it('halves with each doubling of the f-number', () => {
    const f36 = lensFromCamera({
      focalLength: 50,
      fNumber: 3.6,
      focusDistance: 2,
      imageHeight: 1080,
    });
    expect(f36.blurAtInfinity).toBeCloseTo(lens.blurAtInfinity / 2, 9);
  });

  it('inverts', () => {
    for (const depth of [0.3, 1, 1.9, 2.5, 10, 300]) {
      expect(depthForCoc(lens, cocRadius(lens, depth))).toBeCloseTo(depth, 6);
    }
    expect(depthForCoc(lens, lens.blurAtInfinity)).toBe(Infinity);
  });
});
