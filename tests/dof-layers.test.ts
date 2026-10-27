import { describe, expect, it } from 'vitest';
import { DOF_METHODS } from '../src/gpu/dof/index.ts';
import { scoreMethods } from './dof-score.ts';

// Story 3.6: layered depth of field against the ray-traced reference, with the sharp image and the
// separable hexagon beside it, and the tilt-shift band, which has no depth to go on.

const SCRATCH = process.env.DOF_SCORES;

describe('layered depth of field', () => {
  it.each([2.5, 40])('beats the sharp image against the reference, focus %f m', async (focus) => {
    const { sharp, hexagon, layers } = DOF_METHODS;
    const results = await scoreMethods({
      shot: 'night',
      focus,
      methods: { sharp, hexagon, layers, 'tilt-shift': DOF_METHODS['tilt-shift'] },
    });
    if (SCRATCH) {
      (await import('node:fs')).appendFileSync(
        SCRATCH,
        `layers focus ${focus}: ${JSON.stringify(results)}\n`,
      );
    }
    expect(results.layers!.rmse).toBeLessThan(results.sharp!.rmse);
    expect(results.layers!.ssim).toBeGreaterThan(results.sharp!.ssim);
    // The slices' weights sum to one at every pixel: no light made or lost, to a few per cent.
    expect(results.layers!.light).toBeCloseTo(1, 1);
  });
});
