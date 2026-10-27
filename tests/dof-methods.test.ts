import { describe, expect, it } from 'vitest';
import { DOF_METHODS } from '../src/gpu/dof/index.ts';
import { scoreMethods } from './dof-score.ts';

// Story 3.9: every registered method on the night shot against the round-lens reference, the
// subject in focus and the background in focus.

const SCRATCH = process.env.DOF_SCORES;

describe('every depth-of-field method on the night shot', () => {
  it.each([2.5, 40])('beats the sharp image, focus %f m', async (focus) => {
    const results = await scoreMethods({ shot: 'night', focus, methods: DOF_METHODS, edges: 32 });
    if (SCRATCH) {
      (await import('node:fs')).appendFileSync(
        SCRATCH,
        `night focus ${focus}: ${JSON.stringify(results)}\n`,
      );
    }
    for (const [name, score] of Object.entries(results)) {
      if (name === 'sharp' || name === 'tilt-shift') continue;
      expect(score.rmse, name).toBeLessThan(results.sharp!.rmse);
      expect(score.ssim, name).toBeGreaterThan(results.sharp!.ssim);
    }
  });
});
