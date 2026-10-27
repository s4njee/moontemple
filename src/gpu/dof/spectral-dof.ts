/*
 * Spectral depth of field as a post-process (story 9.7): any method of Epic 3 (3.9's choice is
 * gather) run once per band at that band's focus, and the images summed with each band's share of
 * each channel.
 *
 * A wavelength's circle of confusion is the 555 nm one shifted by the same number of pixels at
 * every depth (src/gpu/optics/lca.ts), which is a thin lens of its own (`shiftedLens`), so the
 * method needs no change: it is handed that lens. Three bands (`channels`) give each channel its
 * own circle, the cheap version; eight wavelengths cost eight runs. Each band has its own instance
 * of the method, because a method writes its uniforms when it is encoded, and several runs in one
 * command encoder would otherwise all read the last one's.
 *
 * The weights sum to (1, 1, 1) over the bands, so a method that keeps the light keeps it per
 * channel here too.
 */
import { createFullscreenPipeline, renderFullscreen } from '../fullscreen.ts';
import { withChunks } from '../shader.ts';
import { createRenderTarget, type RenderTarget } from '../targets.ts';
import { createUniformBuffer, defineUniformStruct, uniformArray } from '../uniforms.ts';
import { lcaBands, shiftedLens, type LcaBands, type LcaSettings } from '../optics/lca.ts';
import shader from './spectral-combine.wgsl';
import type { DofMethod, DofMethodFactory } from './types.ts';

const CombineParams = defineUniformStruct('CombineParams', {
  weights: uniformArray('vec4f', 8),
});

/** The most bands one spectral method draws. */
export const MAX_DOF_BANDS = 8;

export interface SpectralDofOptions {
  /** The method each band is drawn with. */
  method: DofMethodFactory;
  lca: LcaSettings;
  /** Focal length, in the lens's distance units (metres). */
  focalLength: number;
  /** `none`, `channels` or a number of wavelengths up to 8. */
  bands: LcaBands;
  /** Shown in the study. Default from the method and bands. */
  name?: string;
}

export interface SpectralDofMethod extends DofMethod {
  /** Change the aberration or the bands; takes effect at the next encode. */
  set(options: Partial<Pick<SpectralDofOptions, 'lca' | 'focalLength' | 'bands'>>): void;
}

export function createSpectralDof(
  device: GPUDevice,
  options: SpectralDofOptions,
): SpectralDofMethod {
  let { lca, focalLength, bands } = options;
  const uniforms = createUniformBuffer(device, CombineParams, 'dof spectral combine');
  const pipeline = createFullscreenPipeline(device, {
    fragment: withChunks(shader, { 'combine-params.wgsl': CombineParams.wgsl }),
    entryPoint: 'combine',
    format: 'rgba16float',
  });
  const methods: DofMethod[] = [];
  const images: RenderTarget[] = [];
  let width = 1;
  let height = 1;
  const first = options.method(device);

  function ensure(count: number) {
    while (methods.length < count) {
      const method = methods.length === 0 ? first : options.method(device);
      method.resize(width, height);
      methods.push(method);
      images.push(
        createRenderTarget(device, {
          label: `dof spectral band ${images.length}`,
          format: 'rgba16float',
          width,
          height,
        }),
      );
    }
  }

  const bandName =
    bands === 'none'
      ? 'no aberration'
      : bands === 'channels'
        ? '3 channels'
        : `${bands} wavelengths`;
  return {
    name: options.name ?? `${first.name}, ${bandName}`,
    shapes: first.shapes,
    set(next) {
      lca = next.lca ?? lca;
      focalLength = next.focalLength ?? focalLength;
      bands = next.bands ?? bands;
    },
    resize(w, h) {
      width = w;
      height = h;
      for (const method of methods) method.resize(w, h);
      for (const image of images) image.resize(w, h);
    },
    encode(encoder, input, output, settings, profiler) {
      const split = lcaBands(settings.lens, focalLength, lca, bands).slice(0, MAX_DOF_BANDS);
      ensure(split.length);
      const weights = new Float32Array(MAX_DOF_BANDS * 4);
      split.forEach((band, i) => {
        weights.set([...band.weight, 0], i * 4);
        methods[i]!.encode(
          encoder,
          input,
          images[i]!.view,
          { ...settings, lens: shiftedLens(settings.lens, band.shift) },
          profiler,
        );
      });
      uniforms.set({ weights });
      uniforms.upload();
      const group = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniforms.buffer } },
          ...Array.from({ length: MAX_DOF_BANDS }, (_, i) => ({
            binding: i + 1,
            resource: images[i < split.length ? i : 0]!.view,
          })),
        ],
      });
      renderFullscreen(encoder, output, pipeline, [group], {
        timestampWrites: profiler?.pass('spectral combine'),
      });
    },
    destroy() {
      for (const method of methods) method.destroy();
      if (methods.length === 0) first.destroy();
      for (const image of images) image.destroy();
      uniforms.destroy();
    },
  };
}

/** As a factory, for the lab and the scoring helpers. */
export const spectralDofFactory =
  (options: SpectralDofOptions): DofMethodFactory =>
  (device) =>
    createSpectralDof(device, options);
