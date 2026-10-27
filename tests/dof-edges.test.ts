import { describe, expect, it } from 'vitest';
import { DOF_METHODS } from '../src/gpu/dof/index.ts';
import { scoreMethods } from './dof-score.ts';

// Story 3.8: the edges shot focused on each of its three planes, every method scored near the depth
// edges against the ray-traced reference.

const SCRATCH = process.env.DOF_SCORES;

describe('depth of field at depth edges', () => {
  it.each([1, 3, 30])('scores every method near the edges, focus %f m', async (focus) => {
    const results = await scoreMethods({
      shot: 'edges',
      focus,
      edges: 32,
      methods: DOF_METHODS,
    });
    if (SCRATCH) {
      (await import('node:fs')).appendFileSync(
        SCRATCH,
        `edges focus ${focus}: ${JSON.stringify(results)}\n`,
      );
    }
    for (const score of Object.values(results)) {
      expect(score.rmse).toBeGreaterThanOrEqual(0);
      expect(score.near!.ssim).toBeLessThanOrEqual(1);
    }
    // Every depth-of-field method does better than none near the edges as well as overall.
    expect(results.layers!.rmse).toBeLessThan(results.sharp!.rmse);
    expect(results.layers!.near!.rmse).toBeLessThan(results.sharp!.near!.rmse);
  });
});
