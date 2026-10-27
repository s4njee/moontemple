import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { withChunks } from '../../gpu/shader.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';
import shader from './orbs.wgsl';

const Params = defineUniformStruct('Params', {
  light_pos: 'vec2f',
  aspect: 'f32',
  time: 'f32',
  pixel: 'f32',
  density: 'f32',
  blur: 'f32',
  gain: 'f32',
  glow: 'f32',
});

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    density: { type: 'number', default: 0.3, min: 0, max: 1, step: 0.01 },
    blur: { type: 'number', default: 1, min: 0, max: 3, step: 0.05, label: 'defocus' },
    speed: { type: 'number', default: 1, min: 0, max: 4, step: 0.05 },
    gain: { type: 'number', default: 0.55, min: 0, max: 4, step: 0.05, label: 'orbs' },
    glow: { type: 'number', default: 1, min: 0, max: 3, step: 0.05, label: 'light' },
    ...TAIL_PARAMS,
  },
  presets: {
    'deep blue': {},
    sparse: { density: 0.15, gain: 0.9 },
    'nearly in focus': { blur: 0.15 },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'hello' });
    const uniforms = createUniformBuffer(device, Params, 'hello params');
    const pipeline = createFullscreenPipeline(device, {
      fragment: withChunks(shader, { 'params.wgsl': Params.wgsl }),
      entryPoint: 'orbs',
      format: tail.scene.format,
    });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniforms.buffer } }],
    });
    let width = 1;
    let height = 1;
    let clock = 0;

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        clock += time.delta * params.speed;
        uniforms.set({
          light_pos: [0.5, 0.18],
          aspect: width / height,
          time: clock,
          pixel: 1 / height,
          density: params.density,
          blur: params.blur,
          gain: params.gain,
          glow: params.glow,
        });
        uniforms.upload();
        renderFullscreen(encoder, tail.scene.view, pipeline, [bindGroup], {
          timestampWrites: profiler.pass('orbs'),
        });
        tail.encode(encoder, target, time, params, profiler);
      },
      destroy() {
        uniforms.destroy();
        tail.destroy();
      },
    };
  },
});
