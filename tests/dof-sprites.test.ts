import { describe, expect, it } from 'vitest';
import { compareImages } from '../src/gpu/dof/compare.ts';
import { DOF_METHODS } from '../src/gpu/dof/index.ts';
import { createDofScene, type DofScene, type DofShotSettings } from '../src/gpu/dof/scene.ts';
import { createSpriteBokeh, createSpriteDof } from '../src/gpu/dof/sprites.ts';
import type { DofMethod } from '../src/gpu/dof/types.ts';
import type { ApertureSettings } from '../src/gpu/optics/aperture.ts';
import { cocRadius, lensFromCamera, type ThinLens } from '../src/gpu/optics/lens.ts';
import { createRenderTarget } from '../src/gpu/targets.ts';
import { expectValid, getTestDevice, readTexture } from './gpu.ts';

// Story 3.5, sprite bokeh: the highlights drawn as aperture sprites through an indirect draw, the
// rest gathered. It must keep the light, and land closer to the traced reference than the sharp
// image does.

const HEXAGON: ApertureSettings = {
  blades: 6,
  rotation: 30,
  curvature: 0,
  rim: 0,
  rings: 0,
  ringCount: 1,
  vignette: 0,
};

function half(bits: number): number {
  const e = (bits >> 10) & 0x1f;
  const f = bits & 0x3ff;
  const sign = bits & 0x8000 ? -1 : 1;
  return sign * (e === 0 ? 2 ** -14 * (f / 1024) : 2 ** (e - 15) * (1 + f / 1024));
}

function lensAt(focus: number, height: number): ThinLens {
  return lensFromCamera({
    focalLength: 85,
    fNumber: 1.8,
    focusDistance: focus,
    imageHeight: height,
  });
}

function shot(device: GPUDevice, width: number, height: number, settings: DofShotSettings) {
  const scene = createDofScene(device);
  scene.resize(width, height);
  scene.set(settings);
  return scene;
}

async function traceReference(device: GPUDevice, scene: DofScene, rays: number) {
  for (let done = 0; done < rays; done += 32) {
    const encoder = device.createCommandEncoder();
    scene.addReference(encoder, 32);
    device.queue.submit([encoder.finish()]);
  }
  return new Float32Array((await readTexture(device, scene.referenceTexture, 16)).buffer);
}

/** Renders the sharp shot and runs `method` on it; returns the output as floats, RGBA. */
async function run(
  device: GPUDevice,
  scene: DofScene,
  method: DofMethod,
  settings: DofShotSettings,
  width: number,
  height: number,
) {
  const output = createRenderTarget(device, {
    label: 'test dof output',
    format: 'rgba16float',
    width,
    height,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  method.resize(width, height);
  const encoder = device.createCommandEncoder();
  scene.renderPinhole(encoder);
  method.encode(
    encoder,
    { colour: scene.colour.view, depth: scene.depth.view, width, height },
    output.view,
    { lens: settings.lens, aperture: settings.aperture },
  );
  device.queue.submit([encoder.finish()]);
  const raw = new Uint16Array((await readTexture(device, output.texture, 8)).buffer);
  output.destroy();
  return Float32Array.from(raw, half);
}

function totalLight(rgba: ArrayLike<number>): [number, number, number] {
  const sum: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < rgba.length; i += 4) {
    sum[0] += rgba[i]!;
    sum[1] += rgba[i + 1]!;
    sum[2] += rgba[i + 2]!;
  }
  return sum;
}

describe('sprite bokeh', () => {
  it('encodes the night shot without validation errors', async () => {
    const device = await getTestDevice();
    const width = 320;
    const height = 200;
    const settings: DofShotSettings = {
      lens: lensAt(2.5, height),
      aperture: HEXAGON,
      shot: 'night',
    };
    const scene = shot(device, width, height, settings);
    const method = createSpriteDof(device);
    await expectValid(device, () => run(device, scene, method, settings, width, height));
    method.destroy();
    scene.destroy();
  });

  it('keeps the light of the night shot, and caps the sprites without losing any', async () => {
    const device = await getTestDevice();
    const width = 640;
    const height = 400;
    const settings: DofShotSettings = {
      lens: lensAt(2.5, height),
      aperture: HEXAGON,
      shot: 'night',
    };
    const scene = shot(device, width, height, settings);
    const sharp = DOF_METHODS.sharp(device);
    const input = totalLight(await run(device, scene, sharp, settings, width, height));
    sharp.destroy();

    for (const capacity of [16384, 64]) {
      const method = createSpriteBokeh(device, { capacity });
      const output = totalLight(await run(device, scene, method, settings, width, height));
      const count = await method.readSpriteCount();
      method.destroy();
      const ratios = output.map((v, c) => v / input[c]!);
      console.log(
        `sprite bokeh, cap ${capacity}: ${count.drawn} of ${count.wanted} sprites drawn; ` +
          `light out / in ${ratios.map((r) => r.toFixed(4)).join(', ')}`,
      );
      expect(count.wanted).toBeGreaterThan(0);
      if (capacity === 16384) expect(count.drawn).toBe(count.wanted);
      else expect(count.drawn).toBe(capacity);
      for (const ratio of ratios) expect(Math.abs(ratio - 1)).toBeLessThan(0.03);
    }
    scene.destroy();
  });

  it('draws one point as the hexagon the lens gives', async () => {
    // The light's spread about its centre: a regular hexagon of circumradius R has a mean squared
    // radius of 5R² / 12, a disc 6R² / 12. The sprite should be the hexagon.
    const device = await getTestDevice();
    const size = 160;
    const lens = lensFromCamera({
      focalLength: 85,
      fNumber: 1,
      focusDistance: 1,
      imageHeight: size,
    });
    const depth = 4;
    const settings: DofShotSettings = { lens, aperture: HEXAGON, shot: 'point', pointDepth: depth };
    const scene = shot(device, size, size, settings);
    const method = createSpriteDof(device);
    const pixels = await run(device, scene, method, settings, size, size);
    method.destroy();
    scene.destroy();
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
    const expected = Math.abs(cocRadius(lens, depth));
    const moment = r2 / sum / (expected * expected);
    console.log(
      `one point: mean squared radius ${moment.toFixed(4)} R² (hexagon 0.4167, disc 0.5)`,
    );
    expect(Math.abs(moment - 5 / 12)).toBeLessThan(0.02);
  });

  it.each([2.5, 40])(
    'scores closer to the reference than the sharp image, focus %s m',
    async (focus) => {
      const device = await getTestDevice();
      const width = 640;
      const height = 400;
      const settings: DofShotSettings = {
        lens: lensAt(focus, height),
        aperture: HEXAGON,
        shot: 'night',
      };
      const scene = shot(device, width, height, settings);
      const truth = await traceReference(device, scene, 1024);
      const methods: Record<string, DofMethod> = {
        sharp: DOF_METHODS.sharp(device),
        hexagon: DOF_METHODS.hexagon(device),
        sprites: createSpriteDof(device),
      };
      const scores: Record<string, { rmse: number; ssim: number }> = {};
      for (const [id, method] of Object.entries(methods)) {
        const image = await run(device, scene, method, settings, width, height);
        scores[id] = compareImages(image, truth, width, height);
        method.destroy();
      }
      scene.destroy();
      console.log(
        `focus ${focus} m, blur at infinity ${settings.lens.blurAtInfinity.toFixed(1)} px: ` +
          Object.entries(scores)
            .map(([id, s]) => `${id} rmse ${s.rmse.toFixed(2)} ssim ${s.ssim.toFixed(4)}`)
            .join('; '),
      );
      expect(scores.sprites!.rmse).toBeLessThan(scores.sharp!.rmse);
    },
    120_000,
  );
});
