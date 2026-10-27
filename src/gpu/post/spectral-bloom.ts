/*
 * Spectral bloom (story 10.2): a scatter whose width grows with wavelength, so a white highlight's
 * halo goes white, yellow, orange and red outwards, as a lens's scatter and film's halation make
 * it. Like 2.5's halation it moves light rather than adding it: a share of each wavelength is taken
 * out of the scene and put back spread, so every channel keeps its total and white integrates to
 * white. See spectral-bloom.wgsl.
 *
 *   const bloom = createSpectralBloom(device, { label: 'halo' });
 *   bloom.resize(width, height);
 *   bloom.encode(encoder, tail.scene, { strength: 0.3, radius: 0.04 * height, spread: 3 });
 *
 * `mode: 'channel'` and `mode: 'plain'` are the comparisons of the study (docs/studies/
 * spectral-bloom.md) through the same passes: one Gaussian per channel, each scattering the share
 * and with the variance the spectral kernel gives that channel, and one Gaussian for all three.
 */
import { createBlur, type Blur } from '../passes/blur.ts';
import { createFullscreenPipeline, renderFullscreen } from '../fullscreen.ts';
import { cieSamples, spectralSamples } from '../optics/spectral.ts';
import type { PassProfiler } from '../profiler.ts';
import { createRenderTarget, type RenderTarget, type TargetView } from '../targets.ts';
import shader from './spectral-bloom.wgsl';

type Rgb = [number, number, number];

export const SPECTRAL_BLOOM_MODES = ['spectral', 'channel', 'plain'] as const;
export type SpectralBloomMode = (typeof SPECTRAL_BLOOM_MODES)[number];

/** The composite reads at most this many blurred copies of the scene. */
export const MAX_ANCHORS = 6;
/** Bands when `bands` is not given. They cost CPU only: the GPU work depends on the anchors. */
export const DEFAULT_BANDS = 16;
/** An anchor is blurred at the coarsest level where its sigma is still this many texels. */
const MIN_TEXELS = 2.5;
const RED_NM = 700;
const BLUE_NM = 400;

export interface SpectralBloomSettings {
  /** Share of 700 nm light scattered, 0..1; 0 leaves the scene untouched and records nothing. */
  strength: number;
  /** Sigma of 700 nm light's scatter, device pixels: the halo's outer, red reach. */
  radius: number;
  /** How much wider red's scatter is than violet's, sigma(700 nm) / sigma(400 nm), at least 1. */
  spread: number;
  /**
   * 0..1, how the scattered share falls with the width. 0: every wavelength scatters `strength`,
   * so the narrow blue halo is the densest near the light and the halo's inside is blue. 1 (the
   * default): each wavelength scatters in proportion to its sigma squared, so every band's halo
   * starts equally bright and the inside is white, turning yellow, orange and red outwards; the
   * blue the halo does not take stays in the core.
   */
  balance?: number;
  /** Wavelengths the visible range is cut into (default 16). */
  bands?: number;
  /** `spectral` (default), or a comparison: `channel` (a radius per channel) or `plain`. */
  mode?: SpectralBloomMode;
  /**
   * The bands' colours: `cie` (default), the CIE functions clamped into sRGB, whose red end is red,
   * so the rim turns orange and then red; or `zucconi`, the fit the sky optics use, which keeps
   * some green and blue to 640 nm and turns the rim brown.
   */
  colours?: 'cie' | 'zucconi';
}

/** One Gaussian of the kernel: `rgb` is the share of each channel's light it scatters. */
export interface BloomLobe {
  sigma: number;
  rgb: Rgb;
}

/** A blurred copy of the scene the composite reads, and what it takes to make it. */
export interface BloomAnchor {
  /** Effective sigma at full size, device pixels. */
  sigma: number;
  /** Pyramid level it is blurred at: 1 is half size, 2 a quarter... */
  level: number;
  /** Sigma of the blur at that level, in its texels. */
  blurSigma: number;
  /** Taps each side of the blur. */
  taps: number;
  /** Share of each channel's light it carries; summed over the anchors, the scattered share. */
  rgb: Rgb;
}

/**
 * Sigma of the scatter at `nm`: a power of the wavelength, radius * (nm / 700)^k, with k set so
 * that 400 nm is `spread` times narrower. Diffraction alone is k = 1 (spread 1.75); a lens's
 * veiling glare and a film's halation are steeper.
 */
export function bandSigma(nm: number, radius: number, spread: number): number {
  const k = Math.log(Math.max(1, spread)) / Math.log(RED_NM / BLUE_NM);
  return radius * (nm / RED_NM) ** k;
}

/** Share of each channel scattered by a set of lobes. */
export function scatteredShare(lobes: readonly BloomLobe[]): Rgb {
  const out: Rgb = [0, 0, 0];
  for (const lobe of lobes) for (let c = 0; c < 3; c++) out[c] = out[c]! + lobe.rgb[c]!;
  return out;
}

/** The Gaussians a setting stands for, before they are fitted to anchors. */
export function bloomLobes(settings: SpectralBloomSettings): BloomLobe[] {
  const bands = Math.min(64, Math.max(3, Math.round(settings.bands ?? DEFAULT_BANDS)));
  const radius = Math.max(0, settings.radius);
  const strength = Math.min(1, Math.max(0, settings.strength));
  const balance = Math.min(1, Math.max(0, settings.balance ?? 1));
  const samples = settings.colours === 'zucconi' ? spectralSamples(bands) : cieSamples(bands);
  const spectral = samples.map((s) => {
    const sigma = bandSigma(s.nm, radius, settings.spread);
    // sigma <= radius, so no band scatters more than `strength`.
    const share = strength * (radius > 0 ? sigma / radius : 1) ** (2 * balance);
    return { sigma, rgb: s.rgb.map((w) => w * share) as Rgb };
  });
  const mode = settings.mode ?? 'spectral';
  if (mode === 'spectral') return spectral;
  // The comparisons scatter the same share of each channel, with the same variance, so the halo
  // holds as much light and reaches as far on average.
  const share = scatteredShare(spectral);
  const variance = [0, 1, 2].map(
    (c) =>
      spectral.reduce((sum, lobe) => sum + lobe.rgb[c]! * lobe.sigma ** 2, 0) /
      Math.max(share[c]!, 1e-12),
  ) as Rgb;
  if (mode === 'channel') {
    return [
      { sigma: Math.sqrt(variance[0]), rgb: [share[0], 0, 0] },
      { sigma: Math.sqrt(variance[1]), rgb: [0, share[1], 0] },
      { sigma: Math.sqrt(variance[2]), rgb: [0, 0, share[2]] },
    ];
  }
  const luma = [0.2126, 0.7152, 0.0722].map((w, c) => w * share[c]!);
  const total = luma.reduce((a, b) => a + b, 0);
  const sigma = Math.sqrt(luma.reduce((sum, w, c) => sum + w * variance[c]!, 0) / total);
  return [{ sigma, rgb: [total, total, total] }];
}

/** The halo's value at `r` pixels from a unit point, per channel (integrates to the scattered share). */
export function bloomKernel(lobes: readonly BloomLobe[], r: number): Rgb {
  const out: Rgb = [0, 0, 0];
  for (const { sigma, rgb } of lobes) {
    const s = Math.max(sigma, 1e-3);
    const g = Math.exp((-r * r) / (2 * s * s)) / (2 * Math.PI * s * s);
    for (let c = 0; c < 3; c++) out[c] = out[c]! + rgb[c]! * g;
  }
  return out;
}

/** Deepest pyramid level for an image: its shorter side keeps at least 8 texels. */
export function maxBloomLevel(width: number, height: number): number {
  return Math.min(8, Math.max(1, Math.floor(Math.log2(Math.min(width, height) / 8))));
}

/**
 * Where an anchor of `sigma` is blurred. The pyramid's 2x2 averages and the bilinear read back
 * blur too (variance (4^l - 1) / 12 and 4^l / 6 pixels^2 at level l), so the blur makes up the
 * rest; the level is the coarsest that leaves it MIN_TEXELS wide.
 */
function placeAnchor(sigma: number, maxLevel: number): Omit<BloomAnchor, 'rgb'> {
  const blurAt = (level: number) => {
    const scale = 4 ** level;
    const rest = sigma * sigma - (scale - 1) / 12 - scale / 6;
    return Math.sqrt(Math.max(0, rest) / scale);
  };
  let level = 1;
  while (level < maxLevel && blurAt(level + 1) >= MIN_TEXELS) level++;
  const blurSigma = blurAt(level);
  return { sigma, level, blurSigma, taps: Math.min(64, Math.ceil(blurSigma * 3)) };
}

/**
 * Fits lobes to at most MAX_ANCHORS blurs. With no more lobes than that each gets its own;
 * otherwise the anchors are spaced evenly in log sigma over the lobes' range and each lobe's
 * weight is split between its two neighbours so that its variance is kept:
 * t = (sigma^2 - lo^2) / (hi^2 - lo^2) goes to the wider one.
 */
export function bloomAnchors(lobes: readonly BloomLobe[], maxLevel = 8): BloomAnchor[] {
  const sorted = [...lobes.map((lobe) => lobe.sigma)].sort((a, b) => a - b);
  const distinct: number[] = [];
  for (const sigma of sorted) {
    if (distinct.length === 0 || sigma > distinct.at(-1)! * 1.01) distinct.push(sigma);
  }
  let sigmas = distinct;
  if (distinct.length > MAX_ANCHORS) {
    const lo = distinct[0]!;
    const hi = distinct.at(-1)!;
    const count = Math.min(MAX_ANCHORS, 1 + Math.ceil(Math.log(hi / lo) / Math.log(Math.SQRT2)));
    sigmas = Array.from({ length: count }, (_, i) => lo * (hi / lo) ** (i / (count - 1)));
  }
  const anchors: BloomAnchor[] = sigmas.map((sigma) => ({
    ...placeAnchor(sigma, maxLevel),
    rgb: [0, 0, 0],
  }));
  for (const lobe of lobes) {
    let i = anchors.findIndex((anchor) => anchor.sigma >= lobe.sigma * 0.99);
    if (i < 0) i = anchors.length - 1;
    const hi = anchors[i]!;
    const lo = anchors[i - 1];
    const t =
      lo === undefined || hi.sigma <= lobe.sigma
        ? 1
        : (lobe.sigma ** 2 - lo.sigma ** 2) / (hi.sigma ** 2 - lo.sigma ** 2);
    for (let c = 0; c < 3; c++) {
      hi.rgb[c] = hi.rgb[c]! + t * lobe.rgb[c]!;
      if (lo) lo.rgb[c] = lo.rgb[c]! + (1 - t) * lobe.rgb[c]!;
    }
  }
  return anchors;
}

export interface SpectralBloomOptions {
  label?: string;
  /** Format of the scene passed to `encode` (default rgba16float). Must be filterable. */
  format?: GPUTextureFormat;
}

export interface SpectralBloom {
  /** Size of the scene `encode` will read. */
  resize(width: number, height: number): void;
  /** Moves a share of `scene`'s light into the halo, in place. `scene` must be sampleable. */
  encode(
    encoder: GPUCommandEncoder,
    scene: TargetView,
    settings: SpectralBloomSettings,
    profiler?: PassProfiler,
  ): void;
  /** The anchors the last `encode` used, for tests and the HUD. */
  anchors(): readonly BloomAnchor[];
  destroy(): void;
}

export function createSpectralBloom(
  device: GPUDevice,
  options: SpectralBloomOptions = {},
): SpectralBloom {
  const label = options.label ?? 'spectral bloom';
  const format = options.format ?? 'rgba16float';
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  const down = createFullscreenPipeline(device, { fragment: shader, entryPoint: 'down', format });
  // out = halo * 1 + scene * (1 - scattered share), per channel through the blend constant.
  const composite = createFullscreenPipeline(device, {
    fragment: shader,
    entryPoint: 'composite',
    format,
    blend: {
      color: { srcFactor: 'one', dstFactor: 'constant', operation: 'add' },
      alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
    },
  });
  const weights = device.createBuffer({
    label: `${label} weights`,
    size: MAX_ANCHORS * 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const target = (name: string) =>
    createRenderTarget(device, { label: `${label} ${name}`, format, width: 1, height: 1 });
  /** Level l (1-based) is pyramid[l - 1]. */
  const pyramid: RenderTarget[] = [];
  const slots: { out: RenderTarget; blur: Blur }[] = [];
  let width = 1;
  let height = 1;
  let last: BloomAnchor[] = [];
  let cache = { key: '', anchors: [] as BloomAnchor[] };

  const levelSize = (level: number): [number, number] => [
    Math.max(1, Math.round(width / 2 ** level)),
    Math.max(1, Math.round(height / 2 ** level)),
  ];

  return {
    resize(w, h) {
      width = Math.max(1, Math.round(w));
      height = Math.max(1, Math.round(h));
      pyramid.forEach((level, i) => level.resize(...levelSize(i + 1)));
    },
    encode(encoder, scene, settings, profiler) {
      if (!(settings.strength > 0) || !(settings.radius > 0)) {
        last = [];
        return;
      }
      const key = JSON.stringify([settings, width, height]);
      if (cache.key !== key) {
        cache = { key, anchors: bloomAnchors(bloomLobes(settings), maxBloomLevel(width, height)) };
      }
      const anchors = cache.anchors;
      last = anchors;
      const deepest = Math.max(...anchors.map((a) => a.level));

      // The pyramid, as deep as the widest anchor needs.
      while (pyramid.length < deepest) {
        const level = target(`level ${pyramid.length + 1}`);
        level.resize(...levelSize(pyramid.length + 1));
        pyramid.push(level);
      }
      for (let level = 1; level <= deepest; level++) {
        const source = level === 1 ? scene.view : pyramid[level - 2]!.view;
        renderFullscreen(
          encoder,
          pyramid[level - 1]!.view,
          down,
          [
            device.createBindGroup({
              layout: down.getBindGroupLayout(0),
              // `down` reads with textureLoad, so its automatic layout has no sampler.
              entries: [{ binding: 0, resource: source }],
            }),
          ],
          { timestampWrites: level === 1 ? profiler?.pass(`${label} down`) : undefined },
        );
      }

      // One blur per anchor, each with its own parameters (a Blur's parameters are written at
      // encode time, so two encodes on one Blur would share the last).
      anchors.forEach((anchor, m) => {
        const size = levelSize(anchor.level);
        slots[m] ??= {
          out: target(`anchor ${m}`),
          blur: createBlur(device, { label: `${label} anchor ${m}`, format, width: 1, height: 1 }),
        };
        const slot = slots[m]!;
        slot.out.resize(...size);
        slot.blur.resize(...size);
        slot.blur.encode(encoder, pyramid[anchor.level - 1]!.view, slot.out.view, {
          radius: anchor.taps,
          sigma: Math.max(anchor.blurSigma, 0.1),
        });
      });

      const data = new Float32Array(MAX_ANCHORS * 4);
      anchors.forEach((anchor, m) => data.set(anchor.rgb, m * 4));
      const keep = [0, 1, 2].map((c) => 1 - anchors.reduce((sum, a) => sum + a.rgb[c]!, 0));
      device.queue.writeBuffer(weights, 0, data);
      const pass = encoder.beginRenderPass({
        label: `${label} composite`,
        colorAttachments: [{ view: scene.view, loadOp: 'load', storeOp: 'store' }],
        timestampWrites: profiler?.pass(label),
      });
      pass.setBlendConstant([keep[0]!, keep[1]!, keep[2]!, 1]);
      pass.setPipeline(composite);
      pass.setBindGroup(
        0,
        device.createBindGroup({
          layout: composite.getBindGroupLayout(0),
          entries: [
            { binding: 1, resource: sampler },
            { binding: 2, resource: { buffer: weights } },
            ...Array.from({ length: MAX_ANCHORS }, (_, m) => ({
              binding: 3 + m,
              resource: slots[m < anchors.length ? m : 0]!.out.view,
            })),
          ],
        }),
      );
      pass.draw(3);
      pass.end();
    },
    anchors: () => last,
    destroy() {
      weights.destroy();
      for (const level of pyramid) level.destroy();
      for (const slot of slots) {
        slot.out.destroy();
        slot.blur.destroy();
      }
    },
  };
}
