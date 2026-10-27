import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { haloProfile, moonDogProfile } from '../../gpu/optics/halo.ts';
import { MOON_ANGULAR_RADIUS, moonLight, moonRadiusPx } from '../../gpu/optics/moon.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { createProfileTexture } from '../../gpu/profile-texture.ts';
import { withChunks } from '../../gpu/shader.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import shader from './halo.wgsl';
import { meta } from './meta.ts';

const Params = defineUniformStruct('Params', {
  moon_pos: 'vec2f',
  range: 'vec2f',
  sky_zenith: 'vec3f',
  moon_radius: 'f32',
  sky_horizon: 'vec3f',
  phase: 'f32',
  moon_colour: 'vec3f',
  moon_light: 'f32',
  tilt: 'f32',
  lit: 'f32',
  omega: 'f32',
  aspect: 'f32',
  view_scale: 'f32',
  pitch: 'f32',
  elevation: 'f32',
  tau: 'f32',
  fibres: 'f32',
  drift: 'f32',
  columns: 'f32',
  plates: 'f32',
  dog_spread: 'f32',
  aureole: 'f32',
  glow: 'f32',
  stars: 'f32',
});

const DEG = Math.PI / 180;
/** Both tables run from the moon out to 64 degrees: past the far end of a high moon's dog tail. */
const TABLE_SIZE = 2048;
const MAX_ANGLE = 64 * DEG;
/** Blur of the halo's edge by diffraction at crystals some 60 micrometres across: lambda / D. */
const CRYSTAL_BLUR = 0.25 * DEG;

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    elevation: {
      type: 'number',
      default: 24,
      min: 0,
      max: 65,
      step: 0.5,
      label: 'moon elevation (°)',
    },
    columns: {
      type: 'number',
      default: 1,
      min: 0,
      max: 2,
      step: 0.01,
      label: 'columns (halo)',
    },
    plates: {
      type: 'number',
      default: 0.12,
      min: 0,
      max: 2,
      step: 0.01,
      label: 'plates (moon dogs)',
    },
    wobble: {
      type: 'number',
      default: 0.8,
      min: 0,
      max: 5,
      step: 0.1,
      label: 'plate wobble (°)',
    },
    cirrus: { type: 'number', default: 0.35, min: 0.02, max: 1.5, step: 0.01, label: 'veil depth' },
    fibres: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01 },
    wind: { type: 'number', default: 0.012, min: 0, max: 0.1, step: 0.001 },
    focalLength: {
      type: 'number',
      default: 18,
      min: 10,
      max: 35,
      step: 0.5,
      label: 'focal length (mm)',
    },
    moonY: { type: 'number', default: 0.42, min: 0.1, max: 0.9, step: 0.01, label: 'moon height' },
    phase: {
      type: 'number',
      default: 0.5,
      min: 0.1,
      max: 0.9,
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
    aureole: { type: 'number', default: 0.1, min: 0, max: 1, step: 0.01 },
    glow: { type: 'number', default: 0.3, min: 0, max: 4, step: 0.01, label: 'broad glow' },
    stars: { type: 'number', default: 0.001, min: 0, max: 0.01, step: 0.0005 },
    ...TAIL_PARAMS,
    exposure: { ...TAIL_PARAMS.exposure, default: 90, max: 300 },
    bloom: { ...TAIL_PARAMS.bloom, default: 0.06 },
  },
  presets: {
    'halo and dogs': {},
    'halo alone': { plates: 0 },
    'bright moon dogs': { plates: 0.6, columns: 0.5 },
    'low moon': { elevation: 4, moonY: 0.6, plates: 0.3 },
    'high moon': { elevation: 42, moonY: 0.3, focalLength: 14, plates: 0.3 },
    'thick veil': { cirrus: 1.1, fibres: 0.7 },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'ice halo' });
    const uniforms = createUniformBuffer(device, Params, 'ice halo');
    const pipeline = createFullscreenPipeline(device, {
      fragment: withChunks(shader, { 'params.wgsl': Params.wgsl }),
      entryPoint: 'sky',
      format: tail.scene.format,
    });
    const table = createProfileTexture(device, {
      width: TABLE_SIZE,
      rows: 2,
      label: 'halo profiles',
    });
    // The halo of tumbling columns depends on nothing that changes: traced once (about 90 ms).
    table.write(
      0,
      haloProfile({
        source: MOON_ANGULAR_RADIUS,
        blur: CRYSTAL_BLUR,
        maxAngle: MAX_ANGLE,
        size: TABLE_SIZE,
      }),
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
    let dogsFor = NaN;
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
        const elevation = params.elevation * DEG;
        // The dogs move out as the moon climbs: traced again when it moves (about 20 ms).
        if (params.elevation !== dogsFor) {
          dogsFor = params.elevation;
          table.write(
            1,
            moonDogProfile({
              elevation,
              source: MOON_ANGULAR_RADIUS,
              blur: CRYSTAL_BLUR,
              maxAngle: MAX_ANGLE,
              size: TABLE_SIZE,
              turns: 1500,
            }),
          );
        }
        if (params.phase !== phaseCached) {
          phaseCached = params.phase;
          lit = moonLight(params.phase, 64) / moonLight(0.5, 64);
        }
        const viewScale = 24 / params.focalLength;
        // Tilt the camera so the moon sits at `moonY` of the height, on the centre line.
        const pitch = elevation - Math.atan((0.5 - params.moonY) * viewScale);
        const radius = Math.max(1.5, moonRadiusPx(viewScale, height));
        const wobble = params.wobble * DEG;
        uniforms.set({
          moon_pos: [0.5 * width, params.moonY * height],
          range: [0, MAX_ANGLE],
          sky_zenith: [0.00004, 0.00007, 0.00016],
          moon_radius: radius,
          sky_horizon: [0.0001, 0.00013, 0.00022],
          phase: params.phase,
          moon_colour: [1, 0.97, 0.9],
          moon_light: params.brightness,
          tilt: -0.35,
          lit,
          omega: Math.PI * MOON_ANGULAR_RADIUS ** 2,
          aspect: width / height,
          view_scale: viewScale,
          pitch,
          elevation,
          tau: params.cirrus,
          fibres: params.fibres,
          drift: clock * params.wind,
          columns: params.columns,
          plates: params.plates,
          dog_spread: Math.hypot(0.5 * MOON_ANGULAR_RADIUS, wobble, CRYSTAL_BLUR),
          aureole: params.aureole,
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
