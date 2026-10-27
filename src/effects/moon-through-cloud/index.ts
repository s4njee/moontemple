import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { MOON_ANGULAR_RADIUS, moonLight, moonRadiusPx } from '../../gpu/optics/moon.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { withChunks } from '../../gpu/shader.ts';
import { createRenderTarget } from '../../gpu/targets.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import shader from './cloud.wgsl';
import { meta } from './meta.ts';

const Params = defineUniformStruct('Params', {
  out_size: 'vec2f',
  moon_pos: 'vec2f',
  sky_top: 'vec3f',
  moon_radius: 'f32',
  sky_bottom: 'vec3f',
  phase: 'f32',
  moon_colour: 'vec3f',
  moon_light: 'f32',
  cloud_colour: 'vec3f',
  tilt: 'f32',
  drift: 'vec2f',
  cloud_scale: 'f32',
  cover: 'f32',
  thickness: 'f32',
  veil: 'f32',
  aureole: 'f32',
  glow: 'f32',
  forward: 'f32',
  pixel_angle: 'f32',
  lit: 'f32',
  stars: 'f32',
  omega: 'f32',
});

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    focalLength: {
      type: 'number',
      default: 400,
      min: 50,
      max: 1200,
      step: 10,
      label: 'focal length (mm)',
    },
    phase: {
      type: 'number',
      default: 0.5,
      min: 0.03,
      max: 0.97,
      step: 0.01,
      label: 'phase (0.5 full)',
    },
    moonX: { type: 'number', default: 0.62, min: 0, max: 1, step: 0.01, label: 'moon across' },
    moonY: { type: 'number', default: 0.38, min: 0, max: 1, step: 0.01, label: 'moon up/down' },
    brightness: {
      type: 'number',
      default: 24,
      min: 1,
      max: 100,
      step: 1,
      label: 'moon brightness',
    },
    cover: { type: 'number', default: 0.55, min: 0, max: 1, step: 0.01, label: 'cloud cover' },
    thickness: {
      type: 'number',
      default: 3.5,
      min: 0,
      max: 10,
      step: 0.1,
      label: 'cloud thickness',
    },
    veil: { type: 'number', default: 0.12, min: 0, max: 1, step: 0.01, label: 'thin veil' },
    scale: {
      type: 'number',
      default: 7,
      min: 1,
      max: 30,
      step: 0.5,
      label: 'cloud size (moon radii)',
    },
    wind: { type: 'number', default: 0.04, min: 0, max: 0.4, step: 0.005, label: 'wind' },
    aureole: { type: 'number', default: 1, min: 0, max: 4, step: 0.01 },
    glow: { type: 'number', default: 1, min: 0, max: 4, step: 0.01, label: 'wide glow' },
    forward: {
      type: 'number',
      default: 0.85,
      min: 0,
      max: 0.98,
      step: 0.01,
      label: 'forward scattering',
    },
    stars: { type: 'number', default: 0.02, min: 0, max: 0.2, step: 0.005 },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.5 },
  },
  presets: {
    'thin cloud': {},
    'silver edges': { cover: 0.42, thickness: 6, veil: 0.04 },
    'veiled moon': { cover: 0.15, veil: 0.5, aureole: 1.5 },
    'breaking cloud': { cover: 0.7, thickness: 5, wind: 0.08 },
    crescent: { phase: 0.15, cover: 0.45 },
    'wide lens': { focalLength: 50, scale: 30, moonY: 0.3 },
    // A camera's choice: expose for the face and the cloud round it goes dark, as in a photograph;
    // the eye sees the default, a moon too bright for detail in a glow.
    'exposed for the face': { brightness: 1.3, aureole: 4, glow: 4, bloom: 0.15 },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'moon through cloud' });
    const uniforms = createUniformBuffer(device, Params, 'moon through cloud');
    const source = withChunks(shader, { 'params.wgsl': Params.wgsl });
    const depthPass = createFullscreenPipeline(device, {
      fragment: source,
      entryPoint: 'depth',
      format: 'r16float',
    });
    const skyPass = createFullscreenPipeline(device, {
      fragment: source,
      entryPoint: 'sky',
      format: tail.scene.format,
    });
    const depth = createRenderTarget(device, {
      label: 'cloud depth',
      format: 'r16float',
      width: 1,
      height: 1,
    });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    let width = 1;
    let height = 1;
    let clock = 0;
    let phaseCached = -1;
    let lit = 1;

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
        depth.resize(Math.ceil(w / 4), Math.ceil(h / 4));
      },
      frame(time, encoder, target) {
        clock += time.delta;
        // How much of the face is lit, relative to full: what the cloud has to scatter.
        if (params.phase !== phaseCached) {
          phaseCached = params.phase;
          lit = moonLight(params.phase, 64) / moonLight(0.5, 64);
        }
        const viewScale = 24 / params.focalLength;
        const radius = Math.max(1.5, moonRadiusPx(viewScale, height));
        // The wind moves the cloud in noise cells a second; slow enough that a cloud takes many
        // seconds to cross the moon.
        const drift = clock * params.wind;
        uniforms.set({
          out_size: [width, height],
          moon_pos: [params.moonX * width, params.moonY * height],
          sky_top: [0.0016, 0.0024, 0.0062],
          moon_radius: radius,
          sky_bottom: [0.0042, 0.0052, 0.0098],
          phase: params.phase,
          moon_colour: [1, 0.97, 0.9],
          moon_light: params.brightness,
          cloud_colour: [0.0045, 0.005, 0.0068],
          tilt: -0.35,
          drift: [drift, drift * 0.18],
          cloud_scale: params.scale * radius,
          cover: params.cover,
          thickness: params.thickness,
          veil: params.veil,
          aureole: params.aureole,
          glow: params.glow,
          forward: params.forward,
          pixel_angle: viewScale / height,
          lit,
          stars: params.stars,
          omega: Math.PI * MOON_ANGULAR_RADIUS ** 2,
        });
        uniforms.upload();
        const group = (pipeline: GPURenderPipeline, withDepth: boolean) =>
          device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: { buffer: uniforms.buffer } },
              ...(withDepth
                ? [
                    { binding: 1, resource: depth.view },
                    { binding: 2, resource: sampler },
                  ]
                : []),
            ],
          });
        renderFullscreen(encoder, depth.view, depthPass, [group(depthPass, false)], {
          timestampWrites: profiler.pass('cloud depth'),
        });
        renderFullscreen(encoder, tail.scene.view, skyPass, [group(skyPass, true)], {
          timestampWrites: profiler.pass('sky'),
        });
        tail.encode(encoder, target, time, params, profiler);
      },
      destroy() {
        uniforms.destroy();
        depth.destroy();
        tail.destroy();
      },
    };
  },
});
