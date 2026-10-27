/*
 * Sprite bokeh (story 3.5; after Sousa, CryENGINE 3 Graphics Gems, SIGGRAPH 2013): the highlights
 * are taken out of the image in compute and drawn as sprites of the aperture's shape with an
 * indirect draw; everything else gets a cheap disc gather. The aperture's shape only shows on
 * highlights, which is where the eye looks for it.
 *
 *   clear     the append counter
 *   extract   compute, one invocation per 2 x 2 block: appends highlight records, writes the rest
 *             of the light to `remainder` (sprites-extract.wgsl)
 *   finalise  compute, one invocation: the indirect draw's arguments
 *   gather    fullscreen: `remainder` blurred as a disc, into the output (sprites.wgsl)
 *   sprites   drawIndirect: each highlight as the aperture, added onto the output
 *
 * Light is conserved: what a highlight gives up is what its sprite adds, and the sprite adds
 * exactly its light whatever its size or shape (aperture.wgsl). At most `capacity` sprites are
 * drawn; a block that finds the buffer full keeps its light in the remainder, so past the cap the
 * extra highlights are blurred as discs rather than lost.
 */
import { createFullscreenPipeline, renderFullscreen } from '../fullscreen.ts';
import { createShader, withChunks } from '../shader.ts';
import { createRenderTarget } from '../targets.ts';
import { createUniformBuffer, defineUniformStruct, uniformArray } from '../uniforms.ts';
import { apertureUniforms } from '../optics/aperture.ts';
import drawShader from './sprites.wgsl';
import extractShader from './sprites-extract.wgsl';
import type { DofMethod, DofMethodFactory } from './types.ts';

const SpriteParams = defineUniformStruct('SpriteParams', {
  out_size: 'vec2f',
  focus: 'f32',
  blur: 'f32',
  threshold: 'f32',
  min_coc: 'f32',
  max_radius: 'f32',
  capacity: 'u32',
  blades: 'f32',
  rotation: 'f32',
  curvature: 'f32',
  unit_area: 'f32',
  rim: 'f32',
  rings: 'f32',
  ring_count: 'f32',
  vignette: 'f32',
  obstruction: 'f32',
  profile_mean: 'f32',
  use_table: 'f32',
  table: uniformArray('vec4f', 16),
});

/** Bytes per sprite record: (x, y, radius, unused, r, g, b, unused), as src/gpu/points.ts. */
const SPRITE_BYTES = 32;

export interface SpriteDofOptions {
  /** Luminance above which a pixel's light becomes a sprite. Default 1.5. */
  threshold?: number;
  /** Circle of confusion, device pixels, below which a pixel stays in the gather. Default 2. */
  minCoc?: number;
  /** The most sprites drawn in a frame. Default 16 384 (512 KiB of records). */
  capacity?: number;
  /** The largest circle of confusion drawn, device pixels. Default 64. */
  maxRadius?: number;
}

export interface SpriteDof extends DofMethod {
  /**
   * After the frame's commands are submitted: how many blocks asked for a sprite in the last
   * `encode`, and how many got one (the rest stayed in the gather).
   */
  readSpriteCount(): Promise<{ wanted: number; drawn: number }>;
}

export function createSpriteBokeh(device: GPUDevice, options: SpriteDofOptions = {}): SpriteDof {
  const threshold = options.threshold ?? 1.5;
  const minCoc = options.minCoc ?? 2;
  const capacity = options.capacity ?? 16384;
  const maxRadius = options.maxRadius ?? 64;

  const uniforms = createUniformBuffer(device, SpriteParams, 'dof sprites');
  const chunks = { 'sprites-params.wgsl': SpriteParams.wgsl };
  const extractModule = createShader(device, withChunks(extractShader, chunks));
  const extract = device.createComputePipeline({
    label: 'dof sprites extract',
    layout: 'auto',
    compute: { module: extractModule, entryPoint: 'extract' },
  });
  const finalise = device.createComputePipeline({
    label: 'dof sprites finalise',
    layout: 'auto',
    compute: { module: extractModule, entryPoint: 'finalise' },
  });
  const drawSource = withChunks(drawShader, chunks);
  const gather = createFullscreenPipeline(device, {
    fragment: drawSource,
    entryPoint: 'gather',
    format: 'rgba16float',
  });
  const drawModule = createShader(device, drawSource);
  const add: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one', operation: 'add' };
  const sprites = device.createRenderPipeline({
    label: 'dof sprites',
    layout: 'auto',
    vertex: { module: drawModule, entryPoint: 'sprite_vs' },
    fragment: {
      module: drawModule,
      entryPoint: 'sprite_fs',
      targets: [{ format: 'rgba16float', blend: { color: add, alpha: add } }],
    },
  });
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

  const points = device.createBuffer({
    label: 'dof sprites points',
    size: capacity * SPRITE_BYTES,
    usage: GPUBufferUsage.STORAGE,
  });
  const counter = device.createBuffer({
    label: 'dof sprites counter',
    size: 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });
  const args = device.createBuffer({
    label: 'dof sprites draw args',
    size: 16,
    usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.STORAGE,
  });
  // Full resolution: the gather reads it, the extract pass writes it.
  const remainder = createRenderTarget(device, {
    label: 'dof sprites remainder',
    format: 'rgba16float',
    width: 1,
    height: 1,
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  });
  const finaliseGroup = device.createBindGroup({
    layout: finalise.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniforms.buffer } },
      { binding: 5, resource: { buffer: counter } },
      { binding: 6, resource: { buffer: args } },
    ],
  });
  const spriteGroups = [
    device.createBindGroup({
      layout: sprites.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniforms.buffer } }],
    }),
    device.createBindGroup({
      layout: sprites.getBindGroupLayout(1),
      entries: [{ binding: 0, resource: { buffer: points } }],
    }),
  ];

  // The shape's area is a sum over angles: only redone when the aperture changes.
  let apertureKey = '';
  let shape = apertureUniforms({
    blades: 0,
    rotation: 0,
    curvature: 0,
    rim: 0,
    rings: 0,
    ringCount: 1,
    vignette: 0,
  });

  return {
    name: 'sprite bokeh',
    shapes: 'any',
    resize(width, height) {
      remainder.resize(width, height);
    },
    encode(encoder, input, output, settings, profiler) {
      const key = JSON.stringify(settings.aperture);
      if (key !== apertureKey) {
        apertureKey = key;
        shape = apertureUniforms(settings.aperture);
      }
      uniforms.set({
        out_size: [input.width, input.height],
        focus: settings.lens.focus,
        blur: settings.lens.blurAtInfinity,
        threshold,
        min_coc: minCoc,
        max_radius: maxRadius,
        capacity,
        ...shape,
      });
      uniforms.upload();

      encoder.clearBuffer(counter);
      const compute = encoder.beginComputePass({
        label: 'dof sprites extract',
        timestampWrites: profiler?.pass('sprites extract'),
      });
      compute.setPipeline(extract);
      compute.setBindGroup(
        0,
        device.createBindGroup({
          layout: extract.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: uniforms.buffer } },
            { binding: 1, resource: input.colour },
            { binding: 2, resource: input.depth },
            { binding: 3, resource: remainder.view },
            { binding: 4, resource: { buffer: points } },
            { binding: 5, resource: { buffer: counter } },
          ],
        }),
      );
      compute.dispatchWorkgroups(Math.ceil(input.width / 16), Math.ceil(input.height / 16));
      compute.setPipeline(finalise);
      compute.setBindGroup(0, finaliseGroup);
      compute.dispatchWorkgroups(1);
      compute.end();

      const gatherGroup = device.createBindGroup({
        layout: gather.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniforms.buffer } },
          { binding: 1, resource: remainder.view },
          { binding: 2, resource: sampler },
        ],
      });
      renderFullscreen(encoder, output, gather, [gatherGroup], {
        timestampWrites: profiler?.pass('sprites gather'),
      });

      const pass = encoder.beginRenderPass({
        label: 'dof sprites',
        colorAttachments: [{ view: output, loadOp: 'load', storeOp: 'store' }],
        timestampWrites: profiler?.pass('sprites draw'),
      });
      pass.setPipeline(sprites);
      pass.setBindGroup(0, spriteGroups[0]!);
      pass.setBindGroup(1, spriteGroups[1]!);
      pass.drawIndirect(args, 0);
      pass.end();
    },
    async readSpriteCount() {
      const read = device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      const encoder = device.createCommandEncoder();
      encoder.copyBufferToBuffer(counter, 0, read, 0, 4);
      device.queue.submit([encoder.finish()]);
      await read.mapAsync(GPUMapMode.READ);
      const wanted = new Uint32Array(read.getMappedRange())[0]!;
      read.unmap();
      read.destroy();
      return { wanted, drawn: Math.min(wanted, capacity) };
    },
    destroy() {
      uniforms.destroy();
      points.destroy();
      counter.destroy();
      args.destroy();
      remainder.destroy();
    },
  };
}

export const createSpriteDof: DofMethodFactory = (device) => createSpriteBokeh(device);
