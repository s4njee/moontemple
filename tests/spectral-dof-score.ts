/*
 * Story 9.7: rendering the spectral reference, the point layer and a depth-of-field method with
 * longitudinal chromatic aberration, and measuring the fringes. Shared by
 * tests/spectral-dof.test.ts and the study (experiments/spectral-dof.test.ts).
 */
import { DOF_METHODS } from '../src/gpu/dof/index.ts';
import { createSpectralDof } from '../src/gpu/dof/spectral-dof.ts';
import {
  createSpectralDofScene,
  FRINGE_POINT_RADIUS,
  fringePoints,
  SPECTRAL_FOCAL_LENGTH,
  type SpectralShot,
} from '../src/gpu/dof/spectral-reference.ts';
import type { ApertureSettings } from '../src/gpu/optics/aperture.ts';
import { lcaBands, type LcaBands, type LcaSettings } from '../src/gpu/optics/lca.ts';
import { cocRadius, lensFromCamera, type ThinLens } from '../src/gpu/optics/lens.ts';
import { createPointLayer } from '../src/gpu/points.ts';
import { SpectralPointList } from '../src/gpu/points-spectral.ts';
import { createRenderTarget } from '../src/gpu/targets.ts';
import { half } from './dof-score.ts';
import { getTestDevice, readTexture } from './gpu.ts';

export const ROUND: ApertureSettings = {
  blades: 0,
  rotation: 0,
  curvature: 0,
  rim: 0,
  rings: 0,
  ringCount: 1,
  vignette: 0,
};

/** The study's lens: 85 mm at f/1.4 focused at 2 m, the fringe shots' focus. */
export function studyLens(height: number, fNumber = 1.4, focus = 2): ThinLens {
  return lensFromCamera({ focalLength: 85, fNumber, focusDistance: focus, imageHeight: height });
}

export interface ReferenceOptions {
  shot: SpectralShot;
  lens: ThinLens;
  lca: LcaSettings;
  width: number;
  height: number;
  rays: number;
  seed?: number;
  pointDepth?: number;
}

/** The spectral reference, linear RGBA floats; and the sharp image and depth of the same shot. */
export async function renderReference(options: ReferenceOptions) {
  const { width, height, rays } = options;
  const device = await getTestDevice();
  const scene = createSpectralDofScene(device);
  scene.resize(width, height);
  scene.set({
    lens: options.lens,
    aperture: ROUND,
    shot: options.shot,
    lca: options.lca,
    seed: options.seed,
    pointDepth: options.pointDepth,
  });
  const batch = 32;
  for (let done = 0; done < rays; done += batch) {
    const encoder = device.createCommandEncoder();
    scene.addReference(encoder, batch);
    device.queue.submit([encoder.finish()]);
    // Keep the queue short, so a long reference never trips the GPU watchdog.
    if ((done / batch) % 8 === 7) await device.queue.onSubmittedWorkDone();
  }
  const encoder = device.createCommandEncoder();
  scene.renderPinhole(encoder);
  device.queue.submit([encoder.finish()]);
  const truth = new Float32Array((await readTexture(device, scene.referenceTexture, 16)).buffer);
  const sharp = Float32Array.from(
    new Uint16Array((await readTexture(device, scene.colour.texture, 8)).buffer),
    half,
  );
  scene.destroy();
  return { truth, sharp };
}

/**
 * The fringe points drawn by the point layer, split into `bands`. Each scene point is a small disc
 * (FRINGE_POINT_RADIUS), so it is drawn as seven: one at its centre and six on a ring with the
 * disc's mean squared radius, each with a seventh of the light.
 */
export async function renderPoints(
  lens: ThinLens,
  lca: LcaSettings,
  bands: LcaBands,
  width: number,
  height: number,
  points = fringePoints(width, height),
): Promise<Float32Array> {
  const device = await getTestDevice();
  const layer = createPointLayer(device, { label: 'spectral test', format: 'rgba16float' });
  const target = createRenderTarget(device, {
    label: 'spectral points',
    format: 'rgba16float',
    width,
    height,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const list = new SpectralPointList(lcaBands(lens, SPECTRAL_FOCAL_LENGTH, lca, bands));
  const ring = FRINGE_POINT_RADIUS * Math.sqrt(7 / 12);
  for (const p of points) {
    const radius = cocRadius(lens, p.z);
    const light = p.light / 7;
    list.push(p.x, p.y, radius, light, light, light);
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3;
      list.push(p.x + ring * Math.cos(a), p.y + ring * Math.sin(a), radius, light, light, light);
    }
  }
  list.upload(layer);
  const encoder = device.createCommandEncoder();
  layer.encode(encoder, target.view, { width, height, aperture: ROUND, clear: [0, 0, 0, 0] });
  device.queue.submit([encoder.finish()]);
  const image = Float32Array.from(
    new Uint16Array((await readTexture(device, target.texture, 8)).buffer),
    half,
  );
  target.destroy();
  layer.destroy();
  return image;
}

/** A spectral shot's sharp image and depth, as a method gets them. */
export async function renderGather(
  shot: SpectralShot,
  lens: ThinLens,
  lca: LcaSettings,
  bands: LcaBands,
  width: number,
  height: number,
  method: keyof typeof DOF_METHODS = 'gather',
): Promise<Float32Array> {
  const device = await getTestDevice();
  const scene = createSpectralDofScene(device);
  scene.resize(width, height);
  scene.set({ lens, aperture: ROUND, shot, lca });
  const output = createRenderTarget(device, {
    label: 'spectral gather output',
    format: 'rgba16float',
    width,
    height,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const dof = createSpectralDof(device, {
    method: DOF_METHODS[method],
    lca,
    focalLength: SPECTRAL_FOCAL_LENGTH,
    bands,
  });
  dof.resize(width, height);
  const encoder = device.createCommandEncoder();
  scene.renderPinhole(encoder);
  dof.encode(
    encoder,
    { colour: scene.colour.view, depth: scene.depth.view, width, height },
    output.view,
    { lens, aperture: ROUND },
  );
  device.queue.submit([encoder.finish()]);
  const image = Float32Array.from(
    new Uint16Array((await readTexture(device, output.texture, 8)).buffer),
    half,
  );
  dof.destroy();
  output.destroy();
  scene.destroy();
  return image;
}

/** Light per channel inside a square of half-side `reach` round (x, y). */
export function lightAround(
  image: Float32Array,
  width: number,
  x: number,
  y: number,
  reach: number,
): [number, number, number] {
  const sum: [number, number, number] = [0, 0, 0];
  for (let py = Math.floor(y - reach); py < Math.ceil(y + reach); py++) {
    for (let px = Math.floor(x - reach); px < Math.ceil(x + reach); px++) {
      const i = (py * width + px) * 4;
      for (let c = 0; c < 3; c++) sum[c]! += image[i + c] ?? 0;
    }
  }
  return sum;
}

/**
 * The colour of a disc's rim and of its middle, as each channel's mean over the annulus
 * 0.8R..R+2 px and the disc 0..0.55R about (x, y), R the 555 nm radius: light per pixel, so
 * compare their ratios between channels rather than their levels.
 */
export function rimAndMiddle(
  image: Float32Array,
  width: number,
  x: number,
  y: number,
  radius: number,
): { rim: [number, number, number]; middle: [number, number, number] } {
  const R = Math.abs(radius);
  const rim: [number, number, number] = [0, 0, 0];
  const middle: [number, number, number] = [0, 0, 0];
  let nRim = 0;
  let nMiddle = 0;
  for (let py = Math.floor(y - R - 4); py < Math.ceil(y + R + 4); py++) {
    for (let px = Math.floor(x - R - 4); px < Math.ceil(x + R + 4); px++) {
      const d = Math.hypot(px + 0.5 - x, py + 0.5 - y);
      const i = (py * width + px) * 4;
      if (d >= 0.8 * R && d <= R + 2) {
        for (let c = 0; c < 3; c++) rim[c]! += image[i + c] ?? 0;
        nRim++;
      } else if (d <= 0.55 * R) {
        for (let c = 0; c < 3; c++) middle[c]! += image[i + c] ?? 0;
        nMiddle++;
      }
    }
  }
  for (let c = 0; c < 3; c++) {
    rim[c]! /= nRim;
    middle[c]! /= nMiddle;
  }
  return { rim, middle };
}

const srgb = (x: number) =>
  x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.min(1, x), 1 / 2.4) - 0.055;

/** The colour name a viewer would give a linear colour, whatever its brightness. */
export function colourName(rgb: readonly number[]): string {
  const peak = Math.max(...rgb);
  if (!(peak > 0)) return 'black';
  const [r, g, b] = rgb.map((v) => srgb(Math.max(v, 0) / peak)) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 0.12 * max) return 'white';
  let hue =
    max === r ? ((g - b) / (max - min)) * 60 : max === g ? (2 + (b - r) / (max - min)) * 60 : 0;
  if (max === b) hue = (4 + (r - g) / (max - min)) * 60;
  hue = (hue + 360) % 360;
  if (hue < 15 || hue >= 340) return 'red';
  if (hue < 38) return 'orange';
  if (hue < 68) return 'yellow';
  if (hue < 160) return 'green';
  if (hue < 200) return 'cyan';
  if (hue < 260) return 'blue';
  if (hue < 290) return 'violet';
  return 'magenta';
}
