import type { PassProfiler } from '../../gpu/profiler.ts';
import { createHdrTail, TAIL_PARAMS, type TailValues } from '../../gpu/post/index.ts';
import {
  projectSolid,
  rotationBetween,
  SOLID_NAMES,
  solidNamed,
  turntable,
  type Mat3,
  type Solid,
} from '../../gpu/wire/solids.ts';
import {
  createFlareLayer,
  FLARE_SAFE_MAX_TURN,
  vertexFlares,
} from '../../gpu/wire/vertex-flares.ts';
import { createWireLayer } from '../../gpu/wire/wireframe.ts';
import { defineEffect, type FrameTime } from '../types.ts';
import { meta } from './meta.ts';

/*
 * A wireframe solid as a loader or an icon (story 10.6): the HDR wire of 10.1 and the corner
 * flares of 10.3 on a dark plate, with a halo from bloom. No glass body, so it stays Tier A.
 *
 * Each frame: turn the solid on its turntable, project it (src/gpu/wire/solids.ts), draw its
 * edges as the scene's first pass (wireframe.ts), add a starburst on each corner facing the light
 * (vertex-flares.ts), then bloom and tonemap. The halo stage is the one place story 10.2's
 * spectral bloom will plug in.
 */

/** Spin angle at the start, and the pose a paused host holds: a corner up and two faces lit. */
const START_ANGLE = 0.42;
/** The spin axis leans towards the camera and a little sideways, so the top shows. */
const TILT = 0.38;
const ROLL = -0.14;
/** A held frame keeps the flares at this share: there, not at full brightness. */
const STILL_FLARES = 0.55;
/** Background: a near-black blue, like the other loaders. */
const PLATE = [0.0012, 0.0013, 0.0026, 1] as const;

/**
 * The halo: today the HDR tail's own bloom. Story 10.2's spectral bloom (white, yellow, orange,
 * red outwards) replaces this function, with the same shape: draw into `scene`, then `encode`
 * blooms, tonemaps and writes the canvas. Nothing else in the loader needs to change.
 */
function createHalo(device: GPUDevice, format: GPUTextureFormat, hdr: boolean | undefined) {
  const tail = createHdrTail(device, { format, hdr, label: 'wire loader' });
  return {
    get scene() {
      return tail.scene;
    },
    resize: (width: number, height: number) => tail.resize(width, height),
    encode: (
      encoder: GPUCommandEncoder,
      target: GPUTextureView,
      time: FrameTime,
      values: TailValues,
      profiler?: PassProfiler,
    ) => tail.encode(encoder, target, time, values, profiler),
    destroy: () => tail.destroy(),
  };
}

/** The solid stood on a corner, so it spins like a top; the body pose is cached per solid. */
const bodies = new Map<Solid, Mat3>();
function bodyFor(solid: Solid): Mat3 {
  let body = bodies.get(solid);
  if (!body) {
    body = rotationBetween(solid.vertices[0]!, [0, 1, 0]);
    bodies.set(solid, body);
  }
  return body;
}

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    solid: { type: 'select', default: 'icosahedron', options: [...SOLID_NAMES] },
    size: {
      type: 'number',
      default: 0.26,
      min: 0.08,
      max: 0.45,
      step: 0.01,
      label: 'size (share of the short side)',
    },
    turn: {
      type: 'number',
      default: 0.08,
      min: 0,
      max: 0.5,
      step: 0.01,
      label: 'turns per second',
    },
    perspective: {
      type: 'number',
      default: 3.6,
      min: 2,
      max: 12,
      step: 0.1,
      label: 'camera distance (radii)',
    },
    edgeWidth: {
      type: 'number',
      default: 1.6,
      min: 0.5,
      max: 6,
      step: 0.1,
      label: 'edge width (CSS px)',
    },
    colour: { type: 'color', default: [1, 1, 1], label: 'wire colour' },
    brightness: { type: 'number', default: 2.5, min: 0.5, max: 10, step: 0.1 },
    hiddenFade: {
      type: 'number',
      default: 0.15,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'hidden-edge fade',
    },
    depthCue: { type: 'number', default: 0.3, min: 0, max: 0.9, step: 0.01, label: 'depth cue' },
    flares: { type: 'number', default: 1, min: 0, max: 4, step: 0.05, label: 'flare strength' },
    flareLength: {
      type: 'number',
      default: 0.1,
      min: 0.02,
      max: 0.3,
      step: 0.01,
      label: 'flare length (radii)',
    },
    twinkle: { type: 'number', default: 0.2, min: 0, max: 0.5, step: 0.01 },
    glow: { type: 'number', default: 0.12, min: 0, max: 1, step: 0.01 },
    glowColour: { type: 'color', default: [0.55, 0.78, 1], label: 'glow colour' },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.7 },
    bloomRadius: { ...TAIL_PARAMS.bloomRadius, default: 0.75 },
  },
  presets: {
    icosahedron: {},
    'cyan halo': { colour: [0.85, 0.95, 1], glow: 0.3, glowColour: [0.2, 0.75, 1], bloom: 1 },
    'gold dodecahedron': {
      solid: 'dodecahedron',
      colour: [1, 0.8, 0.5],
      glowColour: [1, 0.55, 0.2],
      flares: 0.8,
    },
    'cube icon': { solid: 'cube', size: 0.34, turn: 0.05, edgeWidth: 2.2, perspective: 3 },
    'octahedron spinner': { solid: 'octahedron', turn: 0.35, size: 0.2, hiddenFade: 0.1 },
    'front edges only': { hiddenFade: 0, depthCue: 0.15 },
  },

  async create({ device, format, hdr, params, profiler }) {
    const halo = createHalo(device, format, hdr);
    const wire = createWireLayer(device, { label: 'wire loader', format: halo.scene.format });
    const flares = createFlareLayer(device, { label: 'wire loader', format: halo.scene.format });
    let width = 1;
    let height = 1;
    let dpr = 1;
    let clock = 0;
    let frontEdges = 0;
    let lit = 0;

    return {
      resize(w, h, ratio) {
        width = w;
        height = h;
        dpr = ratio;
        halo.resize(w, h);
        wire.resize(w, h);
      },
      frame(time, encoder, target) {
        if (!time.still) clock += time.delta;
        const solid = solidNamed(params.solid);
        // The turn is capped where the flares' rise and fall stay inside the flicker caps.
        const turn = Math.min(Math.max(params.turn, 0), FLARE_SAFE_MAX_TURN);
        const angle = time.still ? START_ANGLE : START_ANGLE + 2 * Math.PI * turn * clock;
        const rotation = turntable(angle, { tilt: TILT, roll: ROLL, body: bodyFor(solid) });
        const radius = params.size * Math.min(width, height);
        const seen = projectSolid(solid, rotation, {
          center: [width / 2, height / 2],
          size: radius,
          distance: params.perspective,
        });
        frontEdges = seen.edges.filter((edge) => edge.facing > 0).length;

        wire.setSolid(seen, { hiddenFade: params.hiddenFade, depthCue: params.depthCue });
        const c = params.colour;
        const g = params.glowColour;
        const b = params.brightness;
        wire.encode(
          encoder,
          halo.scene.view,
          {
            width: params.edgeWidth * dpr,
            glowRadius: params.glow > 0 ? 3 * params.edgeWidth * dpr : 0,
            core: [c[0] * b, c[1] * b, c[2] * b],
            glow: [g[0] * b * params.glow, g[1] * b * params.glow, g[2] * b * params.glow],
            clear: PLATE,
          },
          profiler,
        );

        const list = vertexFlares(
          seen,
          {
            strength: params.flares * (time.still ? STILL_FLARES : 1),
            twinkle: {
              rate: 1.5,
              depth: time.still ? 0 : params.twinkle,
              shimmer: time.still ? 0 : 0.02,
              shimmerRate: 8,
            },
            seed: 1009,
          },
          clock,
        );
        lit = list.length;
        // A flare's light scales with the solid's area on screen, so it reads the same at any size.
        const light = 0.014 * radius * radius * (b / 2.5);
        flares.encode(
          encoder,
          halo.scene.view,
          list,
          {
            width,
            height,
            light: [c[0] * light, c[1] * light, c[2] * light],
            spikes: 4,
            rotation: Math.PI / 4,
            length: params.flareLength * radius,
            thickness: 0.6 * dpr,
          },
          profiler,
        );
        halo.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({ 'front edges': frontEdges, flares: lit }),
      destroy() {
        flares.destroy();
        wire.destroy();
        halo.destroy();
      },
    };
  },
});
