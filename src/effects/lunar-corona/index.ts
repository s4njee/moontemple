import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { coronaProfile } from '../../gpu/optics/corona.ts';
import { MOON_ANGULAR_RADIUS, moonLight, moonRadiusPx } from '../../gpu/optics/moon.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { createProfileTexture } from '../../gpu/profile-texture.ts';
import { withChunks } from '../../gpu/shader.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import shader from './corona.wgsl';
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
  range: 'vec2f',
  cloud_scale: 'f32',
  tau: 'f32',
  patchy: 'f32',
  size_var: 'f32',
  aspect: 'f32',
  view_scale: 'f32',
  lit: 'f32',
  omega: 'f32',
  glow: 'f32',
  stars: 'f32',
});

/** Entries in the corona's table, from the moon out to `MAX_ANGLE`. */
const TABLE_SIZE = 1024;
/** Beyond the corner of the widest frame offered, with room for droplets 30% under the mean. */
const MAX_ANGLE = (24 * Math.PI) / 180;

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    radius: {
      type: 'number',
      default: 10,
      min: 3,
      max: 25,
      step: 0.5,
      label: 'droplet radius (µm)',
    },
    spread: {
      type: 'number',
      default: 0.06,
      min: 0,
      max: 0.5,
      step: 0.01,
      label: 'size spread',
    },
    sizeVariation: {
      type: 'number',
      default: 0.05,
      min: 0,
      max: 0.25,
      step: 0.005,
      label: 'size across cloud',
    },
    cloud: { type: 'number', default: 0.5, min: 0.02, max: 2, step: 0.01, label: 'cloud depth' },
    patchy: { type: 'number', default: 0.45, min: 0, max: 1, step: 0.01, label: 'patchiness' },
    scale: {
      type: 'number',
      default: 18,
      min: 3,
      max: 60,
      step: 0.5,
      label: 'cloud size (moon radii)',
    },
    wind: { type: 'number', default: 0.025, min: 0, max: 0.2, step: 0.005, label: 'wind' },
    focalLength: {
      type: 'number',
      default: 70,
      min: 24,
      max: 200,
      step: 1,
      label: 'focal length (mm)',
    },
    phase: {
      type: 'number',
      default: 0.5,
      min: 0.1,
      max: 0.9,
      step: 0.01,
      label: 'phase (0.5 full)',
    },
    moonX: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, label: 'moon across' },
    moonY: { type: 'number', default: 0.45, min: 0, max: 1, step: 0.01, label: 'moon up/down' },
    brightness: {
      type: 'number',
      default: 24,
      min: 1,
      max: 100,
      step: 1,
      label: 'moon brightness',
    },
    glow: { type: 'number', default: 1, min: 0, max: 4, step: 0.01, label: 'broad glow' },
    stars: { type: 'number', default: 0.002, min: 0, max: 0.02, step: 0.0005 },
    ...TAIL_PARAMS,
    exposure: { ...TAIL_PARAMS.exposure, default: 18, max: 60 },
    bloom: { ...TAIL_PARAMS.bloom, default: 0.12 },
  },
  presets: {
    'clear rings': {},
    'plain aureole': { spread: 0.35 },
    'small droplets': { radius: 5, focalLength: 50 },
    'large droplets': { radius: 20, focalLength: 135 },
    'iridescent cloud': { sizeVariation: 0.18, patchy: 0.8, spread: 0.12, scale: 10 },
    'gibbous moon': { phase: 0.38, spread: 0.1 },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'lunar corona' });
    const uniforms = createUniformBuffer(device, Params, 'lunar corona');
    const pipeline = createFullscreenPipeline(device, {
      fragment: withChunks(shader, { 'params.wgsl': Params.wgsl }),
      entryPoint: 'sky',
      format: tail.scene.format,
    });
    const table = createProfileTexture(device, {
      width: TABLE_SIZE,
      rows: 1,
      label: 'corona profile',
    });
    const group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniforms.buffer } },
        { binding: 1, resource: table.view },
      ],
    });
    let width = 1;
    let height = 1;
    let clock = 0;
    let built = '';
    let phaseCached = -1;
    let lit = 1;

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        if (!time.still) clock += time.delta;
        // The pattern depends only on the droplets: rebuild it when they change (20 to 70 ms).
        const key = `${params.radius}/${params.spread}`;
        if (key !== built) {
          built = key;
          table.write(
            0,
            coronaProfile({
              radius: params.radius,
              spread: params.spread,
              source: MOON_ANGULAR_RADIUS,
              maxAngle: MAX_ANGLE,
              size: TABLE_SIZE,
            }),
          );
        }
        if (params.phase !== phaseCached) {
          phaseCached = params.phase;
          lit = moonLight(params.phase, 64) / moonLight(0.5, 64);
        }
        const viewScale = 24 / params.focalLength;
        const radius = Math.max(1.5, moonRadiusPx(viewScale, height));
        const drift = clock * params.wind;
        uniforms.set({
          out_size: [width, height],
          moon_pos: [params.moonX * width, params.moonY * height],
          sky_top: [0.00011, 0.00016, 0.00042],
          moon_radius: radius,
          sky_bottom: [0.00028, 0.00035, 0.00068],
          phase: params.phase,
          moon_colour: [1, 0.97, 0.9],
          moon_light: params.brightness,
          cloud_colour: [0.0003, 0.00034, 0.00046],
          tilt: -0.35,
          drift: [drift, drift * 0.2],
          range: [0, MAX_ANGLE],
          cloud_scale: params.scale * radius,
          tau: params.cloud,
          patchy: params.patchy,
          size_var: params.sizeVariation,
          aspect: width / height,
          view_scale: viewScale,
          lit,
          omega: Math.PI * MOON_ANGULAR_RADIUS ** 2,
          glow: params.glow,
          stars: params.stars,
        });
        uniforms.upload();
        renderFullscreen(encoder, tail.scene.view, pipeline, [group], {
          timestampWrites: profiler.pass('sky'),
        });
        tail.encode(encoder, target, time, params, profiler);
      },
      destroy() {
        uniforms.destroy();
        table.destroy();
        tail.destroy();
      },
    };
  },
});
