/*
 * Circular separable convolution (story 3.4): a disc from a sum of complex Gaussians, each one a
 * horizontal and a vertical pass (Garcia 2017). One, two or three components trade ringing for
 * cost. See circular.wgsl.
 */
import { createFullscreenPipeline, renderFullscreen } from '../fullscreen.ts';
import { withChunks } from '../shader.ts';
import { createRenderTarget, type RenderTarget } from '../targets.ts';
import { createUniformBuffer, defineUniformStruct, uniformArray } from '../uniforms.ts';
import shader from './circular.wgsl';
import type { DofMethodFactory } from './types.ts';

const CircularParams = defineUniformStruct('CircularParams', {
  out_size: 'vec2f',
  focus: 'f32',
  blur: 'f32',
  max_radius: 'f32',
  // Which component a horizontal pass draws; the vertical pass reads them all.
  component: 'f32',
  // Per component: (a, b, A, B), with A and B scaled so the whole 2D kernel sums to 1.
  components: uniformArray('vec4f', 3),
});

/** The largest circle of confusion drawn, device pixels, as for the hexagon. */
const MAX_RADIUS = 48;

/** Must match `TAPS` and `EXTENT` in circular.wgsl: where the kernel is sampled, kernel units. */
const TAPS = 8;
const EXTENT = 1.2;

/**
 * The components, (a, b, A, B) each: g(x) = exp(-a x²) (cos(b x²) + i sin(b x²)), weighted
 * A Re + B Im in 2D. These are Olli Niemitalo's fits (2018), the ones Garcia's talk and sample code
 * use, for a disc whose edge is at r ≈ 1.1 in these units (where the profile falls to half its
 * mean over the disc: 1.102, 1.107 and 1.107 for one, two and three components) sampled over
 * [-1.2, 1.2]. More components give a flatter disc with less ringing outside it.
 */
export const CIRCULAR_COMPONENTS = {
  1: [[0.862325, 1.624835, 0.767583, 1.862321]],
  2: [
    [0.886528, 5.268909, 0.411259, -0.548794],
    [1.960518, 1.558213, 0.513282, 4.56111],
  ],
  3: [
    [2.17649, 5.043495, 1.621035, -2.105439],
    [1.019306, 9.027613, -0.28086, -0.162882],
    [2.81511, 1.597273, -0.366471, 10.300301],
  ],
} as const satisfies Record<1 | 2 | 3, readonly (readonly [number, number, number, number])[]>;

/** The components with A and B scaled so the sampled 2D kernel sums to 1. */
function normalisedComponents(components: 1 | 2 | 3): number[] {
  const set = CIRCULAR_COMPONENTS[components];
  let sum = 0;
  for (let i = -TAPS; i <= TAPS; i++) {
    for (let j = -TAPS; j <= TAPS; j++) {
      const r2 = (EXTENT / TAPS) ** 2 * (i * i + j * j);
      for (const [a, b, A, B] of set) {
        sum += Math.exp(-a * r2) * (A * Math.cos(b * r2) + B * Math.sin(b * r2));
      }
    }
  }
  return set.flatMap(([a, b, A, B]) => [a, b, A / sum, B / sum]);
}

/** The circular separable method with one, two or three complex components. */
export function circularDof(components: 1 | 2 | 3): DofMethodFactory {
  return (device) => {
    const coefficients = normalisedComponents(components);
    // One buffer per horizontal pass: they differ in `component`, and all are encoded together.
    const uniforms = Array.from({ length: components }, (_, k) =>
      createUniformBuffer(device, CircularParams, `dof circular ${k}`),
    );
    const source = withChunks(shader, { 'circular-params.wgsl': CircularParams.wgsl });
    const horizontal = createFullscreenPipeline(device, {
      fragment: source,
      entryPoint: 'horizontal',
      format: ['rgba16float', 'rgba16float'],
    });
    const vertical = createFullscreenPipeline(device, {
      fragment: source,
      entryPoint: `vertical${components}`,
      format: 'rgba16float',
    });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    // Per component: (R.re, R.im, G.re, G.im) and (B.re, B.im, W.re, W.im).
    const targets: RenderTarget[] = Array.from({ length: components * 2 }, (_, i) =>
      createRenderTarget(device, {
        label: `dof circular ${i >> 1} ${i & 1 ? 'bw' : 'rg'}`,
        format: 'rgba16float',
        width: 1,
        height: 1,
      }),
    );

    return {
      name: 'circular separable',
      shapes: 'circle',
      resize(width, height) {
        for (const target of targets) target.resize(width, height);
      },
      encode(encoder, input, output, settings, profiler) {
        for (const [k, buffer] of uniforms.entries()) {
          buffer.set({
            out_size: [input.width, input.height],
            focus: settings.lens.focus,
            blur: settings.lens.blurAtInfinity,
            max_radius: MAX_RADIUS,
            component: k,
            components: coefficients,
          });
          buffer.upload();
        }
        const common = (pipeline: GPURenderPipeline, buffer: GPUBuffer) =>
          device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: { buffer } },
              { binding: 1, resource: input.depth },
              { binding: 2, resource: sampler },
            ],
          });
        // Automatic layouts leave out bindings a stage never reads: the horizontal pass reads only
        // the colour, the vertical pass the colour and this count's targets.
        const colour = device.createBindGroup({
          layout: horizontal.getBindGroupLayout(1),
          entries: [{ binding: 0, resource: input.colour }],
        });
        for (const [k, buffer] of uniforms.entries()) {
          renderFullscreen(
            encoder,
            [targets[2 * k]!.view, targets[2 * k + 1]!.view],
            horizontal,
            [common(horizontal, buffer.buffer), colour],
            { timestampWrites: profiler?.pass(`circular horizontal ${k}`) },
          );
        }
        const sources = device.createBindGroup({
          layout: vertical.getBindGroupLayout(1),
          entries: [
            { binding: 0, resource: input.colour },
            ...targets.map((target, i) => ({ binding: i + 1, resource: target.view })),
          ],
        });
        renderFullscreen(
          encoder,
          output,
          vertical,
          [common(vertical, uniforms[0]!.buffer), sources],
          { timestampWrites: profiler?.pass('circular vertical') },
        );
      },
      destroy() {
        for (const buffer of uniforms) buffer.destroy();
        for (const target of targets) target.destroy();
      },
    };
  };
}

export const createCircularDof: DofMethodFactory = circularDof(2);
