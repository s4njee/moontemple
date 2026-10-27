import { describe, expect, it } from 'vitest';
import { displayed } from '../src/gpu/dof/compare.ts';
import { DOF_METHODS } from '../src/gpu/dof/index.ts';
import { DOF_VIEW_SCALE } from '../src/gpu/dof/scene.ts';
import { renderShot } from './dof-score.ts';

// Story 3.7: temporal stability. The camera pans slowly to the right, a quarter of a pixel a frame
// at the plane of focus, and each method's frame-to-frame change is set against the reference's.
//
//   shimmer  the mean change between frames in displayed levels, over the reference's: 1 moves as
//            much as the truth does, more is crawling and popping, less is smearing.
//   error    the RMS difference between the method's change and the reference's, 8-bit levels.
//
// The reference uses the same lens samples every frame, so its noise holds still and what changes
// is the motion.

const WIDTH = 320;
const HEIGHT = 200;
const FRAMES = 6;
const SCRATCH = process.env.DOF_SCORES;

function change(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(WIDTH * HEIGHT * 3);
  for (let i = 0, k = 0; i < a.length; i += 4) {
    for (let c = 0; c < 3; c++) out[k++] = 255 * (displayed(b[i + c]!) - displayed(a[i + c]!));
  }
  return out;
}

describe('depth of field under a slow pan', () => {
  it.each([
    ['night', 2.5],
    ['edges', 3],
  ] as const)('%s shot, focus %f m', async (shot, focus) => {
    const step = (0.25 * focus * DOF_VIEW_SCALE) / HEIGHT;
    const frames = [];
    for (let f = 0; f < FRAMES; f++) {
      frames.push(
        await renderShot({
          shot,
          focus,
          pan: f * step,
          width: WIDTH,
          height: HEIGHT,
          rays: 512,
          methods: DOF_METHODS,
        }),
      );
    }
    const results: Record<string, { shimmer: number; error: number }> = {};
    for (const name of Object.keys(DOF_METHODS)) {
      let moved = 0;
      let truthMoved = 0;
      let squared = 0;
      let count = 0;
      for (let f = 1; f < FRAMES; f++) {
        const ours = change(frames[f - 1]!.images[name]!, frames[f]!.images[name]!);
        const truth = change(frames[f - 1]!.truth, frames[f]!.truth);
        for (let i = 0; i < ours.length; i++) {
          moved += Math.abs(ours[i]!);
          truthMoved += Math.abs(truth[i]!);
          squared += (ours[i]! - truth[i]!) ** 2;
          count++;
        }
      }
      results[name] = { shimmer: moved / truthMoved, error: Math.sqrt(squared / count) };
    }
    if (SCRATCH) {
      (await import('node:fs')).appendFileSync(
        SCRATCH,
        `temporal ${shot} ${focus}: ${JSON.stringify(results)}\n`,
      );
    }
    // The sharp image moves with the pinhole view: it changes, and by a sensible amount.
    for (const { shimmer } of Object.values(results)) {
      expect(shimmer).toBeGreaterThan(0.2);
      expect(shimmer).toBeLessThan(5);
    }
  });
});
