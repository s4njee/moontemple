/*
 * The depth-of-field reference traced spectrally (story 9.7): story 3.1's test shots through a thin
 * lens whose focus depends on the wavelength, and two shots built for fringes. Shaped like
 * `createDofScene` (scene.ts), whose shots it includes rather than copies; see
 * spectral-reference.wgsl for the method.
 */
import { createFullscreenPipeline, renderFullscreen } from '../fullscreen.ts';
import type { PassProfiler } from '../profiler.ts';
import { createShader, withChunks } from '../shader.ts';
import { createPingPongTarget, createRenderTarget, type RenderTarget } from '../targets.ts';
import { createUniformBuffer, defineUniformStruct, uniformArray } from '../uniforms.ts';
import { apertureUniforms, type ApertureSettings } from '../optics/aperture.ts';
import { powerTable, type LcaSettings } from '../optics/lca.ts';
import type { ThinLens } from '../optics/lens.ts';
import { DOF_VIEW_SCALE, type DofShot } from './scene.ts';
import shader from './spectral-reference.wgsl';

/** scene.wgsl's `DofView`, the same fields first, then the spectral shot's. */
const DofView = defineUniformStruct('DofView', {
  out_size: 'vec2f',
  view_scale: 'f32',
  focus: 'f32',
  lens_radius: 'f32',
  blades: 'f32',
  rotation: 'f32',
  curvature: 'f32',
  samples: 'f32',
  point_depth: 'f32',
  scene: 'u32',
  pan: 'f32',
  seed: 'u32',
  point_count: 'f32',
  point_radius: 'f32',
  bar_level: 'f32',
  bar_depth: 'vec2f',
  power: uniformArray('vec4f', 16),
  points: uniformArray('vec4f', 16),
});

/** The 85 mm lens every shot is taken with, metres. */
export const SPECTRAL_FOCAL_LENGTH = 0.085;

/**
 * `fringe-points`: bright white points at twelve depths on black, half in front of a 2 m focus and
 * half behind (one at it). `fringe`: the same with a tall white bar at 6 m and a long one at
 * 1.3 m. `fringe-bars`: the bars alone.
 */
export type SpectralShot = DofShot | 'fringe' | 'fringe-points' | 'fringe-bars';

export interface SpectralShotSettings {
  lens: ThinLens;
  aperture: ApertureSettings;
  shot: SpectralShot;
  lca: LcaSettings;
  /** Default SPECTRAL_FOCAL_LENGTH: the shots are framed for an 85 mm lens. */
  focalLength?: number;
  /** For the `point` shot: how far away the point is, metres. */
  pointDepth?: number;
  pan?: number;
  /** Another seed traces independent rays: two seeds measure the reference's own noise. */
  seed?: number;
}

/** A fringe point: device pixels, metres, and its total light (each channel). */
export interface FringePoint {
  x: number;
  y: number;
  z: number;
  light: number;
}

/** Depths of the fringe points, metres: six in front of 2 m (one at it), six behind. */
export const FRINGE_DEPTHS = [1, 1.2, 1.4, 1.6, 1.8, 2, 2.5, 3, 4, 6, 10, 40];
/** Each point is a disc this many pixels across in radius, as seen from the lens's centre. */
export const FRINGE_POINT_RADIUS = 1.5;
/** A point's total light for an image 400 pixels tall; scales with the image's area. */
const FRINGE_LIGHT = 500;
/** The bars' radiance, and their depths, metres. */
const BAR_LEVEL = 2;
const BAR_DEPTHS: [number, number] = [6, 1.3];

/** Where the fringe points sit for an image of this size: two rows of six. */
export function fringePoints(width: number, height: number): FringePoint[] {
  const scale = (height / 400) ** 2;
  return FRINGE_DEPTHS.map((z, i) => ({
    x: width * (0.09 + (0.82 * (i % 6)) / 5),
    y: height * (i < 6 ? 0.3 : 0.66),
    z,
    light: FRINGE_LIGHT * scale,
  }));
}

export interface SpectralDofScene {
  /** The sharp image, `rgba16float`, and its depth, `r32float`. Valid after `renderPinhole`. */
  readonly colour: RenderTarget;
  readonly depth: RenderTarget;
  /** The reference so far, `rgba32float`, and how many batches it averages. */
  readonly reference: GPUTextureView;
  readonly referenceTexture: GPUTexture;
  readonly batches: number;
  resize(width: number, height: number): void;
  /** Sets the shot, lens and aberration; a change starts the reference again. */
  set(settings: SpectralShotSettings): void;
  renderPinhole(encoder: GPUCommandEncoder, profiler?: PassProfiler): void;
  /** Adds one batch of `samples` lens rays a pixel, four wavelengths each. */
  addReference(encoder: GPUCommandEncoder, samples: number, profiler?: PassProfiler): void;
  destroy(): void;
}

export function createSpectralDofScene(device: GPUDevice): SpectralDofScene {
  const uniforms = createUniformBuffer(device, DofView, 'dof spectral scene');
  const source = withChunks(shader, { 'dof-view.wgsl': DofView.wgsl });
  const pinhole = createFullscreenPipeline(device, {
    fragment: source,
    entryPoint: 'spectral_pinhole',
    format: ['rgba16float', 'r32float'],
  });
  const module = createShader(device, source);
  const referencePipeline = device.createRenderPipeline({
    label: 'dof spectral reference',
    layout: 'auto',
    vertex: { module, entryPoint: 'reference_vs' },
    fragment: { module, entryPoint: 'spectral_reference', targets: [{ format: 'rgba32float' }] },
  });
  const usage =
    GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC;
  const colour = createRenderTarget(device, {
    label: 'dof spectral sharp',
    format: 'rgba16float',
    width: 1,
    height: 1,
    usage,
  });
  const depth = createRenderTarget(device, {
    label: 'dof spectral depth',
    format: 'r32float',
    width: 1,
    height: 1,
    usage,
  });
  const accumulated = createPingPongTarget(device, {
    label: 'dof spectral reference',
    format: 'rgba32float',
    width: 1,
    height: 1,
    usage,
  });
  const pinholeGroup = device.createBindGroup({
    layout: pinhole.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniforms.buffer } }],
  });

  let width = 1;
  let height = 1;
  let batches = 0;
  let key = '';
  let current: SpectralShotSettings | undefined;

  function upload(samples: number) {
    if (!current) return;
    const shape = apertureUniforms(current.aperture);
    const { focus, blurAtInfinity } = current.lens;
    const fringe = current.shot === 'fringe' || current.shot === 'fringe-points';
    const points = fringe ? fringePoints(width, height) : [];
    const radius = FRINGE_POINT_RADIUS;
    uniforms.set({
      out_size: [width, height],
      view_scale: DOF_VIEW_SCALE,
      focus,
      lens_radius: (blurAtInfinity * focus * DOF_VIEW_SCALE) / height,
      blades: shape.blades,
      rotation: shape.rotation,
      curvature: shape.curvature,
      samples,
      point_depth: current.pointDepth ?? 10,
      scene: { night: 0, point: 1, edges: 2, 'fringe-points': 3, fringe: 4, 'fringe-bars': 5 }[
        current.shot
      ],
      pan: current.pan ?? 0,
      seed: current.seed ?? 0,
      point_count: points.length,
      point_radius: radius,
      bar_level: BAR_LEVEL,
      bar_depth: BAR_DEPTHS,
      power: powerTable(current.lca, current.focalLength ?? SPECTRAL_FOCAL_LENGTH),
      // A point's radiance: its total light over its disc's area in pixels.
      points: points.flatMap((p) => [p.x, p.y, p.z, p.light / (Math.PI * radius * radius)]),
    });
    uniforms.upload();
  }

  return {
    colour,
    depth,
    get reference() {
      return accumulated.read.view;
    },
    get referenceTexture() {
      return accumulated.read.texture;
    },
    get batches() {
      return batches;
    },
    resize(w, h) {
      width = w;
      height = h;
      colour.resize(w, h);
      depth.resize(w, h);
      if (accumulated.resize(w, h)) batches = 0;
    },
    set(settings) {
      const next = JSON.stringify([settings, width, height]);
      if (next !== key) {
        key = next;
        batches = 0;
      }
      current = settings;
    },
    renderPinhole(encoder, profiler) {
      upload(1);
      renderFullscreen(encoder, [colour.view, depth.view], pinhole, [pinholeGroup], {
        timestampWrites: profiler?.pass('sharp'),
      });
    },
    addReference(encoder, samples, profiler) {
      upload(samples);
      const group = device.createBindGroup({
        layout: referencePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniforms.buffer } },
          { binding: 1, resource: accumulated.read.view },
        ],
      });
      const pass = encoder.beginRenderPass({
        label: 'dof spectral reference',
        colorAttachments: [
          {
            view: accumulated.write.view,
            loadOp: 'clear',
            clearValue: [0, 0, 0, 0],
            storeOp: 'store',
          },
        ],
        timestampWrites: profiler?.pass('spectral reference'),
      });
      pass.setPipeline(referencePipeline);
      pass.setBindGroup(0, group);
      pass.draw(3, 1, 0, batches);
      pass.end();
      accumulated.swap();
      batches++;
    },
    destroy() {
      uniforms.destroy();
      colour.destroy();
      depth.destroy();
      accumulated.destroy();
    },
  };
}
