/*
 * The depth-of-field methods compared in Epic 3, by name. `sharp` hands the input through: the
 * floor every method is scored against alongside the reference.
 */
import { createFullscreenPipeline, renderFullscreen } from '../fullscreen.ts';
import fullscreen from '../../wgsl/fullscreen.wgsl';
import { createHexagonDof } from './hexagon.ts';
import type { DofMethodFactory } from './types.ts';

export * from './types.ts';

const createSharp: DofMethodFactory = (device) => {
  const pipeline = createFullscreenPipeline(device, {
    fragment: {
      label: 'dof/sharp.wgsl',
      code: `#include "fullscreen.wgsl"
@group(0) @binding(0) var colour: texture_2d<f32>;
@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  return vec4f(textureLoad(colour, vec2i(in.position.xy), 0).rgb, 1.0);
}`,
      chunks: { ...fullscreen.chunks, 'fullscreen.wgsl': fullscreen.code },
    },
    format: 'rgba16float',
  });
  return {
    name: 'sharp (no depth of field)',
    shapes: 'any',
    resize() {},
    encode(encoder, input, output, _settings, profiler) {
      const group = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: input.colour }],
      });
      renderFullscreen(encoder, output, pipeline, [group], {
        timestampWrites: profiler?.pass('sharp copy'),
      });
    },
    destroy() {},
  };
};

export const DOF_METHODS = {
  sharp: createSharp,
  hexagon: createHexagonDof,
} as const satisfies Record<string, DofMethodFactory>;

export type DofMethodId = keyof typeof DOF_METHODS;
