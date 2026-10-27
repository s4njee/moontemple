import { writeFileSync } from 'node:fs';
import { describe, it, vi } from 'vitest';
import { compareImages, displayed } from '../src/gpu/dof/compare.ts';
import { DOF_METHODS } from '../src/gpu/dof/index.ts';
import { createSpectralDof } from '../src/gpu/dof/spectral-dof.ts';
import {
  createSpectralDofScene,
  fringePoints,
  SPECTRAL_FOCAL_LENGTH,
  type SpectralShot,
} from '../src/gpu/dof/spectral-reference.ts';
import type { LcaBands, LcaSettings } from '../src/gpu/optics/lca.ts';
import { lcaBands } from '../src/gpu/optics/lca.ts';
import { cocRadius, lensFromCamera } from '../src/gpu/optics/lens.ts';
import { createRenderTarget } from '../src/gpu/targets.ts';
import { createBenchDevice } from '../tests/bench.ts';
import { mountHeadless, writePng } from '../tests/headless.ts';
import {
  colourName,
  renderGather,
  renderPoints,
  renderReference,
  rimAndMiddle,
  ROUND,
  studyLens,
} from '../tests/spectral-dof-score.ts';

// Story 9.7: spectral depth of field. The point layer and gather (3.9's method) with a circle of
// confusion per channel (three) and per wavelength (eight, and sixteen for the point layer),
// against story 3.1's reference traced spectrally; the fringe colours each draws; and what each
// costs at 1080p on Dawn.
//
// Writes docs/studies/spectral-dof.json and docs/studies/spectral-dof/*.png;
// docs/studies/spectral-dof.md is written from them.
//
//   npx vitest run --config experiments/vite.config.ts experiments/spectral-dof.test.ts

vi.setConfig({ testTimeout: 1_800_000 });

const OUT = 'docs/studies/spectral-dof';
const W = 640;
const H = 400;
const POINT_RAYS = 4096;
const GATHER_RAYS = 2048;

const LENSES: Record<string, LcaSettings> = {
  'singlet x1': { lens: 'singlet', amount: 1 },
  'over-corrected singlet x1': { lens: 'singlet', amount: -1 },
  'achromat x1': { lens: 'achromat', amount: 1 },
  'achromat x10': { lens: 'achromat', amount: 10 },
  'secondary x10': { lens: 'secondary', amount: 10 },
};
const POINT_BANDS: readonly LcaBands[] = ['none', 'channels', 8, 16];
const GATHER_BANDS: readonly LcaBands[] = ['none', 'channels', 8];
const bandLabel = (b: LcaBands) =>
  b === 'none' ? 'none' : b === 'channels' ? '3 channels' : `${b} wavelengths`;

/** RMSE of the displayed colour with its grey taken out, 8-bit levels: the error in the fringes. */
function chromaRmse(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < W * H; i++) {
    const da = [0, 1, 2].map((c) => displayed(a[i * 4 + c]!));
    const db = [0, 1, 2].map((c) => displayed(b[i * 4 + c]!));
    const ma = (da[0]! + da[1]! + da[2]!) / 3;
    const mb = (db[0]! + db[1]! + db[2]!) / 3;
    for (let c = 0; c < 3; c++) sum += (255 * (da[c]! - ma - (db[c]! - mb))) ** 2;
    n += 3;
  }
  return Math.sqrt(sum / n);
}

function score(image: Float32Array, truth: Float32Array) {
  const { rmse, ssim } = compareImages(image, truth, W, H);
  return {
    rmse: +rmse.toFixed(2),
    ssim: +ssim.toFixed(4),
    chroma: +chromaRmse(image, truth).toFixed(2),
  };
}

/** A displayed crop of a linear image, as 8-bit RGB rows. */
function crop(image: Float32Array, width: number, x0: number, y0: number, w: number, h: number) {
  const rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 3; c++)
        rgb[(y * w + x) * 3 + c] = Math.round(
          255 * displayed(image[((y0 + y) * width + x0 + x) * 4 + c]!),
        );
  return { rgb, w, h };
}

/** Crops laid one under another with a 4 px gap. */
function stack(path: string, parts: { rgb: Uint8Array; w: number; h: number }[]) {
  const w = Math.max(...parts.map((p) => p.w));
  const h = parts.reduce((t, p) => t + p.h, 0) + 4 * (parts.length - 1);
  const rgb = new Uint8Array(w * h * 3).fill(40);
  let y = 0;
  for (const p of parts) {
    for (let row = 0; row < p.h; row++)
      rgb.set(p.rgb.subarray(row * p.w * 3, (row + 1) * p.w * 3), (y + row) * w * 3);
    y += p.h + 4;
  }
  writePng(path, w, h, rgb);
}

const results: Record<string, unknown> = {};

describe('spectral depth of field (story 9.7)', () => {
  it('scores the point layer against the spectral reference', async () => {
    const lens = studyLens(H);
    const points = fringePoints(W, H);
    const out: Record<string, unknown> = {};
    for (const [name, lca] of Object.entries(LENSES)) {
      const { truth } = await renderReference({
        shot: 'fringe-points',
        lens,
        lca,
        width: W,
        height: H,
        rays: POINT_RAYS,
      });
      const again = await renderReference({
        shot: 'fringe-points',
        lens,
        lca,
        width: W,
        height: H,
        rays: POINT_RAYS,
        seed: 7,
      });
      const images: Record<string, Float32Array> = { reference: truth };
      const scores: Record<string, unknown> = {
        'reference, another seed': score(again.truth, truth),
      };
      for (const bands of POINT_BANDS) {
        images[bandLabel(bands)] = await renderPoints(lens, lca, bands, W, H);
        scores[bandLabel(bands)] = score(images[bandLabel(bands)]!, truth);
      }
      // The rim and middle of the points at 1.2 m (in front) and 6 m (behind).
      const colours: Record<string, unknown> = {};
      for (const label of ['reference', '3 channels', '8 wavelengths']) {
        colours[label] = Object.fromEntries(
          [1, 9].map((i) => {
            const p = points[i]!;
            const { rim, middle } = rimAndMiddle(images[label]!, W, p.x, p.y, cocRadius(lens, p.z));
            return [
              `${p.z} m`,
              {
                rim: colourName(rim),
                middle: colourName(middle),
                rimBR: +(rim[2] / rim[0]).toFixed(3),
                middleBR: +(middle[2] / middle[0]).toFixed(3),
                rimG: +((2 * rim[1]) / (rim[0] + rim[2])).toFixed(3),
                middleG: +((2 * middle[1]) / (middle[0] + middle[2])).toFixed(3),
              },
            ];
          }),
        );
      }
      const shifts = Object.fromEntries(
        lcaBands(lens, SPECTRAL_FOCAL_LENGTH, lca, 'channels').map((b, c) => [
          'rgb'[c],
          +b.shift.toFixed(2),
        ]),
      );
      out[name] = { channelShiftPx: shifts, scores, colours };
      // The front row's three nearest points and the back row's three farthest, side by side.
      const tag = name.replace(/ /g, '-');
      stack(`${OUT}/points-${tag}.png`, [
        crop(images.reference!, W, 0, 70, W, 260),
        crop(images['3 channels']!, W, 0, 70, W, 260),
        crop(images['8 wavelengths']!, W, 0, 70, W, 260),
      ]);
    }
    results.points = { lens, size: [W, H], rays: POINT_RAYS * 4, scores: out };
  });

  it('scores gather against the spectral reference', async () => {
    const out: Record<string, unknown> = {};
    const shots: [SpectralShot, number][] = [
      ['fringe', 2],
      ['fringe-bars', 2],
      ['night', 2.5],
      ['edges', 3],
    ];
    for (const name of ['singlet x1', 'achromat x10'] as const) {
      const lca = LENSES[name]!;
      for (const [shot, focus] of shots) {
        const lens = studyLens(H, 1.4, focus);
        const { truth, sharp } = await renderReference({
          shot,
          lens,
          lca,
          width: W,
          height: H,
          rays: GATHER_RAYS,
        });
        const again = await renderReference({
          shot,
          lens,
          lca,
          width: W,
          height: H,
          rays: GATHER_RAYS,
          seed: 7,
        });
        const plain = await renderReference({
          shot,
          lens,
          lca: { ...lca, amount: 0 },
          width: W,
          height: H,
          rays: GATHER_RAYS,
        });
        const scores: Record<string, unknown> = {
          'reference, another seed': score(again.truth, truth),
          'reference without the aberration': score(plain.truth, truth),
          sharp: score(sharp, truth),
        };
        const images: Record<string, Float32Array> = {};
        for (const bands of GATHER_BANDS) {
          images[bandLabel(bands)] = await renderGather(shot, lens, lca, bands, W, H);
          scores[`gather, ${bandLabel(bands)}`] = score(images[bandLabel(bands)]!, truth);
        }
        out[`${name}, ${shot} (focus ${focus} m)`] = scores;
        if (shot === 'edges' || shot === 'fringe') {
          const tag = `${shot}-${name.replace(/ /g, '-')}`;
          stack(`${OUT}/gather-${tag}.png`, [
            crop(truth, W, 0, 0, W, H),
            crop(images['3 channels']!, W, 0, 0, W, H),
            crop(images['8 wavelengths']!, W, 0, 0, W, H),
          ]);
        }
      }
    }
    results.gather = { size: [W, H], rays: GATHER_RAYS * 4, scores: out };
  });

  it('times the point layer and gather by bands, 1080p', async () => {
    const bench = await createBenchDevice();
    const effect: Record<string, unknown> = {};
    for (const colour of ['none', 'channels', 'wavelengths'] as const) {
      const mounted = await mountHeadless('spectral-bokeh', {
        width: 1920,
        height: 1080,
        device: bench.device,
        profiler: bench.profiler,
        params: { colour, rack: 0 },
      });
      const m = await bench.measure((encoder) => mounted.encode(encoder));
      effect[colour] = { ms: +m.slopeMs.toFixed(3), metric: m.metric };
      mounted.destroy();
    }
    const gather: Record<string, unknown> = {};
    const width = 1920;
    const height = 1080;
    const scene = createSpectralDofScene(bench.device);
    scene.resize(width, height);
    const lens = lensFromCamera({
      focalLength: 85,
      fNumber: 1.8,
      focusDistance: 2.5,
      imageHeight: height,
    });
    scene.set({ lens, aperture: ROUND, shot: 'night', lca: LENSES['singlet x1']! });
    const output = createRenderTarget(bench.device, {
      label: 'bench output',
      format: 'rgba16float',
      width,
      height,
    });
    const prime = bench.device.createCommandEncoder();
    scene.renderPinhole(prime);
    bench.device.queue.submit([prime.finish()]);
    for (const bands of GATHER_BANDS) {
      const dof = createSpectralDof(bench.device, {
        method: DOF_METHODS.gather,
        lca: LENSES['singlet x1']!,
        focalLength: SPECTRAL_FOCAL_LENGTH,
        bands,
      });
      dof.resize(width, height);
      const m = await bench.measure((encoder) =>
        dof.encode(
          encoder,
          { colour: scene.colour.view, depth: scene.depth.view, width, height },
          output.view,
          { lens, aperture: ROUND },
          bench.profiler,
        ),
      );
      gather[bandLabel(bands)] = { ms: +m.slopeMs.toFixed(3), metric: m.metric };
      dof.destroy();
    }
    output.destroy();
    scene.destroy();
    bench.destroy();
    results.cost = { 'spectral-bokeh, defaults': effect, 'gather, night shot': gather };
  });

  it('writes the effect at three settings and the results', async () => {
    for (const [tag, params] of [
      ['fast-lens', {}],
      ['singlet', { lens: 'singlet' }],
      ['over-corrected', { lens: 'over-corrected singlet', focus: 1.6, swing: 0.25 }],
    ] as const) {
      const mounted = await mountHeadless('spectral-bokeh', { width: 960, height: 540, params });
      await mounted.runTo(4);
      const rgba = await mounted.read();
      const rgb = new Uint8Array(960 * 540 * 3);
      for (let i = 0; i < 960 * 540; i++) rgb.set(rgba.subarray(i * 4, i * 4 + 3), i * 3);
      writePng(`${OUT}/effect-${tag}.png`, 960, 540, rgb);
      mounted.destroy();
    }
    writeFileSync('docs/studies/spectral-dof.json', `${JSON.stringify(results, null, 2)}\n`);
  });
});
