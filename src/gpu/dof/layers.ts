/*
 * Layered depth of field and the tilt-shift band (story 3.6): seven slices by circle of confusion,
 * each blurred at half size by its own amount, composited back to front, over an eighth slice that
 * fills what a near object hid. See layers.wgsl.
 *
 * `layers` takes the circle of confusion from the depth. `tilt-shift` takes it from the pixel's
 * height alone, blur growing away from a horizontal band: what flat layers, images and anything
 * DOM-shaped can have, since they have no depth.
 */
import { createFullscreenPipeline, renderFullscreen } from '../fullscreen.ts';
import { createBlur, type Blur } from '../passes/blur.ts';
import { withChunks } from '../shader.ts';
import { createRenderTarget, type RenderTarget } from '../targets.ts';
import { createUniformBuffer, defineUniformStruct, uniformArray } from '../uniforms.ts';
import shader from './layers.wgsl';
import type { DofMethodFactory } from './types.ts';

const LayersParams = defineUniformStruct('LayersParams', {
  out_size: 'vec2f',
  focus: 'f32',
  blur: 'f32',
  tilt_shift: 'f32',
  band_centre: 'f32',
  band_half: 'f32',
  band_ramp: 'f32',
  centres: uniformArray('vec4f', 2),
});

const SLICES = 7;
/** The in-focus slice: drawn sharp at full size, never blurred. */
const SHARP = 3;
/** The fill: everything not in front, blurred as wide as the nearest slice. */
const FILL = SLICES;

export interface TiltShift {
  /** Height of the band's middle, 0 top to 1 bottom. */
  centre: number;
  /** Half the band's height, as a share of the image. */
  half: number;
  /** How far beyond the band the blur takes to reach its full size, as a share of the image. */
  ramp: number;
}

export function layeredDof(tiltShift?: TiltShift): DofMethodFactory {
  return (device) => {
    const uniforms = createUniformBuffer(device, LayersParams, 'dof layers');
    const source = withChunks(shader, { 'layers-params.wgsl': LayersParams.wgsl });
    const extract = createFullscreenPipeline(device, {
      fragment: source,
      entryPoint: 'extract',
      format: 'rgba16float',
    });
    const composite = createFullscreenPipeline(device, {
      fragment: source,
      entryPoint: 'composite',
      format: 'rgba16float',
    });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    // One small uniform per slice: written once, read by that slice's pass alone.
    const sliceIndex = Array.from({ length: SLICES + 1 }, (_, i) => {
      const buffer = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(buffer, 0, new Float32Array([i, 0, 0, 0]));
      return buffer;
    });
    const slices: RenderTarget[] = [];
    // One target for every slice's unblurred extract: each is blurred into its slice before the next
    // is drawn, in order within the encoder.
    const scratch = createRenderTarget(device, {
      label: 'dof slice raw',
      format: 'rgba16float',
      width: 1,
      height: 1,
    });
    // A blur per slice, since a blur's parameters are written once per submit (passes/blur.ts).
    const blurs: Blur[] = [];
    for (let i = 0; i <= SLICES; i++) {
      slices.push(
        createRenderTarget(device, {
          label: `dof slice ${i}`,
          format: 'rgba16float',
          width: 1,
          height: 1,
        }),
      );
      blurs.push(
        createBlur(device, { label: `dof slice ${i}`, format: 'rgba16float', width: 1, height: 1 }),
      );
    }

    return {
      name: tiltShift ? 'tilt-shift (no depth)' : 'layers',
      shapes: 'circle',
      resize(width, height) {
        const w = Math.max(1, Math.ceil(width / 2));
        const h = Math.max(1, Math.ceil(height / 2));
        scratch.resize(w, h);
        // The sharp slice is drawn from the input at full size: its targets stay at 1 x 1.
        for (let i = 0; i <= SLICES; i++) {
          if (i === SHARP) continue;
          slices[i]!.resize(w, h);
          blurs[i]!.resize(w, h);
        }
      },
      encode(encoder, input, output, settings, profiler) {
        const b = settings.lens.blurAtInfinity;
        // Slice centres, nearest first. Behind the focus the blur runs from 0 to b. In front of it
        // it has no bound and is often far larger (focused at 40 m, b is under a pixel while a post
        // a metre from the lens blurs by tens), so the near slices are spaced by thirds down from a
        // tenth of the image height, or three times b if that is more. The tilt-shift band is
        // symmetric.
        const near = Math.max(3 * b, 0.1 * input.height);
        const centres = tiltShift
          ? [-b, (-2 * b) / 3, -b / 3, 0, b / 3, (2 * b) / 3, b]
          : [-near, -near / 3, -near / 9, 0, b / 3, (2 * b) / 3, b];
        uniforms.set({
          out_size: [input.width, input.height],
          focus: settings.lens.focus,
          blur: b,
          tilt_shift: tiltShift ? 1 : 0,
          band_centre: tiltShift?.centre ?? 0.5,
          band_half: tiltShift?.half ?? 0.1,
          band_ramp: tiltShift?.ramp ?? 0.3,
          centres: new Float32Array([...centres, 0]),
        });
        uniforms.upload();
        const common = (pipeline: GPURenderPipeline, withSampler: boolean) =>
          device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: { buffer: uniforms.buffer } },
              { binding: 1, resource: input.colour },
              { binding: 2, resource: input.depth },
              ...(withSampler ? [{ binding: 3, resource: sampler }] : []),
            ],
          });
        const extractCommon = common(extract, false);
        for (let i = 0; i <= SLICES; i++) {
          if (i === SHARP) continue;
          renderFullscreen(
            encoder,
            scratch.view,
            extract,
            [
              extractCommon,
              device.createBindGroup({
                layout: extract.getBindGroupLayout(1),
                entries: [{ binding: 0, resource: { buffer: sliceIndex[i]! } }],
              }),
            ],
            { timestampWrites: profiler?.pass(`slice ${i}`) },
          );
          // A disc of radius r has the variance of a Gaussian of sigma r / 2; at half size, r / 4.
          const sigma = Math.max(0.5, Math.abs(centres[i === FILL ? 0 : i]!) / 4);
          blurs[i]!.encode(encoder, scratch.view, slices[i]!.view, {
            radius: Math.min(64, Math.ceil(sigma * 3)),
            sigma,
          });
        }
        const textures = [0, 1, 2, 4, 5, 6, FILL].map((i, k) => ({
          binding: k + 1,
          resource: slices[i]!.view,
        }));
        renderFullscreen(
          encoder,
          output,
          composite,
          [
            common(composite, true),
            device.createBindGroup({ layout: composite.getBindGroupLayout(1), entries: textures }),
          ],
          { timestampWrites: profiler?.pass('layers composite') },
        );
      },
      destroy() {
        uniforms.destroy();
        for (const buffer of sliceIndex) buffer.destroy();
        for (const t of [...slices, scratch]) t.destroy();
        for (const blur of blurs) blur.destroy();
      },
    };
  };
}

export const createLayersDof = layeredDof();
export const createTiltShiftDof = layeredDof({ centre: 0.55, half: 0.08, ramp: 0.3 });
