import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { MOON_ANGULAR_RADIUS, moonLight } from '../../gpu/optics/moon.ts';
import { rainbowProfile } from '../../gpu/optics/rainbow.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { createProfileTexture } from '../../gpu/profile-texture.ts';
import { withChunks } from '../../gpu/shader.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';
import shader from './moonbow.wgsl';

const Params = defineUniformStruct('Params', {
  sky_zenith: 'vec3f',
  aspect: 'f32',
  sky_horizon: 'vec3f',
  view_scale: 'f32',
  moon_colour: 'vec3f',
  moon_light: 'f32',
  range: 'vec2f',
  pitch: 'f32',
  elevation: 'f32',
  lit: 'f32',
  omega: 'f32',
  spray: 'f32',
  spray_height: 'f32',
  rise: 'f32',
  sway: 'f32',
  flow: 'f32',
  falls: 'f32',
  mist: 'f32',
  colour: 'f32',
  stars: 'f32',
});

const DEG = Math.PI / 180;
const TABLE_SIZE = 2048;
/** From the antilunar point out past the secondary bow to the edge of the widest frame. */
const MAX_ANGLE = 90 * DEG;

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    elevation: {
      type: 'number',
      default: 8,
      min: 0,
      max: 45,
      step: 0.5,
      label: 'moon elevation (°)',
    },
    colour: {
      type: 'number',
      default: 0.25,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'colour (1 = long exposure)',
    },
    spray: { type: 'number', default: 2.2, min: 0, max: 6, step: 0.05, label: 'spray depth' },
    sprayHeight: {
      type: 'number',
      default: 16,
      min: 4,
      max: 40,
      step: 0.5,
      label: 'spray height (°)',
    },
    mist: { type: 'number', default: 0.16, min: 0, max: 0.5, step: 0.005, label: 'white mist' },
    falls: { type: 'number', default: 0.6, min: 0, max: 2, step: 0.01 },
    rise: { type: 'number', default: 0.04, min: 0, max: 0.2, step: 0.005, label: 'spray rise' },
    focalLength: {
      type: 'number',
      default: 14,
      min: 10,
      max: 24,
      step: 0.5,
      label: 'focal length (mm)',
    },
    pitch: { type: 'number', default: 8, min: -10, max: 30, step: 0.5, label: 'camera tilt (°)' },
    phase: {
      type: 'number',
      default: 0.5,
      min: 0.2,
      max: 0.8,
      step: 0.01,
      label: 'phase (0.5 full)',
    },
    brightness: {
      type: 'number',
      default: 24,
      min: 1,
      max: 100,
      step: 1,
      label: 'moon brightness',
    },
    stars: { type: 'number', default: 0.00005, min: 0, max: 0.0005, step: 0.00001 },
    ...TAIL_PARAMS,
    exposure: { ...TAIL_PARAMS.exposure, default: 850, max: 3000 },
    bloom: { ...TAIL_PARAMS.bloom, default: 0.1 },
  },
  presets: {
    'by eye': {},
    'long exposure': { colour: 1, exposure: 1600 },
    'heavy spray': { spray: 4, mist: 0.12, sprayHeight: 22 },
    'higher moon': { elevation: 24, pitch: 2 },
    'second bow': { spray: 3, sprayHeight: 26, colour: 0.6, exposure: 1200 },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'moonbow' });
    const uniforms = createUniformBuffer(device, Params, 'moonbow');
    const pipeline = createFullscreenPipeline(device, {
      fragment: withChunks(shader, { 'params.wgsl': Params.wgsl }),
      entryPoint: 'scene',
      format: tail.scene.format,
    });
    const table = createProfileTexture(device, {
      width: TABLE_SIZE,
      rows: 1,
      label: 'rainbow profile',
    });
    // The drops' phase function changes with nothing on the page: traced once (about 80 ms).
    table.write(
      0,
      rainbowProfile({ source: MOON_ANGULAR_RADIUS, maxAngle: MAX_ANGLE, size: TABLE_SIZE }),
    );
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
        if (params.phase !== phaseCached) {
          phaseCached = params.phase;
          lit = moonLight(params.phase, 64) / moonLight(0.5, 64);
        }
        uniforms.set({
          sky_zenith: [0.000008, 0.000012, 0.000026],
          aspect: width / height,
          sky_horizon: [0.000018, 0.000022, 0.000034],
          view_scale: 24 / params.focalLength,
          moon_colour: [1, 0.97, 0.9],
          moon_light: params.brightness,
          range: [0, MAX_ANGLE],
          pitch: params.pitch * DEG,
          elevation: params.elevation * DEG,
          lit,
          omega: Math.PI * MOON_ANGULAR_RADIUS ** 2,
          spray: params.spray,
          spray_height: params.sprayHeight,
          rise: clock * params.rise,
          sway: 0.15 * Math.sin(clock * 0.05),
          // The water falls a little faster than the spray rises, still slow enough to be calm.
          flow: clock * 0.6,
          falls: params.falls,
          mist: params.mist,
          colour: params.colour,
          stars: params.stars,
        });
        uniforms.upload();
        renderFullscreen(encoder, tail.scene.view, pipeline, [group], {
          timestampWrites: profiler.pass('scene'),
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
