import { writeFileSync } from 'node:fs';
import { describe, it, vi } from 'vitest';
import { createFullscreenPipeline, renderFullscreen } from '../src/gpu/fullscreen.ts';
import { createHalation } from '../src/gpu/post/halation.ts';
import {
  bloomAnchors,
  bloomLobes,
  createSpectralBloom,
  maxBloomLevel,
  type SpectralBloomSettings,
} from '../src/gpu/post/spectral-bloom.ts';
import { createRenderTarget, type RenderTarget } from '../src/gpu/targets.ts';
import fullscreen from '../src/wgsl/fullscreen.wgsl';
import { half } from '../tests/dof-score.ts';
import { getTestDevice, readTexture } from '../tests/gpu.ts';
import { writePng } from '../tests/headless.ts';

// Story 10.2: spectral bloom against a bloom with a radius per channel, 2.5's halation and a plain
// bloom, on the same white shapes (a point, a ring, a thin line). For each: the energy of each
// channel in and out, the outward profile of each channel, R/B along it, and the named colours a
// viewer sees going outwards (the "bands"). Also a rough wall-clock cost at 1080p on Dawn.
//
// Writes docs/studies/spectral-bloom.json and docs/studies/spectral-bloom/*.png;
// docs/studies/spectral-bloom.md is written from them.
//
//   npx vitest run --config experiments/vite.config.ts experiments/spectral-bloom.test.ts

vi.setConfig({ testTimeout: 600_000 });

const TILE = 256;
const OUT = 'docs/studies/spectral-bloom';
const SETTINGS: SpectralBloomSettings = { strength: 0.3, radius: 16, spread: 3, bands: 16 };
const METHODS = ['spectral', 'even', 'channel', 'halation', 'plain'] as const;
type Method = (typeof METHODS)[number];

/** Radiance at pixel p, tile centre c. Each shape's own light, in scene units (1 = paper white). */
const SHAPES = {
  point: 'return select(0.0, 40.0, length(p - c) < 3.0);',
  ring: 'return 12.0 * clamp(1.5 - abs(length(p - c) - 60.0), 0.0, 1.0);',
  line: 'return 12.0 * clamp(1.25 - abs(p.y - c.y), 0.0, 1.0) * select(0.0, 1.0, abs(p.x - c.x) < 90.0);',
} as const;
type Shape = keyof typeof SHAPES;

/** Distance outwards from the shape, or -1 where the pixel is not on the outward side. */
function outward(shape: Shape, x: number, y: number): number {
  const dx = x + 0.5 - TILE / 2;
  const dy = y + 0.5 - TILE / 2;
  if (shape === 'point') return Math.hypot(dx, dy);
  if (shape === 'ring') return Math.hypot(dx, dy) >= 60 ? Math.hypot(dx, dy) - 60 : -1;
  // The line: perpendicular distance, along its middle only (away from the ends).
  return Math.abs(dx) < 40 ? Math.abs(dy) : -1;
}

const BINS = 72;
const lum = (c: readonly number[]) => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
const srgb = (x: number) =>
  x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.min(1, x), 1 / 2.4) - 0.055;

/** Hue (degrees) and saturation of a linear colour as shown, whatever its brightness. */
function hueOf(rgb: readonly number[]): { hue: number; sat: number } {
  const peak = Math.max(...rgb);
  if (!(peak > 0)) return { hue: 0, sat: 0 };
  const [r, g, b] = rgb.map((v) => srgb(Math.max(0, v) / peak)) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 1e-6) return { hue: 0, sat: 0 };
  const hue =
    max === r
      ? ((g - b) / (max - min)) * 60
      : max === g
        ? (2 + (b - r) / (max - min)) * 60
        : (4 + (r - g) / (max - min)) * 60;
  return { hue: (hue + 360) % 360, sat: (max - min) / max };
}

/** The colour name a viewer would give a linear colour, whatever its brightness. */
function colourName(rgb: readonly number[]): string {
  if (!(Math.max(...rgb) > 0)) return 'black';
  const { hue, sat } = hueOf(rgb);
  if (sat < 0.2) return 'white';
  if (hue < 15 || hue >= 340) return 'red';
  if (hue < 38) return 'orange';
  if (hue < 68) return 'yellow';
  if (hue < 160) return 'green';
  if (hue < 200) return 'cyan';
  if (hue < 260) return 'blue';
  return 'magenta';
}

/** Linear luminance below which a halo on a black page is lost (about 6/255 after sRGB). */
const VISIBLE = 0.002;

function profile(shape: Shape, data: Float32Array) {
  const sum = Array.from({ length: BINS }, () => [0, 0, 0]);
  const count = new Array<number>(BINS).fill(0);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const d = outward(shape, x, y);
      if (d < 0 || d >= BINS) continue;
      const bin = Math.floor(d);
      count[bin]!++;
      for (let c = 0; c < 3; c++) sum[bin]![c]! += data[(y * TILE + x) * 4 + c]!;
    }
  }
  return sum.map((s, i) => s.map((v) => v / Math.max(1, count[i]!)));
}

/** The colours met going outwards: runs of one name at least 2 px long, while visible. */
function bands(prof: number[][], visible = VISIBLE): string[] {
  const names = prof.map((rgb) => (lum(rgb) >= visible ? colourName(rgb) : 'dark'));
  const runs: { name: string; length: number }[] = [];
  for (const name of names) {
    if (runs.at(-1)?.name === name) runs.at(-1)!.length++;
    else runs.push({ name, length: 1 });
  }
  const kept = runs.filter((run) => run.name !== 'dark' && run.length >= 2).map((run) => run.name);
  return kept.filter((name, i) => name !== kept[i - 1]);
}

/** Extent of the visible halo, px outwards. */
function reach(prof: number[][], visible = VISIBLE): number {
  let last = 0;
  prof.forEach((rgb, i) => {
    if (lum(rgb) >= visible) last = i;
  });
  return last;
}

async function makeScene(device: GPUDevice, shape: Shape, size = TILE): Promise<RenderTarget> {
  const target = createRenderTarget(device, {
    label: `scene ${shape}`,
    format: 'rgba16float',
    width: size,
    height: size,
    usage:
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC,
  });
  const pipeline = createFullscreenPipeline(device, {
    fragment: {
      label: shape,
      code: `#include "fullscreen.wgsl"
fn radiance(p: vec2f, c: vec2f) -> f32 { ${SHAPES[shape]} }
@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  return vec4f(vec3f(radiance(in.position.xy, vec2f(${size / 2}.0))), 1.0);
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

const read = async (device: GPUDevice, target: RenderTarget) =>
  Float32Array.from(new Uint16Array((await readTexture(device, target.texture, 8)).buffer), half);

const totals = (data: Float32Array) => {
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c]! += data[i + c]!;
  return sum;
};

/** Halation's radius: the red sigma the channel bloom has, so the two reach equally far in red. */
const redSigma = bloomLobes({ ...SETTINGS, mode: 'channel' })[0]!.sigma;

function encodeMethod(
  device: GPUDevice,
  method: Method,
  size: number,
): (encoder: GPUCommandEncoder, target: RenderTarget) => () => void {
  if (method === 'halation') {
    const halation = createHalation(device, { format: 'rgba16float' });
    halation.resize(size, size);
    return (encoder, target) => {
      halation.encode(encoder, target, { strength: SETTINGS.strength, radius: redSigma });
      return () => halation.destroy();
    };
  }
  const bloom = createSpectralBloom(device);
  bloom.resize(size, size);
  // `even`: the spectral bloom with balance 0, every wavelength scattering the same share.
  const settings: SpectralBloomSettings =
    method === 'even' ? { ...SETTINGS, balance: 0 } : { ...SETTINGS, mode: method };
  return (encoder, target) => {
    bloom.encode(encoder, target, settings);
    return () => bloom.destroy();
  };
}

/** Per-channel exponential tonemap at exposure 1, sRGB encoded, for the pictures. */
const display = (v: number) => Math.round(255 * srgb(1 - Math.exp(-Math.max(0, v))));

function blit(image: Uint8Array, width: number, data: Float32Array, ox: number, oy: number) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      for (let c = 0; c < 3; c++) {
        image[((oy + y) * width + ox + x) * 3 + c] = display(data[(y * TILE + x) * 4 + c]!);
      }
    }
  }
}

/** log10 profiles of R, G and B outwards from the point, one panel per method. */
function plot(profiles: Record<Method, number[][]>): {
  width: number;
  height: number;
  rgb: Uint8Array;
} {
  const panelW = BINS * 5;
  const panelH = 180;
  const width = panelW * 2 + 12;
  const height = panelH * Math.ceil(METHODS.length / 2) + 12 * Math.floor(METHODS.length / 2);
  const rgb = new Uint8Array(width * height * 3).fill(18);
  const put = (x: number, y: number, colour: readonly number[]) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    for (let c = 0; c < 3; c++) rgb[(y * width + x) * 3 + c] = colour[c]!;
  };
  const toY = (v: number) => (1 - (Math.log10(Math.max(v, 1e-6)) + 6) / 8) * (panelH - 8) + 4;
  METHODS.forEach((method, i) => {
    const ox = (i % 2) * (panelW + 12);
    const oy = Math.floor(i / 2) * (panelH + 12);
    for (let y = 0; y < panelH; y++)
      for (let x = 0; x < panelW; x++) put(ox + x, oy + y, [8, 8, 10]);
    // Decades and the visibility floor.
    for (let decade = -6; decade <= 2; decade++) {
      const y = Math.round(toY(10 ** decade));
      for (let x = 0; x < panelW; x += 2) put(ox + x, oy + y, [40, 40, 44]);
    }
    const floor = Math.round(toY(VISIBLE));
    for (let x = 0; x < panelW; x += 6) put(ox + x, oy + floor, [90, 90, 90]);
    const colours = [
      [255, 70, 60],
      [80, 230, 90],
      [90, 140, 255],
    ];
    for (let c = 0; c < 3; c++) {
      let prev = toY(profiles[method][0]![c]!);
      for (let x = 0; x < panelW; x++) {
        const y = toY(profiles[method][Math.min(BINS - 1, Math.floor(x / 5))]![c]!);
        for (let t = Math.round(Math.min(prev, y)); t <= Math.round(Math.max(prev, y)) + 1; t++) {
          put(ox + x, oy + t, colours[c]!);
        }
        prev = y;
      }
    }
  });
  return { width, height, rgb };
}

describe('spectral bloom study', () => {
  it('compares spectral, per-channel, halation and plain bloom', async () => {
    const device = await getTestDevice();
    const shapes = Object.keys(SHAPES) as Shape[];
    const results: Record<string, unknown> = {};
    const imageWidth = TILE * 3;
    const tiles = new Uint8Array(imageWidth * TILE * METHODS.length * 3 + imageWidth * TILE * 3);
    const pointProfiles = {} as Record<Method, number[][]>;

    for (const [s, shape] of shapes.entries()) {
      // The bare shape on the first row.
      const bare = await makeScene(device, shape);
      blit(tiles, imageWidth, await read(device, bare), s * TILE, 0);
      bare.destroy();
      for (const [m, method] of METHODS.entries()) {
        const target = await makeScene(device, shape);
        const before = await read(device, target);
        const run = encodeMethod(device, method, TILE);
        device.pushErrorScope('validation');
        const encoder = device.createCommandEncoder();
        const done = run(encoder, target);
        device.queue.submit([encoder.finish()]);
        const error = await device.popErrorScope();
        if (error) throw new Error(error.message);
        const after = await read(device, target);
        done();
        target.destroy();

        const a = totals(before);
        const b = totals(after);
        const prof = profile(shape, after);
        if (shape === 'point') pointProfiles[method] = prof;
        const at = (d: number) => prof[d]!;
        const ds = [4, 8, 12, 16, 20, 24, 32, 40, 48];
        const table = (f: (rgb: number[]) => number | string) =>
          Object.fromEntries(ds.map((d) => [d, f(at(d))]));
        results[`${shape}/${method}`] = {
          energy: b.map((v, c) => +(v / a[c]!).toFixed(4)),
          bands: bands(prof),
          reach: reach(prof),
          // A source ten times brighter: the same halo, seen ten times further down its tail.
          bandsBright: bands(prof, VISIBLE / 10),
          reachBright: reach(prof, VISIBLE / 10),
          rOverB: table((c) => +(c[0]! / Math.max(c[2]!, 1e-9)).toPrecision(3)),
          gOverB: table((c) => +(c[1]! / Math.max(c[2]!, 1e-9)).toPrecision(3)),
          hue: table((c) => `${Math.round(hueOf(c).hue)}/${hueOf(c).sat.toFixed(2)}`),
          colour: table((c) => colourName(c)),
          luminance: table((c) => +lum(c).toPrecision(3)),
        };
        blit(tiles, imageWidth, after, s * TILE, (m + 1) * TILE);
      }
    }
    writePng(`${OUT}/shapes.png`, imageWidth, TILE * (METHODS.length + 1), tiles);
    const graph = plot(pointProfiles);
    writePng(`${OUT}/profiles.png`, graph.width, graph.height, graph.rgb);

    // Energy at a size that does not halve evenly: 960 x 540 has odd pyramid levels.
    const odd = createRenderTarget(device, {
      label: 'odd',
      format: 'rgba16float',
      width: 960,
      height: 540,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC,
    });
    const oddRing = createFullscreenPipeline(device, {
      fragment: {
        label: 'odd ring',
        code: `#include "fullscreen.wgsl"
@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  let d = abs(length(in.position.xy - vec2f(480.0, 270.0)) - 120.0);
  return vec4f(vec3f(12.0 * clamp(1.5 - d, 0.0, 1.0)), 1.0);
}`,
        chunks: { ...fullscreen.chunks, 'fullscreen.wgsl': fullscreen.code },
      },
      format: 'rgba16float',
    });
    for (const mode of ['spectral', 'channel', 'plain'] as const) {
      let encoder = device.createCommandEncoder();
      renderFullscreen(encoder, odd.view, oddRing, []);
      device.queue.submit([encoder.finish()]);
      const before = totals(await read(device, odd));
      const bloom = createSpectralBloom(device);
      bloom.resize(960, 540);
      encoder = device.createCommandEncoder();
      bloom.encode(encoder, odd, { ...SETTINGS, radius: 40, mode });
      device.queue.submit([encoder.finish()]);
      const after = totals(await read(device, odd));
      results[`ring-960x540/${mode}`] = {
        energy: after.map((v, c) => +(v / before[c]!).toFixed(4)),
        anchors: bloom.anchors().map((x) => ({ sigma: +x.sigma.toFixed(1), level: x.level })),
      };
      bloom.destroy();
    }
    odd.destroy();

    // The anchors behind the gallery's defaults at 1080p (radius 0.045 of the height, spread 4).
    const anchors1080 = bloomAnchors(
      bloomLobes({ strength: 0.5, radius: 0.045 * 1080, spread: 4 }),
      maxBloomLevel(1920, 1080),
    ).map((x) => ({
      sigma: +x.sigma.toFixed(1),
      level: x.level,
      blurSigma: +x.blurSigma.toFixed(2),
      taps: x.taps,
      rgb: x.rgb.map((v) => +v.toFixed(3)),
    }));
    results.anchors1080 = anchors1080;

    // Rough wall-clock cost at 1080p on Dawn, after a warm-up.
    const big = createRenderTarget(device, {
      label: '1080p',
      format: 'rgba16float',
      width: 1920,
      height: 1080,
    });
    const timing: Record<string, number> = {};
    for (const method of [...METHODS, 'none'] as const) {
      const halation = createHalation(device, { format: 'rgba16float' });
      const bloom = createSpectralBloom(device);
      halation.resize(1920, 1080);
      bloom.resize(1920, 1080);
      const frame = () => {
        const encoder = device.createCommandEncoder();
        if (method === 'halation') {
          halation.encode(encoder, big, { strength: 0.5, radius: 0.045 * 1080 });
        } else if (method !== 'none') {
          bloom.encode(encoder, big, {
            strength: 0.5,
            radius: 0.045 * 1080,
            spread: 4,
            mode: method === 'even' ? 'spectral' : method,
            balance: method === 'even' ? 0 : 1,
          });
        } else {
          encoder
            .beginRenderPass({
              colorAttachments: [{ view: big.view, loadOp: 'load', storeOp: 'store' }],
            })
            .end();
        }
        device.queue.submit([encoder.finish()]);
      };
      for (let i = 0; i < 10; i++) frame();
      await device.queue.onSubmittedWorkDone();
      // The best of five runs of 100 frames: wall-clock time on a shared machine is noisy.
      let best = Infinity;
      for (let run = 0; run < 5; run++) {
        const start = performance.now();
        for (let i = 0; i < 100; i++) frame();
        await device.queue.onSubmittedWorkDone();
        best = Math.min(best, (performance.now() - start) / 100);
      }
      timing[method] = +best.toFixed(3);
      halation.destroy();
      bloom.destroy();
    }
    big.destroy();
    results.msPerFrame1080 = timing;

    writeFileSync('docs/studies/spectral-bloom.json', `${JSON.stringify(results, null, 2)}\n`);
    console.log(JSON.stringify(results, null, 2));
  });
});
