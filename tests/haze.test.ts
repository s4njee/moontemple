import { describe, expect, it } from 'vitest';
import { createFullscreenPipeline, renderFullscreen } from '../src/gpu/fullscreen.ts';
import {
  airlight,
  airlightForward,
  airlightForwardMarch,
  airlightMarch,
} from '../src/gpu/optics/haze.ts';
import fullscreen from '../src/wgsl/fullscreen.wgsl';
import scatter from '../src/wgsl/scatter.wgsl';
import { getTestDevice, readTexture } from './gpu.ts';

// Story 2.8: the closed-form glow of a light in fog against a direct march of its defining
// integral, and the WGSL twin against the TypeScript.

const ANGLES = [0.02, 0.1, 0.3, 0.6, 1, 1.6, 2.4, 3];
const TAUS = [0.1, 0.5, 1, 2, 4];

describe('light in haze', () => {
  it('matches a march of the scattering integral', () => {
    for (const tau of TAUS) {
      for (const gamma of ANGLES) {
        const reference = airlightMarch(gamma, tau);
        expect(
          Math.abs(airlight(gamma, tau) / reference - 1),
          `tau ${tau}, gamma ${gamma}`,
        ).toBeLessThan(0.01);
      }
    }
  });

  it('puts forward scattering inside the same integral, within 0.2% of a march', () => {
    for (const g of [0, 0.3, 0.6, 0.8]) {
      for (const tau of [0.3, 1, 3]) {
        for (const gamma of [0.03, 0.2, 0.6, 1.2, 2.4]) {
          const reference = airlightForwardMarch(gamma, tau, g, 200_000);
          expect(
            Math.abs(airlightForward(gamma, tau, g) / reference - 1),
            `g ${g}, tau ${tau}, gamma ${gamma}`,
          ).toBeLessThan(0.002);
        }
      }
    }
    expect(airlightForward(0.6, 1, 0)).toBeCloseTo(airlight(0.6, 1), 6);
    // Forward scattering gathers the glow towards the light.
    expect(airlightForward(0.05, 1, 0.7) / airlightForward(1, 1, 0.7)).toBeGreaterThan(
      airlight(0.05, 1) / airlight(1, 1),
    );
  });

  it('falls away from the light and grows with fog until the fog hides it', () => {
    for (const tau of TAUS) {
      for (let i = 1; i < ANGLES.length; i++) {
        expect(airlight(ANGLES[i]!, tau)).toBeLessThan(airlight(ANGLES[i - 1]!, tau));
      }
    }
    // Off to the side, thin fog glows more as it thickens; very thick fog swallows the light.
    expect(airlight(0.6, 1)).toBeGreaterThan(airlight(0.6, 0.1));
    expect(airlight(0.6, 8)).toBeLessThan(airlight(0.6, 1));
  });

  it('agrees between WGSL and TypeScript', async () => {
    const device = await getTestDevice();
    const width = ANGLES.length;
    const height = TAUS.length;
    const texture = device.createTexture({
      size: [width, height],
      format: 'rgba32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const pipeline = createFullscreenPipeline(device, {
      fragment: {
        label: 'airlight test',
        code: `#include "fullscreen.wgsl"
#include "scatter.wgsl"
@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  let angles = array(${ANGLES.map((a) => a.toFixed(4)).join(', ')});
  let taus = array(${TAUS.map((t) => t.toFixed(4)).join(', ')});
  let p = vec2i(in.position.xy);
  return vec4f(airlight(angles[p.x], taus[p.y]), airlight_forward(angles[p.x], taus[p.y], 0.6), 0.0, 1.0);
}`,
        chunks: {
          ...fullscreen.chunks,
          ...scatter.chunks,
          'fullscreen.wgsl': fullscreen.code,
          'scatter.wgsl': scatter.code,
        },
      },
      format: 'rgba32float',
    });
    const encoder = device.createCommandEncoder();
    renderFullscreen(encoder, texture.createView(), pipeline, []);
    device.queue.submit([encoder.finish()]);
    const values = new Float32Array((await readTexture(device, texture, 16)).buffer);
    texture.destroy();
    for (const [y, tau] of TAUS.entries()) {
      for (const [x, gamma] of ANGLES.entries()) {
        const gpu = values[(y * width + x) * 4]!;
        expect(gpu / airlight(gamma, tau), `tau ${tau}, gamma ${gamma}`).toBeCloseTo(1, 3);
        const forward = values[(y * width + x) * 4 + 1]!;
        expect(
          forward / airlightForward(gamma, tau, 0.6),
          `forward, tau ${tau}, gamma ${gamma}`,
        ).toBeCloseTo(1, 3);
      }
    }
  });
});
