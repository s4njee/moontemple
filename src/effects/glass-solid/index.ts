import {
  CAUSTIC_MODES,
  createGlassBody,
  DEFAULT_KEY,
  GLASS_NAMES,
  SAMPLING_MODES,
  type CausticMode,
  type GlassName,
  type SamplingMode,
} from '../../gpu/glass/body.ts';
import { rotationAxisAngle, turn } from '../../gpu/glass/solid.ts';
import type { PlatonicSolid } from '../../gpu/optics/glass.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';

const SOLIDS = ['icosahedron', 'dodecahedron', 'octahedron', 'cube', 'tetrahedron'] as const;

/** Where the turn starts, and the angle a held frame shows: a corner up and a face towards us. */
const REST_ANGLE = 0.45;
/** The solid's resting orientation before the turn: a little off its symmetry axes. */
const BODY = rotationAxisAngle([0.3, 0.1, 1], 0.32);

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    solid: { type: 'select', default: 'icosahedron', options: SOLIDS },
    glass: { type: 'select', default: 'flint', options: GLASS_NAMES, label: 'glass (air: bubble)' },
    sampling: { type: 'select', default: 'spectral', options: SAMPLING_MODES },
    samples: {
      type: 'number',
      default: 1,
      min: 1,
      max: 8,
      step: 1,
      label: 'samples a pixel a frame',
    },
    resolution: {
      type: 'number',
      default: 0.5,
      min: 0.25,
      max: 1,
      step: 0.05,
      label: 'trace resolution',
    },
    bounces: { type: 'number', default: 5, min: 0, max: 8, step: 1, label: 'bounces inside' },
    transmission: {
      type: 'color',
      default: [0.3, 0.72, 1],
      label: 'colour through one radius',
    },
    absorption: { type: 'number', default: 0.7, min: 0, max: 3, step: 0.01 },
    glow: { type: 'number', default: 0.08, min: 0, max: 0.3, step: 0.001 },
    glowColour: { type: 'color', default: [0.15, 0.55, 1], label: 'glow colour' },
    turnSpeed: {
      type: 'number',
      default: 0.1,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'turn (rad/s)',
    },
    tilt: { type: 'number', default: 0.35, min: -1, max: 1, step: 0.01 },
    caustics: { type: 'select', default: 'stand-in', options: CAUSTIC_MODES },
    causticStrength: {
      type: 'number',
      default: 0.35,
      min: 0,
      max: 2,
      step: 0.01,
      label: 'caustic strength',
    },
    film: { type: 'boolean', default: false, label: 'thin film' },
    filmThickness: {
      type: 'number',
      default: 420,
      min: 80,
      max: 1500,
      step: 5,
      label: 'film thickness (nm)',
    },
    filmDrain: {
      type: 'number',
      default: 0.6,
      min: 0,
      max: 0.9,
      step: 0.01,
      label: 'film thinner at the top',
    },
    size: { type: 'number', default: 0.3, min: 0.1, max: 0.5, step: 0.01 },
    moon: { type: 'number', default: 30, min: 0, max: 100, step: 1 },
    horizon: { type: 'number', default: 1.5, min: 0, max: 6, step: 0.05 },
    lights: { type: 'number', default: 1, min: 0, max: 4, step: 0.05 },
    stars: { type: 'number', default: 1, min: 0, max: 3, step: 0.05 },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.35 },
    bloomThreshold: { ...TAIL_PARAMS.bloomThreshold, default: 1.5 },
  },
  presets: {
    'flint icosahedron': {},
    'three channels': { sampling: 'three-channel' },
    crown: { glass: 'crown' },
    diamond: { glass: 'diamond', absorption: 0.3 },
    'traced caustics': { caustics: 'traced' },
    bubble: {
      glass: 'air',
      film: true,
      filmThickness: 380,
      absorption: 0,
      glow: 0,
      caustics: 'off',
      bounces: 3,
      horizon: 2.5,
      exposure: 2.2,
    },
    'filmed glass': { film: true, filmThickness: 300, glass: 'crown' },
    dodecahedron: { solid: 'dodecahedron' },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'glass solid' });
    const body = createGlassBody(device, { format: tail.scene.format, label: 'glass solid' });
    let width = 1;
    let height = 1;
    let clock = 0;

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
        body.resize(w, h);
      },
      frame(time, encoder, target) {
        if (!time.still) clock += time.delta;
        const still = time.still === true;
        const angle = still ? REST_ANGLE : REST_ANGLE + clock * params.turnSpeed;
        const strength = params.absorption;
        const absorb = params.transmission.map((c) => -Math.log(Math.max(c, 1e-3)) * strength) as [
          number,
          number,
          number,
        ];
        const samples = Math.round(params.samples);
        body.encode(
          encoder,
          tail.scene.view,
          {
            solid: params.solid as PlatonicSolid,
            rotation: turn(angle, params.tilt, BODY),
            view: { center: [width / 2, height / 2], size: params.size * height, distance: 4 },
            frame: time.frame,
            glass: params.glass as GlassName,
            sampling: params.sampling as SamplingMode,
            // A held frame stays up: give it the samples of many frames at once.
            samples: still ? samples * 8 : samples,
            bounces: params.bounces,
            absorb,
            emission: params.glowColour.map((c) => c * params.glow) as [number, number, number],
            film: params.film ? params.filmThickness : 0,
            filmDrain: params.filmDrain,
            caustics: params.caustics as CausticMode,
            causticGain: params.causticStrength,
            causticRays: still ? 524288 : 65536,
            standInGain: params.causticStrength * 4,
            key: { ...DEFAULT_KEY, moon: params.moon },
            horizon: params.horizon,
            lights: params.lights,
            stars: params.stars,
            reset: still,
            // Average longer while it turns slowly: less noise, and the lag stays under a pixel.
            history: Math.min(0.5, 0.1 + 0.5 * params.turnSpeed),
            scale: params.resolution,
          },
          profiler,
        );
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => body.stats(),
      destroy() {
        body.destroy();
        tail.destroy();
      },
    };
  },
});
