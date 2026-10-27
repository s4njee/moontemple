import { describe, expect, it } from 'vitest';
import { compareImages, type ImageDifference } from '../src/gpu/dof/compare.ts';
import { createGatherDof } from '../src/gpu/dof/gather.ts';
import { DOF_METHODS } from '../src/gpu/dof/index.ts';
import { createDofScene, type DofScene } from '../src/gpu/dof/scene.ts';
import type { DofMethodFactory } from '../src/gpu/dof/types.ts';
import type { ApertureSettings } from '../src/gpu/optics/aperture.ts';
import { lensFromCamera, type ThinLens } from '../src/gpu/optics/lens.ts';
import { createRenderTarget } from '../src/gpu/targets.ts';
import { getTestDevice, readTexture } from './gpu.ts';

// Story 3.2: the half-resolution gather (Jimenez 2014) runs cleanly and is scored against the
// traced reference beside the sharp image and the separable hexagon.

const WIDTH = 640;
const HEIGHT = 400;
const RAYS = 1024;

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

function lensAt(focus: number): ThinLens {
  return lensFromCamera({
    focalLength: 85,
    fNumber: 1.8,
    focusDistance: focus,
    imageHeight: HEIGHT,
  });
}

/** The night shot traced through the lens, its batches submitted one at a time. */
async function reference(device: GPUDevice, lens: ThinLens, aperture: ApertureSettings) {
  const scene = createDofScene(device);
  scene.resize(WIDTH, HEIGHT);
  scene.set({ lens, aperture, shot: 'night' });
  for (let done = 0; done < RAYS; done += 32) {
    const encoder = device.createCommandEncoder();
    scene.addReference(encoder, 32);
    device.queue.submit([encoder.finish()]);
  }
  const pixels = new Float32Array((await readTexture(device, scene.referenceTexture, 16)).buffer);
  return { scene, pixels };
}

/** Runs one method on the night shot and reads its image back. */
async function run(
  device: GPUDevice,
  scene: DofScene,
  factory: DofMethodFactory,
  lens: ThinLens,
  aperture: ApertureSettings,
): Promise<Float32Array> {
  const output = createRenderTarget(device, {
    label: 'test dof output',
    format: 'rgba16float',
    width: WIDTH,
    height: HEIGHT,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const method = factory(device);
  method.resize(WIDTH, HEIGHT);
  const encoder = device.createCommandEncoder();
  scene.renderPinhole(encoder);
  method.encode(
    encoder,
    { colour: scene.colour.view, depth: scene.depth.view, width: WIDTH, height: HEIGHT },
    output.view,
    { lens, aperture },
  );
  device.queue.submit([encoder.finish()]);
  const raw = new Uint16Array((await readTexture(device, output.texture, 8)).buffer);
  method.destroy();
  output.destroy();
  return Float32Array.from(raw, half);
}

describe('gather depth of field', () => {
  it('runs on the night shot without validation errors', async () => {
    const device = await getTestDevice();
    const scene = createDofScene(device);
    scene.resize(WIDTH, HEIGHT);
    const lens = lensAt(2.5);
    scene.set({ lens, aperture: ROUND, shot: 'night' });
    device.pushErrorScope('validation');
    const image = await run(device, scene, createGatherDof, lens, ROUND);
    const error = await device.popErrorScope();
    scene.destroy();
    expect(error?.message ?? null).toBeNull();
    expect(image.every(Number.isFinite)).toBe(true);
  });

  it.each([
    ['subject in focus', 2.5],
    ['background in focus', 40],
  ] as const)(
    'beats the sharp image against the reference: %s',
    async (name, focus) => {
      const device = await getTestDevice();
      const lens = lensAt(focus);
      const scores: Record<string, ImageDifference> = {};

      // Gather draws a circle, so it and the sharp image are scored against a round lens.
      const round = await reference(device, lens, ROUND);
      for (const [id, factory] of [
        ['sharp', DOF_METHODS.sharp],
        ['gather', createGatherDof],
      ] as const) {
        const image = await run(device, round.scene, factory, lens, ROUND);
        scores[id] = compareImages(image, round.pixels, WIDTH, HEIGHT);
      }
      round.scene.destroy();

      // The hexagon draws only hexagons, so it is scored against a hexagonal lens, as in the lab.
      const hexagonal = await reference(device, lens, HEXAGON);
      const image = await run(device, hexagonal.scene, DOF_METHODS.hexagon, lens, HEXAGON);
      scores.hexagon = compareImages(image, hexagonal.pixels, WIDTH, HEIGHT);
      hexagonal.scene.destroy();

      console.log(
        `${name} (${focus} m): ` +
          Object.entries(scores)
            .map(([id, s]) => `${id} RMSE ${s.rmse.toFixed(1)} SSIM ${s.ssim.toFixed(3)}`)
            .join(', '),
      );
      expect(scores.gather!.rmse).toBeLessThan(scores.sharp!.rmse);
      expect(scores.gather!.ssim).toBeGreaterThan(scores.sharp!.ssim);
      if (focus === 40) {
        // The hexagon's failure: a blurred foreground with a hard, opaque edge. The near field
        // spreads it over the sharp background instead.
        expect(scores.gather!.rmse).toBeLessThan(scores.hexagon!.rmse);
        expect(scores.gather!.ssim).toBeGreaterThan(scores.hexagon!.ssim);
      }
    },
    60_000,
  );
});
