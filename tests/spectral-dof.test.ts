import { describe, expect, it, vi } from 'vitest';
import { compareImages } from '../src/gpu/dof/compare.ts';
import { fringePoints } from '../src/gpu/dof/spectral-reference.ts';
import { lcaBands, lcaShiftPx, powerShift, type LcaSettings } from '../src/gpu/optics/lca.ts';
import { cocRadius } from '../src/gpu/optics/lens.ts';
import {
  lightAround,
  renderGather,
  renderPoints,
  renderReference,
  rimAndMiddle,
  studyLens,
} from './spectral-dof-score.ts';

vi.setConfig({ testTimeout: 300_000 });

// Story 9.7: longitudinal chromatic aberration, each wavelength in focus at its own distance. The
// point layer and gather (3.9's method) with a circle of confusion per channel (three) and per
// wavelength (eight), against story 3.1's reference traced spectrally.
//
// The study's lens: 85 mm at f/1.4 focused at 2 m, on an image 640 x 400.

const W = 640;
const H = 400;
const LENS = studyLens(H);
const SINGLET: LcaSettings = { lens: 'singlet', amount: 1 };
const OVER: LcaSettings = { lens: 'singlet', amount: -1 };
/** The achromat's own secondary spectrum is a fraction of a pixel here; ten times shows it. */
const ACHROMAT_X10: LcaSettings = { lens: 'achromat', amount: 10 };

const points = fringePoints(W, H);
/** The fringe shot's point at 1.2 m (in front of focus), 2 m (at it) and 6 m (behind). */
const FRONT = points[1]!;
const FOCUSED = points[5]!;
const BEHIND = points[9]!;

type Rgb = readonly [number, number, number];
const spread = (rgb: Rgb) => Math.max(...rgb) / Math.min(...rgb);

describe('the aberration', () => {
  it('has blue focus nearest for the singlet, and green nearest for the achromat', () => {
    // More power is a nearer focus: under-corrected glass bends blue more than red.
    expect(powerShift('singlet', 450)).toBeGreaterThan(0);
    expect(powerShift('singlet', 650)).toBeLessThan(0);
    // The achromat brings F (486 nm) and C (656 nm) together; green, between them, has the most.
    expect(powerShift('achromat', 486.1)).toBeCloseTo(powerShift('achromat', 656.3), 8);
    expect(powerShift('achromat', 555)).toBeCloseTo(0, 8);
    expect(powerShift('achromat', 486.1)).toBeLessThan(0);
    // The secondary spectrum is a few per cent of the singlet's spread.
    const singlet = powerShift('singlet', 486.1) - powerShift('singlet', 656.3);
    expect(Math.abs(powerShift('achromat', 656.3) / singlet)).toBeLessThan(0.05);
  });

  it('splits white light into bands whose shares sum to white', () => {
    for (const bands of ['channels', 3, 8, 16] as const) {
      const split = lcaBands(LENS, 0.085, SINGLET, bands);
      const sum = [0, 0, 0];
      for (const band of split) for (let c = 0; c < 3; c++) sum[c]! += band.weight[c]!;
      for (const s of sum) expect(s).toBeCloseTo(1, 6);
    }
    // Several pixels at f/1.4 for a singlet: violet's disc against red's.
    expect(
      lcaShiftPx(LENS, 0.085, SINGLET, 420) - lcaShiftPx(LENS, 0.085, SINGLET, 680),
    ).toBeGreaterThan(10);
  });
});

describe('a white point in focus', () => {
  it('stays white and sharp in the point layer, eight wavelengths through an achromat', async () => {
    const light = 100;
    const point = { x: 320.3, y: 200.6, z: 2, light };
    const image = await renderPoints(LENS, { lens: 'achromat', amount: 1 }, 8, W, H, [point]);
    const all = lightAround(image, W, point.x, point.y, 12);
    const core = lightAround(image, W, point.x, point.y, 2);
    for (let c = 0; c < 3; c++) {
      expect(all[c]! / light).toBeCloseTo(1, 2);
      expect(core[c]! / all[c]!, `channel ${c}`).toBeGreaterThan(0.95);
    }
    expect(spread(core)).toBeLessThan(1.02);
  });

  it('stays white and sharp in the spectral reference through an achromat', async () => {
    const { truth } = await renderReference({
      shot: 'fringe-points',
      lens: LENS,
      lca: { lens: 'achromat', amount: 1 },
      width: W,
      height: H,
      rays: 512,
    });
    const all = lightAround(truth, W, FOCUSED.x, FOCUSED.y, 20);
    const core = lightAround(truth, W, FOCUSED.x, FOCUSED.y, 3);
    for (let c = 0; c < 3; c++) {
      expect(all[c]! / FOCUSED.light).toBeCloseTo(1, 1);
      expect(core[c]! / all[c]!).toBeGreaterThan(0.95);
    }
    expect(spread(core)).toBeLessThan(1.03);
  });

  it('keeps a violet halo through a singlet, which the eye focuses past', async () => {
    // Not a failure: a singlet focused at 555 nm leaves the violet end a disc of about ten
    // pixels at f/1.4. The light is still white overall.
    const { truth } = await renderReference({
      shot: 'fringe-points',
      lens: LENS,
      lca: SINGLET,
      width: W,
      height: H,
      rays: 512,
    });
    const all = lightAround(truth, W, FOCUSED.x, FOCUSED.y, 20);
    const core = lightAround(truth, W, FOCUSED.x, FOCUSED.y, 3);
    expect(spread(all)).toBeLessThan(1.05);
    expect(core[2]! / all[2]!).toBeLessThan(0.8);
    expect(core[1]! / all[1]!).toBeGreaterThan(0.85);
  });
});

describe('out of focus', () => {
  it('keeps each channel’s light in the point layer, however it is split', async () => {
    for (const lca of [SINGLET, ACHROMAT_X10]) {
      for (const bands of ['channels', 8, 16] as const) {
        const image = await renderPoints(LENS, lca, bands, W, H);
        for (const p of [FRONT, BEHIND]) {
          // Far enough to hold the widest band's disc: violet's, 33 px across at 1.2 m through
          // the achromat x10. The points are 105 px apart.
          const sum = lightAround(image, W, p.x, p.y, 50);
          // Within what blending in half floats loses: about 0.02 % of the light for every disc
          // laid over the same pixels (each point is 7 discs a band: 0.8 % at 8 wavelengths, 1.5 %
          // at 16). It does not depend on the brightness, so it is the blend's rounding, not the layer.
          const discs = 7 * (bands === 'channels' ? 3 : bands);
          for (let c = 0; c < 3; c++) {
            const label = `${lca.lens} ${bands} ${p.z} m ch ${c}`;
            expect(Math.abs(sum[c]! / p.light - 1), label).toBeLessThan(0.003 + 0.0002 * discs);
          }
        }
      }
    }
  });

  it('keeps white light white in the spectral reference', async () => {
    const { truth } = await renderReference({
      shot: 'fringe-points',
      lens: LENS,
      lca: SINGLET,
      width: W,
      height: H,
      rays: 1024,
    });
    for (const p of [FRONT, BEHIND]) {
      const sum = lightAround(truth, W, p.x, p.y, 50);
      for (let c = 0; c < 3; c++) expect(Math.abs(sum[c]! / p.light - 1)).toBeLessThan(0.04);
      expect(spread(sum)).toBeLessThan(1.04);
    }
  });

  it('keeps white light white through gather, band by band', async () => {
    const { sharp } = await renderReference({
      shot: 'fringe-bars',
      lens: LENS,
      lca: SINGLET,
      width: W,
      height: H,
      rays: 32,
    });
    const total = (image: Float32Array) => {
      const sum = [0, 0, 0];
      for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) sum[c]! += image[i * 4 + c]!;
      return sum as unknown as Rgb;
    };
    const before = total(sharp);
    for (const bands of ['channels', 8] as const) {
      const after = total(await renderGather('fringe-bars', LENS, SINGLET, bands, W, H));
      for (let c = 0; c < 3; c++) expect(Math.abs(after[c]! / before[c]! - 1)).toBeLessThan(0.03);
      expect(spread(after)).toBeLessThan(1.02);
    }
  });
});

describe('the rim’s colour', () => {
  /** Blue over red on the rim, against the same in the middle: above 1, a blue rim. */
  const blueRim = (image: Float32Array, p: { x: number; y: number; z: number }) => {
    const { rim, middle } = rimAndMiddle(image, W, p.x, p.y, cocRadius(LENS, p.z));
    return rim[2] / rim[0] / (middle[2] / middle[0]);
  };
  /** Green over magenta on the rim, against the same in the middle: above 1, a green rim. */
  const greenRim = (image: Float32Array, p: { x: number; y: number; z: number }) => {
    const { rim, middle } = rimAndMiddle(image, W, p.x, p.y, cocRadius(LENS, p.z));
    return (2 * rim[1]) / (rim[0] + rim[2]) / ((2 * middle[1]) / (middle[0] + middle[2]));
  };

  it.each([
    // Under-corrected: blue focuses nearest, so behind focus its disc is the biggest.
    ['singlet', SINGLET, blueRim, { front: '<', behind: '>' }],
    // Over-corrected: the other way round, the red rim behind focus.
    ['over-corrected singlet', OVER, blueRim, { front: '>', behind: '<' }],
    // Green focuses nearest: green behind, magenta in front, as fast lenses show.
    ['achromat x10', ACHROMAT_X10, greenRim, { front: '<', behind: '>' }],
  ] as const)('follows the aberration’s sign: %s', async (_name, lca, measure, expected) => {
    const { truth } = await renderReference({
      shot: 'fringe-points',
      lens: LENS,
      lca,
      width: W,
      height: H,
      rays: 1024,
    });
    const images = {
      reference: truth,
      'eight wavelengths': await renderPoints(LENS, lca, 8, W, H),
      'three channels': await renderPoints(LENS, lca, 'channels', W, H),
    };
    for (const [name, image] of Object.entries(images)) {
      for (const [side, p] of [
        ['front', FRONT],
        ['behind', BEHIND],
      ] as const) {
        const ratio = measure(image, p);
        const label = `${name}, ${side} of focus: ${ratio.toFixed(3)}`;
        if (expected[side] === '>') expect(ratio, label).toBeGreaterThan(1.05);
        else expect(ratio, label).toBeLessThan(1 / 1.05);
      }
    }
  });
});

describe('against the spectral reference', () => {
  it.each([
    ['singlet', SINGLET],
    ['achromat x10', ACHROMAT_X10],
  ] as const)(
    'puts the point layer with eight wavelengths closer than with three channels: %s',
    async (_name, lca) => {
      const { truth } = await renderReference({
        shot: 'fringe-points',
        lens: LENS,
        lca,
        width: W,
        height: H,
        rays: 2048,
      });
      const eight = compareImages(await renderPoints(LENS, lca, 8, W, H), truth, W, H);
      const three = compareImages(await renderPoints(LENS, lca, 'channels', W, H), truth, W, H);
      expect(eight.rmse).toBeLessThan(three.rmse);
      expect(eight.ssim).toBeGreaterThan(three.ssim);
    },
  );

  it.each([
    ['night', 2.5],
    ['edges', 3],
  ] as const)(
    'puts gather with eight wavelengths closer than with three channels: the %s shot',
    async (shot, focus) => {
      const lens = studyLens(H, 1.4, focus);
      const { truth } = await renderReference({
        shot,
        lens,
        lca: SINGLET,
        width: W,
        height: H,
        rays: 512,
      });
      const eight = compareImages(await renderGather(shot, lens, SINGLET, 8, W, H), truth, W, H);
      const three = compareImages(
        await renderGather(shot, lens, SINGLET, 'channels', W, H),
        truth,
        W,
        H,
      );
      expect(eight.rmse).toBeLessThan(three.rmse);
      expect(eight.ssim).toBeGreaterThan(three.ssim);
    },
  );
});
