import { describe, expect, it } from 'vitest';
import { apertureArea, type ApertureSettings } from '../src/gpu/optics/aperture.ts';
import { createPointLayer, POINT_FLOATS } from '../src/gpu/points.ts';
import { getTestDevice, readTexture } from './gpu.ts';

// Story 2.3: a point's light, summed over the pixels it touches, is its own, in focus or out, at
// any position between pixels, for every aperture shape. Drawn into rgba16float, as the effects'
// scenes are, and read back as half floats.

const SIZE = 160;

/** IEEE half float to number. */
function half(bits: number): number {
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x3ff;
  const sign = bits & 0x8000 ? -1 : 1;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 31) return fraction ? NaN : sign * Infinity;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

const ROUND: ApertureSettings = {
  blades: 0,
  rotation: 0,
  curvature: 0,
  rim: 0,
  rings: 0,
  ringCount: 4,
  vignette: 0,
};

async function totalLight(
  device: GPUDevice,
  points: readonly { x: number; y: number; radius: number }[],
  aperture: ApertureSettings,
): Promise<number[]> {
  const layer = createPointLayer(device, { label: 'test', format: 'rgba16float' });
  const texture = device.createTexture({
    size: [SIZE, SIZE],
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const totals: number[] = [];
  for (const point of points) {
    const data = new Float32Array(POINT_FLOATS);
    data.set([point.x, point.y, point.radius, 0, 1, 0, 0, 0]);
    layer.setPoints(data, 1);
    const encoder = device.createCommandEncoder();
    layer.encode(encoder, texture.createView(), {
      width: SIZE,
      height: SIZE,
      aperture,
      clear: [0, 0, 0, 0],
    });
    device.queue.submit([encoder.finish()]);
    const rgba = new Uint16Array((await readTexture(device, texture, 8)).buffer);
    let sum = 0;
    for (let i = 0; i < SIZE * SIZE; i++) sum += half(rgba[i * 4]!);
    totals.push(sum);
  }
  texture.destroy();
  layer.destroy();
  return totals;
}

/** Points at the centre with a spread of sub-pixel offsets, for each radius. */
function sweep(radii: readonly number[]) {
  const offsets = [0, 0.13, 0.5, 0.71, 0.92];
  return radii.flatMap((radius) =>
    offsets.map((dx, i) => ({ x: SIZE / 2 + dx, y: SIZE / 2 + offsets[(i + 2) % 5]!, radius })),
  );
}

const RADII = [0, 0.3, 0.7, 1.2, 1.8, 2.2, 3, 5, 12, 32, -8, -32];

describe('energy-conserving points', () => {
  it('gives the area of a regular polygon', () => {
    // A regular n-gon with circumradius 1 has area n sin(2 pi / n) / 2.
    for (const n of [5, 6, 8, 9]) {
      expect(apertureArea(n, 0.3, 0)).toBeCloseTo((n * Math.sin((2 * Math.PI) / n)) / 2, 4);
    }
    expect(apertureArea(6, 0, 1)).toBeCloseTo(Math.PI, 9);
  });

  it.each([
    ['round', ROUND],
    ['hexagon', { ...ROUND, blades: 6, rotation: 15 }],
    ['curved heptagon', { ...ROUND, blades: 7, curvature: 0.4 }],
    ['soap bubble', { ...ROUND, rim: 0.8 }],
    ['soft edge', { ...ROUND, rim: -0.5 }],
    ['onion rings', { ...ROUND, rings: 0.2, ringCount: 5 }],
  ] as const)('keeps a point’s light at every size and offset: %s', async (_name, aperture) => {
    const device = await getTestDevice();
    const totals = await totalLight(device, sweep(RADII), aperture);
    for (const [i, total] of totals.entries()) {
      const { radius } = sweep(RADII)[i]!;
      expect(total, `radius ${radius}`).toBeGreaterThan(0.98);
      expect(total, `radius ${radius}`).toBeLessThan(1.02);
    }
  });

  it("loses light to the cat's eye only away from the centre", async () => {
    const device = await getTestDevice();
    const aperture = { ...ROUND, vignette: 0.8 };
    const [centre, corner] = await totalLight(
      device,
      [
        { x: SIZE / 2, y: SIZE / 2, radius: 12 },
        { x: 20, y: 20, radius: 12 },
      ],
      aperture,
    );
    expect(centre).toBeCloseTo(1, 2);
    expect(corner!).toBeLessThan(0.8);
    expect(corner!).toBeGreaterThan(0.2);
  });
});
