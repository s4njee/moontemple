/*
 * Gather depth of field, the Call of Duty way (story 3.2; Jimenez 2014): half resolution, tiles of
 * the nearest blur dilated over their neighbours, separate near and far fields gathered on a
 * ring kernel of 49 to 225 taps by radius, and the near field laid over the sharp image at full
 * resolution. See gather.wgsl.
 */
import { createFullscreenPipeline, renderFullscreen } from '../fullscreen.ts';
import { withChunks } from '../shader.ts';
import { createRenderTarget } from '../targets.ts';
import { createUniformBuffer, defineUniformStruct } from '../uniforms.ts';
import shader from './gather.wgsl';
import type { DofMethodFactory } from './types.ts';

const GatherParams = defineUniformStruct('GatherParams', {
  out_size: 'vec2f',
  half_size: 'vec2f',
  focus: 'f32',
  blur: 'f32',
  max_radius: 'f32',
});

/** The largest circle of confusion drawn, device pixels; beyond it the ring's taps grow too sparse. */
const MAX_RADIUS = 48;
/** Full-resolution pixels per tile side; must match `TILE` in gather.wgsl. */
const TILE = 16;

export const createGatherDof: DofMethodFactory = (device) => {
  const uniforms = createUniformBuffer(device, GatherParams, 'dof gather');
  const source = withChunks(shader, { 'gather-params.wgsl': GatherParams.wgsl });
  const pipeline = (entryPoint: string, format: GPUTextureFormat | GPUTextureFormat[]) =>
    createFullscreenPipeline(device, { fragment: source, entryPoint, format });
  const prefilter = pipeline('prefilter', 'rgba16float');
  const spread = pipeline('spread', 'rgba16float');
  const tiles = pipeline('tiles', 'r16float');
  const dilate = pipeline('dilate', 'r16float');
  const gather = pipeline('gather', ['rgba16float', 'rgba16float']);
  const composite = pipeline('composite', 'rgba16float');
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  const target = (label: string, format: GPUTextureFormat) =>
    createRenderTarget(device, { label: `dof gather ${label}`, format, width: 1, height: 1 });
  /** Half-resolution colour, and the block's signed circle of confusion in alpha. */
  const half = target('half', 'rgba16float');
  /** The same, each texel spread over its tap's cell. */
  const spreadHalf = target('spread', 'rgba16float');
  const tileMax = target('tiles', 'r16float');
  const dilated = target('dilated', 'r16float');
  const far = target('far', 'rgba16float');
  const near = target('near', 'rgba16float');

  let halfWidth = 1;
  let halfHeight = 1;

  return {
    name: 'gather (half resolution)',
    shapes: 'circle',
    resize(width, height) {
      halfWidth = Math.ceil(width / 2);
      halfHeight = Math.ceil(height / 2);
      half.resize(halfWidth, halfHeight);
      spreadHalf.resize(halfWidth, halfHeight);
      far.resize(halfWidth, halfHeight);
      near.resize(halfWidth, halfHeight);
      const tilesX = Math.ceil(width / TILE);
      const tilesY = Math.ceil(height / TILE);
      tileMax.resize(tilesX, tilesY);
      dilated.resize(tilesX, tilesY);
    },
    encode(encoder, input, output, settings, profiler) {
      uniforms.set({
        out_size: [input.width, input.height],
        half_size: [halfWidth, halfHeight],
        focus: settings.lens.focus,
        blur: settings.lens.blurAtInfinity,
        max_radius: MAX_RADIUS,
      });
      uniforms.upload();
      // One uniform buffer, written once before the passes: every pass reads the same values.
      const groups = (
        pipeline: GPURenderPipeline,
        withSampler: boolean,
        inputs: Record<number, GPUTextureView>,
      ) => [
        device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: uniforms.buffer } },
            ...(withSampler ? [{ binding: 1, resource: sampler }] : []),
          ],
        }),
        device.createBindGroup({
          layout: pipeline.getBindGroupLayout(1),
          entries: Object.entries(inputs).map(([binding, resource]) => ({
            binding: Number(binding),
            resource,
          })),
        }),
      ];
      renderFullscreen(
        encoder,
        half.view,
        prefilter,
        groups(prefilter, false, { 0: input.colour, 1: input.depth }),
        { timestampWrites: profiler?.pass('gather prefilter') },
      );
      renderFullscreen(encoder, spreadHalf.view, spread, groups(spread, true, { 2: half.view }), {
        timestampWrites: profiler?.pass('gather spread'),
      });
      renderFullscreen(encoder, tileMax.view, tiles, groups(tiles, false, { 2: half.view }), {
        timestampWrites: profiler?.pass('gather tiles'),
      });
      renderFullscreen(encoder, dilated.view, dilate, groups(dilate, false, { 3: tileMax.view }), {
        timestampWrites: profiler?.pass('gather dilate'),
      });
      renderFullscreen(
        encoder,
        [far.view, near.view],
        gather,
        groups(gather, true, { 7: spreadHalf.view, 4: dilated.view }),
        { timestampWrites: profiler?.pass('gather fields') },
      );
      renderFullscreen(
        encoder,
        output,
        composite,
        groups(composite, true, {
          0: input.colour,
          1: input.depth,
          5: far.view,
          6: near.view,
        }),
        { timestampWrites: profiler?.pass('gather composite') },
      );
    },
    destroy() {
      uniforms.destroy();
      half.destroy();
      spreadHalf.destroy();
      tileMax.destroy();
      dilated.destroy();
      far.destroy();
      near.destroy();
    },
  };
};
