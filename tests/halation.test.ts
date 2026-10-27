import { describe, expect, it } from 'vitest';
import { createFullscreenPipeline, renderFullscreen } from '../src/gpu/fullscreen.ts';
import { createHalation } from '../src/gpu/post/halation.ts';
import fullscreen from '../src/wgsl/fullscreen.wgsl';
import { getTestDevice, readTexture } from './gpu.ts';

// Story 2.5: halation moves light into a red halo; it never adds or loses any.

const SIZE = 128;

function half(bits: number): number {
  const e = (bits >> 10) & 0x1f;
  const f = bits & 0x3ff;
  return e === 0 ? 2 ** -14 * (f / 1024) : 2 ** (e - 15) * (1 + f / 1024);
}

describe('halation', () => {
  it('keeps each channel’s light and spreads red furthest', async () => {
    const device = await getTestDevice();
    const texture = device.createTexture({
      size: [SIZE, SIZE],
      format: 'rgba16float',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC,
    });
    const scene = { view: texture.createView(), format: 'rgba16float' as GPUTextureFormat };
    // A white dot, 8 px across, of radiance 20.
    const dot = createFullscreenPipeline(device, {
      fragment: {
        label: 'dot',
        code: `#include "fullscreen.wgsl"
@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  let d = length(in.position.xy - vec2f(${SIZE / 2}.0));
  return vec4f(vec3f(select(0.0, 20.0, d < 4.0)), 1.0);
}`,
        chunks: { ...fullscreen.chunks, 'fullscreen.wgsl': fullscreen.code },
      },
      format: 'rgba16float',
    });
    const halation = createHalation(device, { format: 'rgba16float' });
    halation.resize(SIZE, SIZE);

    const sums = async () => {
      const raw = new Uint16Array((await readTexture(device, texture, 8)).buffer);
      const total = [0, 0, 0];
      const moment = [0, 0, 0];
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const r2 = (x + 0.5 - SIZE / 2) ** 2 + (y + 0.5 - SIZE / 2) ** 2;
          for (let c = 0; c < 3; c++) {
            const v = half(raw[(y * SIZE + x) * 4 + c]!);
            total[c] = total[c]! + v;
            moment[c] = moment[c]! + v * r2;
          }
        }
      }
      return { total, spread: moment.map((m, c) => Math.sqrt(m / total[c]!)) };
    };

    let encoder = device.createCommandEncoder();
    renderFullscreen(encoder, scene.view, dot, []);
    device.queue.submit([encoder.finish()]);
    const before = await sums();

    encoder = device.createCommandEncoder();
    halation.encode(encoder, scene, { strength: 0.4, radius: 10 });
    device.queue.submit([encoder.finish()]);
    const after = await sums();
    halation.destroy();
    texture.destroy();

    for (let c = 0; c < 3; c++) {
      expect(after.total[c]! / before.total[c]!, `channel ${c}`).toBeCloseTo(1, 2);
    }
    expect(after.spread[0]!).toBeGreaterThan(after.spread[1]!);
    expect(after.spread[1]!).toBeGreaterThan(after.spread[2]!);
    expect(after.spread[0]!).toBeGreaterThan(before.spread[0]! * 1.5);
  });
});
