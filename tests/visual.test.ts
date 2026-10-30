import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { listEffects } from '../src/effects/registry.ts';
import { compareImages } from '../src/gpu/dof/compare.ts';
import { getTestDevice } from './gpu.ts';
import { BACKDROPS, compositeOver, mountHeadless, readPng, writePng } from './headless.ts';

vi.setConfig({ testTimeout: 120_000 });

// Visual regression (story 8.6). Every effect at its defaults, run for one simulated second from a
// fixed start (time is simulated, every layout is seeded), drawn over the dark page and compared
// with the frame recorded for this GPU, by 1.9's comparison: RMSE in 8-bit levels and SSIM.
//
// GPUs differ in the last bits of a float, and a hashed field shows that as a different speck, so
// baselines are kept per adapter (tests/visual/<vendor>-<architecture>/<id>.png) and an adapter
// without its own set is skipped, not failed. Record or refresh them, after looking at the
// pictures, with:
//
//   UPDATE_VISUAL=1 npx vitest run tests/visual.test.ts
//
// A failing effect writes what it drew and the baseline side by side to output/visual/<id>.png.

const WIDTH = 192;
const HEIGHT = 108;
const SECONDS = 1;
/**
 * On one GPU a frame is bit-identical run to run, so the limits only leave room for a driver
 * update. Measured on bokeh-drift: orbs 5% dimmer read 1.0 levels, a 10% wider rim 1.6, the focus
 * moved 5 cm 1.7, bloom down an eighth 1.1, ten orbs fewer 7.5; all are caught.
 */
const LIMITS = { rmse: 0.5, ssim: 0.995 };

/** 8-bit display values as the linear HDR the comparison expects, inverting its Reinhard and gamma. */
function asLinear(rgb: Uint8Array): Float32Array {
  const out = new Float32Array((rgb.length / 3) * 4);
  for (let i = 0; i < rgb.length / 3; i++) {
    for (let c = 0; c < 3; c++) {
      const d = Math.min(rgb[i * 3 + c]!, 254.5) / 255;
      const v = Math.pow(d, 2.2);
      out[i * 4 + c] = v / (1 - v);
    }
    out[i * 4 + 3] = 1;
  }
  return out;
}

async function render(id: string): Promise<Uint8Array> {
  const mounted = await mountHeadless(id, { width: WIDTH, height: HEIGHT });
  await mounted.runTo(SECONDS);
  const rgb = compositeOver(await mounted.read(), BACKDROPS.dark!);
  mounted.destroy();
  return rgb;
}

const adapterKey = async () => {
  const info = (await getTestDevice()).adapterInfo;
  return [info?.vendor || 'unknown', info?.architecture || 'unknown']
    .join('-')
    .replace(/[^a-z0-9-]+/gi, '-')
    .toLowerCase();
};

describe('visual regression', () => {
  it.for(listEffects().map((meta) => meta.id))('%s looks as recorded', async (id, context) => {
    const path = `tests/visual/${await adapterKey()}/${id}.png`;
    const drawn = await render(id);
    if (process.env.UPDATE_VISUAL === '1') {
      writePng(path, WIDTH, HEIGHT, drawn);
      return;
    }
    if (!existsSync(path)) {
      context.skip(`no baseline for this GPU (${path})`);
      return;
    }
    const baseline = readPng(readFileSync(path));
    expect([baseline.width, baseline.height]).toEqual([WIDTH, HEIGHT]);
    const difference = compareImages(asLinear(drawn), asLinear(baseline.rgb), WIDTH, HEIGHT);
    if (difference.rmse > LIMITS.rmse || difference.ssim < LIMITS.ssim) {
      const pair = new Uint8Array(WIDTH * 2 * HEIGHT * 3);
      for (let y = 0; y < HEIGHT; y++) {
        pair.set(drawn.subarray(y * WIDTH * 3, (y + 1) * WIDTH * 3), y * WIDTH * 6);
        pair.set(
          baseline.rgb.subarray(y * WIDTH * 3, (y + 1) * WIDTH * 3),
          y * WIDTH * 6 + WIDTH * 3,
        );
      }
      writePng(`output/visual/${id}.png`, WIDTH * 2, HEIGHT, pair);
    }
    expect(difference.rmse, `${id}: RMSE against ${path}`).toBeLessThanOrEqual(LIMITS.rmse);
    expect(difference.ssim, `${id}: SSIM against ${path}`).toBeGreaterThanOrEqual(LIMITS.ssim);
  });

  it('a frame is the same frame every time', async () => {
    // The premise: the same effect rendered twice on one GPU is identical, so any difference
    // above is a change in the code, not noise.
    for (const id of ['bokeh-drift', 'glitter', 'lamp-in-fog', 'glass-solid']) {
      expect(await render(id), id).toEqual(await render(id));
    }
  });
});
