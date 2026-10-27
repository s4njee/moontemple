/*
 * The separable hexagon (story 3.3): two passes of one-sided line blurs whose rhombi tile a
 * hexagon. See hexagon.wgsl.
 */
import { createFullscreenPipeline, renderFullscreen } from '../fullscreen.ts';
import { withChunks } from '../shader.ts';
import { createRenderTarget } from '../targets.ts';
import { createUniformBuffer, defineUniformStruct } from '../uniforms.ts';
import shader from './hexagon.wgsl';
import type { DofMethodFactory } from './types.ts';

const HexagonParams = defineUniformStruct('HexagonParams', {
  out_size: 'vec2f',
  focus: 'f32',
  blur: 'f32',
  max_radius: 'f32',
});

/** The largest circle of confusion drawn, device pixels; beyond it a line's taps grow too sparse. */
const MAX_RADIUS = 48;

export const createHexagonDof: DofMethodFactory = (device) => {
  const uniforms = createUniformBuffer(device, HexagonParams, 'dof hexagon');
  const source = withChunks(shader, { 'hexagon-params.wgsl': HexagonParams.wgsl });
  const first = createFullscreenPipeline(device, {
    fragment: source,
    entryPoint: 'first',
    format: ['rgba16float', 'rgba16float'],
  });
  const second = createFullscreenPipeline(device, {
    fragment: source,
    entryPoint: 'second',
    format: 'rgba16float',
  });
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  const a = createRenderTarget(device, {
    label: 'dof hexagon a',
    format: 'rgba16float',
    width: 1,
    height: 1,
  });
  const b = createRenderTarget(device, {
    label: 'dof hexagon b',
    format: 'rgba16float',
    width: 1,
    height: 1,
  });

  return {
    name: 'separable hexagon',
    shapes: 'hexagon',
    resize(width, height) {
      a.resize(width, height);
      b.resize(width, height);
    },
    encode(encoder, input, output, settings, profiler) {
      uniforms.set({
        out_size: [input.width, input.height],
        focus: settings.lens.focus,
        blur: settings.lens.blurAtInfinity,
        max_radius: MAX_RADIUS,
      });
      uniforms.upload();
      const common = (pipeline: GPURenderPipeline) =>
        device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: uniforms.buffer } },
            { binding: 1, resource: input.depth },
            { binding: 2, resource: sampler },
          ],
        });
      // Automatic layouts leave out bindings a stage never reads: the first pass reads only one.
      const sources = (pipeline: GPURenderPipeline, x: GPUTextureView, y?: GPUTextureView) =>
        device.createBindGroup({
          layout: pipeline.getBindGroupLayout(1),
          entries: [{ binding: 0, resource: x }, ...(y ? [{ binding: 1, resource: y }] : [])],
        });
      renderFullscreen(
        encoder,
        [a.view, b.view],
        first,
        [common(first), sources(first, input.colour)],
        {
          timestampWrites: profiler?.pass('hexagon 1'),
        },
      );
      renderFullscreen(encoder, output, second, [common(second), sources(second, a.view, b.view)], {
        timestampWrites: profiler?.pass('hexagon 2'),
      });
    },
    destroy() {
      uniforms.destroy();
      a.destroy();
      b.destroy();
    },
  };
};
