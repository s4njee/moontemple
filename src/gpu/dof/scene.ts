/*
 * The depth-of-field test shot and its reference (stories 3.1 and 3.8): the sharp image and depth a
 * renderer would hand a post chain, and the same shot traced through the whole lens, accumulated
 * over frames. See scene.wgsl for the shot and the method.
 */
import { createFullscreenPipeline, renderFullscreen } from '../fullscreen.ts';
import type { PassProfiler } from '../profiler.ts';
import { createShader, withChunks } from '../shader.ts';
import { createPingPongTarget, createRenderTarget, type RenderTarget } from '../targets.ts';
import { createUniformBuffer, defineUniformStruct } from '../uniforms.ts';
import { apertureUniforms, type ApertureSettings } from '../optics/aperture.ts';
import type { ThinLens } from '../optics/lens.ts';
import sceneShader from './scene.wgsl';

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
});

/** Full-frame sensor height over focal length: the shot is taken with an 85 mm lens. */
export const DOF_VIEW_SCALE = 24 / 85;

/** `edges` is the shot of story 3.8: see `edges_trace` in scene.wgsl. */
export type DofShot = 'night' | 'point' | 'edges';

export interface DofShotSettings {
  lens: ThinLens;
  aperture: ApertureSettings;
  shot: DofShot;
  /** For the `point` shot: how far away the point is, metres. */
  pointDepth?: number;
  /** The camera moved this far to the right, metres: a slow pan with parallax (story 3.7). */
  pan?: number;
}

export interface DofScene {
  /** The sharp image, `rgba16float`, and its depth, `r32float`. Valid after `renderPinhole`. */
  readonly colour: RenderTarget;
  readonly depth: RenderTarget;
  /** The reference so far, `rgba32float`; and how many batches it averages. */
  readonly reference: GPUTextureView;
  readonly referenceTexture: GPUTexture;
  readonly batches: number;
  resize(width: number, height: number): void;
  /** Sets the shot and lens; a change starts the reference again. */
  set(settings: DofShotSettings): void;
  renderPinhole(encoder: GPUCommandEncoder, profiler?: PassProfiler): void;
  /** Adds one batch of `samples` lens rays per pixel to the reference. */
  addReference(encoder: GPUCommandEncoder, samples: number, profiler?: PassProfiler): void;
  destroy(): void;
}

export function createDofScene(device: GPUDevice): DofScene {
  const uniforms = createUniformBuffer(device, DofView, 'dof scene');
  const source = withChunks(sceneShader, { 'dof-view.wgsl': DofView.wgsl });
  const pinhole = createFullscreenPipeline(device, {
    fragment: source,
    entryPoint: 'pinhole',
    format: ['rgba16float', 'r32float'],
  });
  // Its own vertex stage, which hands the fragment the batch number from the draw's first instance.
  const referenceModule = createShader(device, source);
  const referencePipeline = device.createRenderPipeline({
    label: 'dof reference',
    layout: 'auto',
    vertex: { module: referenceModule, entryPoint: 'reference_vs' },
    fragment: {
      module: referenceModule,
      entryPoint: 'reference',
      targets: [{ format: 'rgba32float' }],
    },
  });
  const usage =
    GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC;
  const colour = createRenderTarget(device, {
    label: 'dof sharp',
    format: 'rgba16float',
    width: 1,
    height: 1,
    usage,
  });
  const depth = createRenderTarget(device, {
    label: 'dof depth',
    format: 'r32float',
    width: 1,
    height: 1,
    usage,
  });
  const accumulated = createPingPongTarget(device, {
    label: 'dof reference',
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
  let current: DofShotSettings | undefined;

  function upload(samples: number) {
    if (!current) return;
    const shape = apertureUniforms(current.aperture);
    const { focus, blurAtInfinity } = current.lens;
    uniforms.set({
      out_size: [width, height],
      view_scale: DOF_VIEW_SCALE,
      focus,
      // A point at depth z then blurs to blurAtInfinity * (1 - focus / z) pixels: see scene.wgsl.
      lens_radius: (blurAtInfinity * focus * DOF_VIEW_SCALE) / height,
      blades: shape.blades,
      rotation: shape.rotation,
      curvature: shape.curvature,
      samples,
      point_depth: current.pointDepth ?? 10,
      scene: { night: 0, point: 1, edges: 2 }[current.shot],
      pan: current.pan ?? 0,
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
        label: 'dof reference',
        colorAttachments: [
          {
            view: accumulated.write.view,
            loadOp: 'clear',
            clearValue: [0, 0, 0, 0],
            storeOp: 'store',
          },
        ],
        timestampWrites: profiler?.pass('reference'),
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
