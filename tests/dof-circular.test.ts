import { describe, expect, it } from 'vitest';
import { circularDof } from '../src/gpu/dof/circular.ts';
import { compareImages } from '../src/gpu/dof/compare.ts';
import { DOF_METHODS, type DofMethodFactory } from '../src/gpu/dof/index.ts';
import { createDofScene, type DofShotSettings } from '../src/gpu/dof/scene.ts';
import type { ApertureSettings } from '../src/gpu/optics/aperture.ts';
import { cocRadius, lensFromCamera, type ThinLens } from '../src/gpu/optics/lens.ts';
import { createRenderTarget } from '../src/gpu/targets.ts';
import { createBenchDevice } from './bench.ts';
import { expectValid, getTestDevice, readTexture } from './gpu.ts';

// Story 3.4: the circular separable convolution with one, two and three complex components. It
// draws a disc of the right size without losing light, and it is scored against the reference.

const ROUND: ApertureSettings = {
  blades: 0,
  rotation: 0,
  curvature: 0,
  rim: 0,
  rings: 0,
  ringCount: 1,
  vignette: 0,
};

const COMPONENTS = [1, 2, 3] as const;

function half(bits: number): number {
  const e = (bits >> 10) & 0x1f;
  const f = bits & 0x3ff;
  const sign = bits & 0x8000 ? -1 : 1;
  if (e === 31) return f ? Number.NaN : sign * Infinity;
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

/** Runs a method on the scene's sharp image and reads back its output as floats. */
async function run(
  device: GPUDevice,
  factory: DofMethodFactory,
  scene: ReturnType<typeof createDofScene>,
  width: number,
  height: number,
  lens: ThinLens,
): Promise<{ image: Float32Array; sharp: Float32Array }> {
  const output = createRenderTarget(device, {
    label: 'test dof output',
    format: 'rgba16float',
    width,
    height,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const method = factory(device);
  method.resize(width, height);
  await expectValid(device, () => {
    const encoder = device.createCommandEncoder();
    scene.renderPinhole(encoder);
    method.encode(
      encoder,
      { colour: scene.colour.view, depth: scene.depth.view, width, height },
      output.view,
      { lens, aperture: ROUND },
    );
    device.queue.submit([encoder.finish()]);
  });
  const image = Float32Array.from(
    new Uint16Array((await readTexture(device, output.texture, 8)).buffer),
    half,
  );
  const sharp = Float32Array.from(
    new Uint16Array((await readTexture(device, scene.colour.texture, 8)).buffer),
    half,
  );
  method.destroy();
  output.destroy();
  return { image, sharp };
}

/** Total light in the red channel, its centre, and its mean squared radius about that centre. */
function moments(pixels: Float32Array, size: number) {
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
      r2 += pixels[(y * size + x) * 4]! * ((x + 0.5 - mx) ** 2 + (y + 0.5 - my) ** 2);
    }
  }
  return { sum, mx, my, r2: r2 / sum };
}

describe('circular separable depth of field', () => {
  it('runs without validation errors on the night shot', async () => {
    const device = await getTestDevice();
    const width = 240;
    const height = 150;
    const lens = lensFromCamera({
      focalLength: 85,
      fNumber: 1.8,
      focusDistance: 2.5,
      imageHeight: height,
    });
    const scene = createDofScene(device);
    scene.resize(width, height);
    scene.set({ lens, aperture: ROUND, shot: 'night' });
    for (const n of COMPONENTS) {
      const { image } = await run(device, circularDof(n), scene, width, height, lens);
      expect(image.every(Number.isFinite), `${n} components`).toBe(true);
    }
    scene.destroy();
  });

  it.each(COMPONENTS)(
    'spreads one point into a disc of its circle of confusion, keeping its light: %i components',
    async (n) => {
      const device = await getTestDevice();
      const size = 160;
      const depth = 4;
      const lens = lensFromCamera({
        focalLength: 85,
        fNumber: 1,
        focusDistance: 1,
        imageHeight: size,
      });
      const radius = Math.abs(cocRadius(lens, depth));
      const scene = createDofScene(device);
      scene.resize(size, size);
      scene.set({ lens, aperture: ROUND, shot: 'point', pointDepth: depth });
      const { image, sharp } = await run(device, circularDof(n), scene, size, size, lens);
      scene.destroy();

      const before = moments(sharp, size);
      const after = moments(image, size);
      const energy = after.sum / before.sum;
      // A uniform disc of radius R has a mean squared radius of R² / 2; the sharp point's own
      // spread comes off.
      const spread = (after.r2 - before.r2) / (radius ** 2 / 2);

      // Ringing, against the disc's mean level. The taps are a few pixels apart at this radius, so
      // the point lands as a grid of dots; averaging over rings one pixel wide shows the kernel's
      // profile instead. Reported: the brightest ring inside the disc, the darkest (most negative)
      // ring outside it (rings nearer the centre than R / 4 hold too few pixels to average the dots
      // out), and the share of the light in negative pixels.
      const level = before.sum / (Math.PI * radius ** 2);
      const rings = new Float64Array(size);
      const counts = new Float64Array(size);
      let negative = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const v = image[(y * size + x) * 4]!;
          if (v < 0) negative -= v;
          const ring = Math.floor(Math.hypot(x + 0.5 - after.mx, y + 0.5 - after.my));
          rings[ring] = rings[ring]! + v;
          counts[ring] = counts[ring]! + 1;
        }
      }
      let peak = 0;
      let lowest = 0;
      for (let ring = 0; ring < size; ring++) {
        if (counts[ring] === 0) continue;
        const mean = rings[ring]! / counts[ring]! / level;
        if (ring >= 0.25 * radius && ring + 1 < 0.9 * radius) peak = Math.max(peak, mean);
        else if (ring > radius) lowest = Math.min(lowest, mean);
      }
      console.log(
        `circular ${n}: R ${radius.toFixed(1)} px, energy ${energy.toFixed(4)}, spread ${spread.toFixed(3)}, ` +
          `brightest ring ${peak.toFixed(3)} and darkest ring ${lowest.toFixed(3)} of the level, ` +
          `negative light ${(negative / before.sum).toFixed(4)}`,
      );
      expect(radius).toBeGreaterThan(10);
      expect(Math.abs(energy - 1)).toBeLessThan(0.03);
      expect(Math.abs(spread - 1)).toBeLessThan(0.15);
      expect(Math.abs(after.mx - before.mx)).toBeLessThan(0.5);
      expect(Math.abs(after.my - before.my)).toBeLessThan(0.5);
    },
  );

  it.each([2.5, 40])(
    'scores closer to a round-aperture reference than the sharp image: focus %d m',
    async (focus) => {
      const device = await getTestDevice();
      const width = 640;
      const height = 400;
      const lens = lensFromCamera({
        focalLength: 85,
        fNumber: 1.8,
        focusDistance: focus,
        imageHeight: height,
      });
      const { scene, pixels: truth } = await reference(
        device,
        width,
        height,
        { lens, aperture: ROUND, shot: 'night' },
        1024,
      );
      // The hexagon draws a hexagon whatever the aperture, so its score here is only a rough guide.
      const methods: Record<string, DofMethodFactory> = {
        sharp: DOF_METHODS.sharp,
        hexagon: DOF_METHODS.hexagon,
        'circular 1': circularDof(1),
        'circular 2': circularDof(2),
        'circular 3': circularDof(3),
      };
      const scores: Record<string, { rmse: number; ssim: number }> = {};
      for (const [name, factory] of Object.entries(methods)) {
        const { image } = await run(device, factory, scene, width, height, lens);
        scores[name] = compareImages(image, truth, width, height);
      }
      scene.destroy();
      console.log(
        `focus ${focus} m, blur at infinity ${lens.blurAtInfinity.toFixed(1)} px\n` +
          Object.entries(scores)
            .map(([name, s]) => `  ${name}: rmse ${s.rmse.toFixed(2)}, ssim ${s.ssim.toFixed(4)}`)
            .join('\n'),
      );
      for (const n of COMPONENTS) {
        expect(scores[`circular ${n}`]!.rmse).toBeLessThan(scores.sharp!.rmse);
      }
    },
    120_000,
  );

  it('reports what each component count costs', async () => {
    const bench = await createBenchDevice();
    const { device } = bench;
    const width = 640;
    const height = 400;
    const lens = lensFromCamera({
      focalLength: 85,
      fNumber: 1.8,
      focusDistance: 2.5,
      imageHeight: height,
    });
    const scene = createDofScene(device);
    scene.resize(width, height);
    scene.set({ lens, aperture: ROUND, shot: 'night' });
    const prepare = device.createCommandEncoder();
    scene.renderPinhole(prepare);
    device.queue.submit([prepare.finish()]);
    const output = createRenderTarget(device, {
      label: 'bench dof output',
      format: 'rgba16float',
      width,
      height,
    });
    const methods: Record<string, DofMethodFactory> = {
      sharp: DOF_METHODS.sharp,
      hexagon: DOF_METHODS.hexagon,
      'circular 1': circularDof(1),
      'circular 2': circularDof(2),
      'circular 3': circularDof(3),
    };
    const lines: string[] = [];
    for (const [name, factory] of Object.entries(methods)) {
      const method = factory(device);
      method.resize(width, height);
      const m = await bench.measure((encoder) =>
        method.encode(
          encoder,
          { colour: scene.colour.view, depth: scene.depth.view, width, height },
          output.view,
          { lens, aperture: ROUND },
          bench.profiler,
        ),
      );
      lines.push(`  ${name}: ${m.slopeMs.toFixed(3)} ms (${m.passes} passes, ${m.metric})`);
      expect(Number.isFinite(m.slopeMs)).toBe(true);
      method.destroy();
    }
    console.log(`cost at ${width} x ${height}\n${lines.join('\n')}`);
    output.destroy();
    scene.destroy();
    bench.destroy();
  }, 120_000);
});
