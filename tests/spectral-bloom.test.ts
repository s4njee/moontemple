import { describe, expect, it } from 'vitest';
import { createFullscreenPipeline, renderFullscreen } from '../src/gpu/fullscreen.ts';
import {
  bloomAnchors,
  bloomLobes,
  createSpectralBloom,
  scatteredShare,
  SPECTRAL_BLOOM_MODES,
  type SpectralBloomSettings,
} from '../src/gpu/post/spectral-bloom.ts';
import { createRenderTarget, type RenderTarget } from '../src/gpu/targets.ts';
import fullscreen from '../src/wgsl/fullscreen.wgsl';
import { half } from './dof-score.ts';
import { getTestDevice, readTexture } from './gpu.ts';

// Story 10.2: spectral bloom moves light into a halo whose red reaches furthest. White in is white
// out, per channel, and the rim is redder than the inside.

const SIZE = 256;
const SETTINGS: SpectralBloomSettings = { strength: 0.3, radius: 16, spread: 3 };

/** Shapes drawn by a fragment body that returns the radiance at pixel `p` (centre 128, 128). */
const SHAPES = {
  point: 'return select(0.0, 40.0, length(p - c) < 3.0);',
  ring: 'return 12.0 * clamp(1.5 - abs(length(p - c) - 60.0), 0.0, 1.0);',
  // Anything at all: a large value, a dim floor and black, to look for NaN and negatives.
  harsh: 'return select(select(0.0, 0.01, p.x < 64.0), 60000.0, length(p - c) < 1.0);',
} as const;

async function scene(device: GPUDevice, body: string): Promise<RenderTarget> {
  const target = createRenderTarget(device, {
    label: 'spectral bloom test',
    format: 'rgba16float',
    width: SIZE,
    height: SIZE,
    usage:
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC,
  });
  const pipeline = createFullscreenPipeline(device, {
    fragment: {
      label: 'shape',
      code: `#include "fullscreen.wgsl"
fn radiance(p: vec2f, c: vec2f) -> f32 { ${body} }
@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  return vec4f(vec3f(radiance(in.position.xy, vec2f(${SIZE / 2}.0))), 1.0);
}`,
      chunks: { ...fullscreen.chunks, 'fullscreen.wgsl': fullscreen.code },
    },
    format: 'rgba16float',
  });
  const encoder = device.createCommandEncoder();
  renderFullscreen(encoder, target.view, pipeline, []);
  device.queue.submit([encoder.finish()]);
  return target;
}

async function pixels(device: GPUDevice, target: RenderTarget): Promise<Float32Array> {
  return Float32Array.from(
    new Uint16Array((await readTexture(device, target.texture, 8)).buffer),
    half,
  );
}

const totals = (data: Float32Array) => {
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c]! += data[i + c]!;
  return sum;
};

async function bloomed(body: string, settings: SpectralBloomSettings) {
  const device = await getTestDevice();
  const target = await scene(device, body);
  const before = await pixels(device, target);
  const bloom = createSpectralBloom(device);
  bloom.resize(SIZE, SIZE);
  device.pushErrorScope('validation');
  const encoder = device.createCommandEncoder();
  bloom.encode(encoder, target, settings);
  device.queue.submit([encoder.finish()]);
  const error = await device.popErrorScope();
  if (error) throw new Error(error.message);
  const after = await pixels(device, target);
  const anchors = bloom.anchors();
  bloom.destroy();
  target.destroy();
  return { before, after, anchors };
}

describe('spectral bloom', () => {
  it('fits the bands to at most six blurs, keeping each channel’s share and variance', () => {
    const spectral = scatteredShare(bloomLobes(SETTINGS));
    for (const mode of SPECTRAL_BLOOM_MODES) {
      const lobes = bloomLobes({ ...SETTINGS, mode });
      const anchors = bloomAnchors(lobes);
      expect(anchors.length).toBeLessThanOrEqual(6);
      const share = scatteredShare(lobes);
      for (let c = 0; c < 3; c++) {
        expect(share[c]!).toBeGreaterThan(0);
        expect(share[c]!).toBeLessThanOrEqual(SETTINGS.strength);
        // The per-channel comparison scatters exactly what the spectral bloom does.
        if (mode === 'channel') expect(share[c]!).toBeCloseTo(spectral[c]!, 9);
        expect(anchors.reduce((s, a) => s + a.rgb[c]!, 0)).toBeCloseTo(share[c]!, 9);
        const want = lobes.reduce((s, l) => s + l.rgb[c]! * l.sigma ** 2, 0);
        const got = anchors.reduce((s, a) => s + a.rgb[c]! * a.sigma ** 2, 0);
        expect(got / want, `${mode} channel ${c}`).toBeCloseTo(1, 6);
        for (const anchor of anchors) expect(anchor.rgb[c]!).toBeGreaterThanOrEqual(0);
      }
    }
    // Red reaches further than blue in the spectral kernel, and (balance 1) scatters more.
    const lobes = bloomLobes(SETTINGS);
    const variance = (c: number) =>
      lobes.reduce((s, l) => s + l.rgb[c]! * l.sigma ** 2, 0) / spectral[c]!;
    expect(variance(0)).toBeGreaterThan(variance(1));
    expect(variance(1)).toBeGreaterThan(variance(2));
    expect(spectral[0]!).toBeGreaterThan(spectral[2]!);
    // Balance 0: every wavelength scatters `strength`, so every channel does.
    const flat = scatteredShare(bloomLobes({ ...SETTINGS, balance: 0 }));
    for (const v of flat) expect(v).toBeCloseTo(SETTINGS.strength, 9);
  });

  for (const shape of ['point', 'ring'] as const) {
    for (const mode of SPECTRAL_BLOOM_MODES) {
      it(`keeps a white ${shape}’s light in every channel (${mode})`, async () => {
        const { before, after } = await bloomed(SHAPES[shape], { ...SETTINGS, mode });
        const a = totals(before);
        const b = totals(after);
        for (let c = 0; c < 3; c++) {
          expect(Math.abs(b[c]! / a[c]! - 1), `channel ${c}`).toBeLessThan(0.01);
        }
        // White integrated out: the three channels' totals still agree.
        expect(Math.abs(b[0]! / b[2]! - 1)).toBeLessThan(0.01);
        expect(Math.abs(b[1]! / b[2]! - 1)).toBeLessThan(0.01);
      });
    }
  }

  it('turns redder outwards: R/B rises with the distance from a white point', async () => {
    const { after } = await bloomed(SHAPES.point, SETTINGS);
    const ring = (r: number) => {
      const sum = [0, 0, 0];
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const d = Math.hypot(x + 0.5 - SIZE / 2, y + 0.5 - SIZE / 2);
          if (Math.abs(d - r) > 1) continue;
          for (let c = 0; c < 3; c++) sum[c]! += after[(y * SIZE + x) * 4 + c]!;
        }
      }
      return sum[0]! / sum[2]!;
    };
    const ratios = [8, 16, 24, 32, 44].map(ring);
    for (let i = 1; i < ratios.length; i++) {
      expect(ratios[i]!, `R/B at ring ${i}: ${ratios.map((r) => r.toFixed(2))}`).toBeGreaterThan(
        ratios[i - 1]!,
      );
    }
    expect(ratios.at(-1)!).toBeGreaterThan(2);
  });

  it('never writes a negative or NaN value', async () => {
    for (const mode of SPECTRAL_BLOOM_MODES) {
      const { after } = await bloomed(SHAPES.harsh, { ...SETTINGS, strength: 1, mode });
      for (const v of after) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('is the identity at zero strength', async () => {
    const { before, after, anchors } = await bloomed(SHAPES.ring, { ...SETTINGS, strength: 0 });
    expect(anchors).toHaveLength(0);
    expect(after).toEqual(before);
  });
});
