import { describe, expect, it } from 'vitest';
import { compareImages } from '../src/gpu/dof/compare.ts';
import { DOF_METHODS } from '../src/gpu/dof/index.ts';
import { createDofScene, type DofShotSettings } from '../src/gpu/dof/scene.ts';
import type { ApertureSettings } from '../src/gpu/optics/aperture.ts';
import { cocRadius, lensFromCamera } from '../src/gpu/optics/lens.ts';
import { createRenderTarget } from '../src/gpu/targets.ts';
import { getTestDevice, readTexture } from './gpu.ts';

// Epic 3: the reference traced through the lens agrees with the lens model, and a method is scored
// against it.

const ROUND: ApertureSettings = {
  blades: 0,
  rotation: 0,
  curvature: 0,
  rim: 0,
  rings: 0,
  ringCount: 1,
  vignette: 0,
};
const HEXAGON: ApertureSettings = { ...ROUND, blades: 6, rotation: 30 };

function half(bits: number): number {
  const e = (bits >> 10) & 0x1f;
  const f = bits & 0x3ff;
  const sign = bits & 0x8000 ? -1 : 1;
  return sign * (e === 0 ? 2 ** -14 * (f / 1024) : 2 ** (e - 15) * (1 + f / 1024));
}

async function reference(
  device: GPUDevice,
  width: number,
  height: number,
  settings: DofShotSettings,
  rays: number,
) {
  const scene = createDofScene(device);
  scene.resize(width, height);
  scene.set(settings);
  for (let done = 0; done < rays; done += 32) {
    const encoder = device.createCommandEncoder();
    scene.addReference(encoder, 32);
    device.queue.submit([encoder.finish()]);
  }
  const pixels = new Float32Array((await readTexture(device, scene.referenceTexture, 16)).buffer);
  return { scene, pixels };
}

describe('depth-of-field reference', () => {
  it.each([
    ['round, behind focus', ROUND, 4, 1 / 2],
    ['round, in front of focus', ROUND, 0.7, 1 / 2],
    ['hexagon, behind focus', HEXAGON, 4, 5 / 12],
  ] as const)(
    'spreads one point into the disc the lens model gives: %s',
    async (_name, aperture, depth, moment) => {
      const device = await getTestDevice();
      const size = 160;
      const lens = lensFromCamera({
        focalLength: 85,
        fNumber: 1,
        focusDistance: 1,
        imageHeight: size,
      });
      const { scene, pixels } = await reference(
        device,
        size,
        size,
        { lens, aperture, shot: 'point', pointDepth: depth },
        // At 2 048 rays the hexagon's centre still wanders half a pixel with the sampling; at
        // 8 192 it is within 0.07 px.
        8192,
      );
      scene.destroy();
      // The light's spread about its centre: a uniform disc of radius R has a mean squared
      // radius of R² / 2, a regular hexagon of circumradius R one of 5R² / 12. The pixel's own
      // jitter adds 1/6 px².
      let sum = 0;
      let mx = 0;
      let my = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const v = pixels[(y * size + x) * 4]!;
          sum += v;
          mx += v * (x + 0.5);
          my += v * (y + 0.5);
        }
      }
      mx /= sum;
      my /= sum;
      let r2 = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const v = pixels[(y * size + x) * 4]!;
          r2 += v * ((x + 0.5 - mx) ** 2 + (y + 0.5 - my) ** 2);
        }
      }
      const measured = Math.sqrt(Math.max(r2 / sum - 1 / 6, 0) / moment);
      const expected = Math.abs(cocRadius(lens, depth));
      expect(expected).toBeGreaterThan(10);
      expect(
        measured / expected,
        `measured ${measured.toFixed(2)} px, expected ${expected.toFixed(2)} px`,
      ).toBeCloseTo(1, 1);
      expect(Math.abs(mx - size / 2)).toBeLessThan(0.5);
      expect(Math.abs(my - size / 2)).toBeLessThan(0.5);
    },
  );

  it('gives the same reference whether its batches are submitted together or apart', async () => {
    // A held frame encodes every batch before one submit; uniforms written between them would all
    // arrive with the last value, so each batch takes its number from the draw instead.
    const device = await getTestDevice();
    const size = 64;
    const lens = lensFromCamera({
      focalLength: 85,
      fNumber: 1,
      focusDistance: 1,
      imageHeight: size,
    });
    const settings: DofShotSettings = { lens, aperture: ROUND, shot: 'night' };
    const apart = await reference(device, size, size, settings, 256);
    const together = createDofScene(device);
    together.resize(size, size);
    together.set(settings);
    const encoder = device.createCommandEncoder();
    for (let i = 0; i < 8; i++) together.addReference(encoder, 32);
    device.queue.submit([encoder.finish()]);
    const pixels = new Float32Array(
      (await readTexture(device, together.referenceTexture, 16)).buffer,
    );
    let worst = 0;
    for (let i = 0; i < pixels.length; i++)
      worst = Math.max(worst, Math.abs(pixels[i]! - apart.pixels[i]!));
    expect(worst).toBeLessThan(1e-3);
    apart.scene.destroy();
    together.destroy();
  });

  it('scores the hexagon closer to the reference than the sharp image', async () => {
    const device = await getTestDevice();
    const width = 240;
    const height = 150;
    const lens = lensFromCamera({
      focalLength: 85,
      fNumber: 1.8,
      focusDistance: 2.5,
      imageHeight: height,
    });
    const settings: DofShotSettings = { lens, aperture: HEXAGON, shot: 'night' };
    const { scene, pixels: truth } = await reference(device, width, height, settings, 512);
    const output = createRenderTarget(device, {
      label: 'test dof output',
      format: 'rgba16float',
      width,
      height,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const scores: Record<string, { rmse: number; ssim: number }> = {};
    for (const id of ['sharp', 'hexagon'] as const) {
      const method = DOF_METHODS[id](device);
      method.resize(width, height);
      const encoder = device.createCommandEncoder();
      scene.renderPinhole(encoder);
      method.encode(
        encoder,
        { colour: scene.colour.view, depth: scene.depth.view, width, height },
        output.view,
        { lens, aperture: HEXAGON },
      );
      device.queue.submit([encoder.finish()]);
      const raw = new Uint16Array((await readTexture(device, output.texture, 8)).buffer);
      const image = Float32Array.from(raw, half);
      scores[id] = compareImages(image, truth, width, height);
      method.destroy();
    }
    output.destroy();
    scene.destroy();
    expect(scores.hexagon!.rmse).toBeLessThan(scores.sharp!.rmse);
    expect(scores.hexagon!.ssim).toBeGreaterThan(scores.sharp!.ssim);
  });
});
