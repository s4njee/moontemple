import { getNoiseTexture } from '../../gpu/emission/noise-texture.ts';
import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { flickerIntensity } from '../../gpu/optics/flicker.ts';
import { moonRadiusPx } from '../../gpu/optics/moon.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { withChunks } from '../../gpu/shader.ts';
import { createUniformBuffer, defineUniformStruct, uniformArray } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import shader from './fog.wgsl';
import { meta } from './meta.ts';

const MAX_LAMPS = 8;

const Params = defineUniformStruct('Params', {
  eye: 'vec3f',
  aspect: 'f32',
  pitch: 'vec2f',
  view_scale: 'f32',
  /** A pixel's size at one metre: view_scale / height. */
  pixel: 'f32',
  lamp_colour: 'vec3f',
  beta: 'f32',
  ambient: 'vec3f',
  g: 'f32',
  edges: 'vec2f',
  drift: 'vec2f',
  patchy: 'f32',
  spill: 'f32',
  far: 'f32',
  lamp_count: 'f32',
  moon_dir: 'vec3f',
  cell: 'f32',
  moon_px: 'vec2f',
  moon_radius: 'f32',
  moon: 'f32',
  wet: 'f32',
  head: 'f32',
  arm: 'f32',
  /** Per lamp: the head's position, metres, and its intensity on the beam's axis. */
  lamps: uniformArray('vec4f', MAX_LAMPS),
});

type Rgb = [number, number, number];

/** Linear RGB of the lamp's light. */
const LAMPS: Record<string, Rgb> = {
  /** High-pressure sodium, about 2 100 K: the orange of the old street lamp. */
  sodium: [1, 0.48, 0.14],
  /** A 3 000 K LED. */
  'warm led': [1, 0.74, 0.48],
  /** A 4 500 K LED: the bluish white that replaced sodium. */
  'cool led': [0.86, 0.93, 1],
};

/** The eye: 1.6 m above the road, tilted up a little to see the lamps. */
const EYE: Rgb = [0, 1.6, 0];
const PITCH = 0.12;
/** A 50° vertical field of view: 2 tan(25°). */
const VIEW_SCALE = 2 * Math.tan((25 * Math.PI) / 180);
/** Below this aspect the view widens instead of cropping the lamp off the side. */
const MIN_ASPECT = 1.25;
/** The lamp heads: across the road to the right, and how far each next one stands behind. */
const HEAD_X = 2.4;
const SPACING = 13;
/**
 * The first lamp stands where its head is this far above the eye's horizon (0.455 rad: 9 m away
 * at 6 m), so a taller lamp stands further off and its head stays in the frame.
 */
const HEAD_ELEVATION = 0.455;
/** The arm from the post out over the road to the head, metres. */
const ARM = 1.3;
/** Intensity of the lamp on its axis, per unit of the `lamp` control, in the scene's units. */
const INTENSITY = 350;
/** Share of the lamp's light the glass bowl spills every way, not just down the cone: the halo. */
const SPILL = 0.05;
/** The bowl's radiance per unit intensity: bright enough to bloom. */
const HEAD = 0.06;
/** The soft edge of the shade's cone, as a share of its half-angle. */
const EDGE_SHARE = 0.3;
/** Where the fog ends, metres: past it, the sky. */
const FAR = 120;
/** The size of a fog patch, metres per noise cell, and the dim sky glow every bit of fog scatters. */
const CELL = 3.5;
const AMBIENT: Rgb = [0.005, 0.0065, 0.01];
/** The moon: up to the left, at the radiance of the disc's centre. */
const MOON_AZIMUTH = -0.42;
const MOON_ELEVATION = 0.36;
const MOON_RADIANCE = 4;
/** The breath: the slow signal's knots per second (at most one gentle swell every few seconds). */
const BREATH_RATE = 0.3;

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    fog: {
      type: 'number',
      default: 0.07,
      min: 0.005,
      max: 0.3,
      step: 0.005,
      label: 'fog density (1/m)',
    },
    forward: {
      type: 'number',
      default: 0.6,
      min: 0,
      max: 0.9,
      step: 0.01,
      label: 'forward scattering g',
    },
    height: { type: 'number', default: 6, min: 3, max: 12, step: 0.1, label: 'lamp height (m)' },
    cone: { type: 'number', default: 38, min: 10, max: 70, step: 1, label: 'cone half-angle (°)' },
    colour: {
      type: 'select',
      default: 'sodium',
      options: Object.keys(LAMPS),
      label: 'colour temperature',
    },
    lamps: { type: 'number', default: 1, min: 1, max: MAX_LAMPS, step: 1, label: 'lamps' },
    lamp: { type: 'number', default: 1, min: 0, max: 3, step: 0.05, label: 'lamp brightness' },
    drift: { type: 'number', default: 0.4, min: 0, max: 2, step: 0.05, label: 'drift (m/s)' },
    patchy: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, label: 'patchiness' },
    breath: { type: 'number', default: 0.05, min: 0, max: 0.2, step: 0.01, label: 'breath' },
    wet: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, label: 'wet road' },
    moon: { type: 'boolean', default: false, label: 'moon' },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.5 },
  },
  presets: {
    'one lamp': {},
    'a row receding': { lamps: 6, fog: 0.05 },
    'led street': { lamps: 4, colour: 'cool led', fog: 0.045, cone: 32, height: 8 },
    'thick fog': { fog: 0.16, patchy: 0.7, drift: 0.6 },
    'thin fog, moon': { fog: 0.012, moon: true, lamps: 3, patchy: 0.8 },
    'behind text': { lamp: 0.6, fog: 0.09, drift: 0.25, breath: 0, bloom: 0.3 },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'lamp in fog' });
    const uniforms = createUniformBuffer(device, Params, 'lamp in fog');
    const noise = getNoiseTexture(device);
    const pipeline = createFullscreenPipeline(device, {
      fragment: withChunks(shader, { 'params.wgsl': Params.wgsl }),
      entryPoint: 'fog',
      format: tail.scene.format,
    });
    const group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniforms.buffer } },
        { binding: 1, resource: noise.view },
        { binding: 2, resource: noise.sampler },
      ],
    });
    const lampData = new Float32Array(MAX_LAMPS * 4);
    let width = 1;
    let height = 1;
    let clock = 0;
    let count = 1;

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        clock += time.delta;
        const aspect = width / height;
        // A tall canvas (a phone, a narrow column) keeps the lamp in view by widening the view
        // rather than cropping it: never narrower than a MIN_ASPECT canvas would see.
        const viewScale = VIEW_SCALE * Math.max(1, MIN_ASPECT / aspect);
        count = Math.min(MAX_LAMPS, Math.max(1, Math.round(params.lamps)));
        // The breath: the flicker module's slow signal at a third of a knot a second and no
        // shimmer, so a lamp swells and settles over several seconds and cannot flash whatever
        // the depth. A held frame shows the lamp at its mean.
        const breathing = { rate: BREATH_RATE, depth: params.breath, shimmer: 0, shimmerRate: 0 };
        lampData.fill(0);
        const firstZ = (params.height - EYE[1]) / Math.tan(HEAD_ELEVATION);
        for (let i = 0; i < count; i++) {
          const breath = time.still
            ? 1 - params.breath / 2
            : flickerIntensity(clock, 31 + i, breathing);
          lampData.set(
            [HEAD_X, params.height, firstZ + i * SPACING, INTENSITY * params.lamp * breath],
            i * 4,
          );
        }
        // The fog drifts across the road, slightly towards the eye; the second layer of noise
        // moves at a different speed (fog.wgsl), so the patches change as well as travel.
        const drifted = (clock * params.drift) / CELL;
        const half = (params.cone * Math.PI) / 180;
        const soft = EDGE_SHARE * half;
        const inner = Math.max(half - soft / 2, 0);
        const outer = Math.min(half + soft / 2, Math.PI / 2 - 1e-3);

        // The moon's direction, and where it falls on the canvas (the inverse of view_ray).
        const moonDir: Rgb = [
          Math.sin(MOON_AZIMUTH) * Math.cos(MOON_ELEVATION),
          Math.sin(MOON_ELEVATION),
          Math.cos(MOON_AZIMUTH) * Math.cos(MOON_ELEVATION),
        ];
        const [c, s] = [Math.cos(PITCH), Math.sin(PITCH)];
        const yc = moonDir[1] * c - moonDir[2] * s;
        const zc = moonDir[1] * s + moonDir[2] * c;
        const moonPx: [number, number] = [
          (0.5 + moonDir[0] / zc / (aspect * viewScale)) * width,
          (0.5 - yc / zc / viewScale) * height,
        ];

        uniforms.set({
          eye: EYE,
          aspect,
          pitch: [c, s],
          view_scale: viewScale,
          pixel: viewScale / height,
          lamp_colour: LAMPS[params.colour] ?? LAMPS.sodium!,
          beta: params.fog,
          ambient: AMBIENT,
          g: params.forward,
          edges: [Math.cos(inner), Math.cos(outer)],
          drift: [drifted, -0.3 * drifted],
          patchy: params.patchy,
          spill: SPILL,
          far: FAR,
          lamp_count: count,
          moon_dir: moonDir,
          cell: CELL,
          moon_px: moonPx,
          moon_radius: moonRadiusPx(viewScale, height),
          moon: params.moon ? MOON_RADIANCE : 0,
          wet: params.wet,
          head: HEAD,
          arm: ARM,
          lamps: lampData,
        });
        uniforms.upload();
        renderFullscreen(encoder, tail.scene.view, pipeline, [group], {
          timestampWrites: profiler.pass('fog'),
        });
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({ lamps: count }),
      destroy() {
        uniforms.destroy();
        tail.destroy();
      },
    };
  },
});
