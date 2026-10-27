/*
 * Scoring depth-of-field methods against the ray-traced reference (Epic 3): one shot, one lens,
 * every method on the same sharp image, each scored over the whole frame and, when asked, over the
 * bands either side of the depth edges (story 3.8).
 */
import { expect } from 'vitest';
import { compareImages, depthEdgeBands, type ImageDifference } from '../src/gpu/dof/compare.ts';
import { createDofScene, type DofShot } from '../src/gpu/dof/scene.ts';
import type { DofMethodFactory } from '../src/gpu/dof/types.ts';
import type { ApertureSettings } from '../src/gpu/optics/aperture.ts';
import { lensFromCamera } from '../src/gpu/optics/lens.ts';
import { createRenderTarget } from '../src/gpu/targets.ts';
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

export function half(bits: number): number {
  const e = (bits >> 10) & 0x1f;
  const f = bits & 0x3ff;
  const sign = bits & 0x8000 ? -1 : 1;
  return sign * (e === 0 ? 2 ** -14 * (f / 1024) : 2 ** (e - 15) * (1 + f / 1024));
}

export interface MethodScore extends ImageDifference {
  /** Total light in the method's image over the sharp image's. */
  light: number;
  /** The same scores near the depth edges: the near and far sides. */
  near?: ImageDifference;
  far?: ImageDifference;
}

export interface ScoreOptions {
  shot: DofShot;
  focus: number;
  methods: Record<string, DofMethodFactory>;
  width?: number;
  height?: number;
  fNumber?: number;
  /** Reference rays a pixel. */
  rays?: number;
  /** Width of the edge bands, pixels; none when left out. */
  edges?: number;
}

export interface Rendered {
  truth: Float32Array;
  sharp: Float32Array;
  depth: Float32Array;
  images: Record<string, Float32Array>;
}

/** The reference and every method's image for one shot, as linear RGBA floats. */
export async function renderShot(options: ScoreOptions & { pan?: number }): Promise<Rendered> {
  const { shot, focus, methods, width = 640, height = 400, rays = 1024 } = options;
  const device = await getTestDevice();
  const lens = lensFromCamera({
    focalLength: 85,
    fNumber: options.fNumber ?? 1.8,
    focusDistance: focus,
    imageHeight: height,
  });
  const scene = createDofScene(device);
  scene.resize(width, height);
  scene.set({ lens, aperture: ROUND, shot, pan: options.pan });
  for (let done = 0; done < rays; done += 32) {
    const encoder = device.createCommandEncoder();
    scene.addReference(encoder, 32);
    device.queue.submit([encoder.finish()]);
  }
  const truth = new Float32Array((await readTexture(device, scene.referenceTexture, 16)).buffer);
  const output = createRenderTarget(device, {
    label: 'test output',
    format: 'rgba16float',
    width,
    height,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const read16 = async (texture: GPUTexture) =>
    Float32Array.from(new Uint16Array((await readTexture(device, texture, 8)).buffer), half);

  const images: Record<string, Float32Array> = {};
  for (const [name, factory] of Object.entries(methods)) {
    device.pushErrorScope('validation');
    const method = factory(device);
    method.resize(width, height);
    const encoder = device.createCommandEncoder();
    scene.renderPinhole(encoder);
    method.encode(
      encoder,
      { colour: scene.colour.view, depth: scene.depth.view, width, height },
      output.view,
      { lens, aperture: ROUND },
    );
    device.queue.submit([encoder.finish()]);
    images[name] = await read16(output.texture);
    const error = await device.popErrorScope();
    expect(error?.message ?? null).toBeNull();
    method.destroy();
  }
  const sharp = await read16(scene.colour.texture);
  const depth = new Float32Array((await readTexture(device, scene.depth.texture, 4)).buffer);
  output.destroy();
  scene.destroy();
  return { truth, sharp, depth, images };
}

function totalLight(pixels: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < pixels.length; i += 4) sum += pixels[i]! + pixels[i + 1]! + pixels[i + 2]!;
  return sum;
}

export async function scoreMethods(options: ScoreOptions): Promise<Record<string, MethodScore>> {
  const { width = 640, height = 400 } = options;
  const { truth, sharp, depth, images } = await renderShot(options);
  const bands = options.edges ? depthEdgeBands(depth, width, height, options.edges) : undefined;
  const sharpLight = totalLight(sharp);
  const results: Record<string, MethodScore> = {};
  for (const [name, image] of Object.entries(images)) {
    results[name] = {
      ...compareImages(image, truth, width, height),
      light: totalLight(image) / sharpLight,
      ...(bands && {
        near: compareImages(image, truth, width, height, bands.near),
        far: compareImages(image, truth, width, height, bands.far),
      }),
    };
  }
  return results;
}
