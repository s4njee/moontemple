import { DOF_METHODS, type DofMethod, type DofMethodId } from '../../gpu/dof/index.ts';
import { createDofScene, type DofShot } from '../../gpu/dof/scene.ts';
import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { APERTURE_PARAMS, type ApertureSettings } from '../../gpu/optics/aperture.ts';
import { lensFromCamera } from '../../gpu/optics/lens.ts';
import { trackPointer } from '../../gpu/pointer.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { withChunks } from '../../gpu/shader.ts';
import { createRenderTarget } from '../../gpu/targets.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import shader from './display.wgsl';
import { meta } from './meta.ts';

const Params = defineUniformStruct('Params', {
  out_size: 'vec2f',
  split: 'f32',
  dpr: 'f32',
  view: 'u32',
});

const VIEWS = ['split', 'method', 'reference', 'sharp', 'difference'] as const;
const METHODS = Object.keys(DOF_METHODS) as DofMethodId[];
const SHOTS: readonly DofShot[] = ['night', 'point'];
/** The aperture a hexagon-only method draws: blades at 30 degrees put its corners where its rays meet. */
const HEXAGON: Partial<ApertureSettings> = {
  blades: 6,
  rotation: 30,
  curvature: 0,
  rim: 0,
  rings: 0,
};

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    view: { type: 'select', default: 'split', options: VIEWS },
    method: { type: 'select', default: 'hexagon', options: METHODS },
    shot: { type: 'select', default: 'night', options: SHOTS },
    focus: { type: 'number', default: 2.5, min: 0.5, max: 60, step: 0.05, label: 'focus (m)' },
    fNumber: {
      type: 'number',
      default: 1.8,
      min: 1,
      max: 16,
      step: 0.1,
      label: 'f-number (85 mm)',
    },
    pointDepth: {
      type: 'number',
      default: 10,
      min: 0.6,
      max: 60,
      step: 0.1,
      label: 'point: depth (m)',
    },
    samples: {
      type: 'number',
      default: 8,
      min: 1,
      max: 64,
      step: 1,
      label: 'reference rays a frame',
    },
    rays: {
      type: 'number',
      default: 1024,
      min: 16,
      max: 8192,
      step: 16,
      label: 'reference rays in all',
    },
    split: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01 },
    ...APERTURE_PARAMS,
    rim: { ...APERTURE_PARAMS.rim, default: 0 },
    vignette: { ...APERTURE_PARAMS.vignette, default: 0 },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.3 },
  },
  presets: {
    'subject in focus': {},
    'background in focus': { focus: 40 },
    'foreground in focus': { focus: 0.9, fNumber: 2.8 },
    difference: { view: 'difference' },
    'one point': { shot: 'point', view: 'split' },
  },

  async create({ device, format, hdr, canvas, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'dof lab' });
    const scene = createDofScene(device);
    const pointer = trackPointer(canvas);
    const uniforms = createUniformBuffer(device, Params, 'dof lab');
    const display = createFullscreenPipeline(device, {
      fragment: withChunks(shader, { 'params.wgsl': Params.wgsl }),
      entryPoint: 'display',
      format: tail.scene.format,
    });
    const output = createRenderTarget(device, {
      label: 'dof lab method',
      format: 'rgba16float',
      width: 1,
      height: 1,
    });
    const methods = new Map<string, DofMethod>();
    let width = 1;
    let height = 1;
    let dpr = 1;

    return {
      resize(w, h, ratio) {
        width = w;
        height = h;
        dpr = ratio;
        tail.resize(w, h);
        scene.resize(w, h);
        output.resize(w, h);
        for (const method of methods.values()) method.resize(w, h);
      },
      frame(time, encoder, target) {
        const id = (METHODS as readonly string[]).includes(params.method)
          ? params.method
          : 'hexagon';
        let method = methods.get(id);
        if (!method) {
          method = DOF_METHODS[id as DofMethodId](device);
          method.resize(width, height);
          methods.set(id, method);
        }
        // A method that only draws one shape is scored against a reference with that shape.
        const aperture: ApertureSettings =
          method.shapes === 'hexagon' ? { ...params, ...HEXAGON } : params;
        const lens = lensFromCamera({
          focalLength: 85,
          fNumber: params.fNumber,
          focusDistance: params.focus,
          imageHeight: height,
        });
        scene.set({ lens, aperture, shot: params.shot as DofShot, pointDepth: params.pointDepth });
        scene.renderPinhole(encoder, profiler);
        const input = { colour: scene.colour.view, depth: scene.depth.view, width, height };
        method.encode(encoder, input, output.view, { lens, aperture }, profiler);

        const view = Math.max(0, (VIEWS as readonly string[]).indexOf(params.view));
        const wantsReference = view === 0 || view === 2 || view === 4;
        const samples = Math.round(params.samples);
        if (wantsReference) {
          // A held frame (reduced motion, a paused thumbnail) is all the visitor gets, so it shows
          // the reference as far as it will go rather than the noisy first batch; otherwise one
          // batch a frame.
          const batches = time.still ? Math.min(256, Math.ceil(params.rays / samples)) : 1;
          for (let i = 0; i < batches && scene.batches * samples < params.rays; i++) {
            scene.addReference(encoder, samples, profiler);
          }
        }

        uniforms.set({
          out_size: [width, height],
          split: pointer.state.inside ? pointer.state.x : params.split,
          dpr,
          view,
        });
        uniforms.upload();
        const group = device.createBindGroup({
          layout: display.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: uniforms.buffer } },
            { binding: 1, resource: scene.colour.view },
            { binding: 2, resource: output.view },
            { binding: 3, resource: scene.reference },
          ],
        });
        renderFullscreen(encoder, tail.scene.view, display, [group], {
          timestampWrites: profiler.pass('display'),
        });
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({
        method: methods.get(params.method)?.name ?? params.method,
        'reference rays a pixel': scene.batches * Math.round(params.samples),
      }),
      destroy() {
        pointer.destroy();
        for (const method of methods.values()) method.destroy();
        output.destroy();
        scene.destroy();
        uniforms.destroy();
        tail.destroy();
      },
    };
  },
});
