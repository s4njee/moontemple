import { getNoiseTexture } from '../../gpu/emission/noise-texture.ts';
import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import type { Vec3 } from '../../gpu/optics/glass.ts';
import type { Glass } from '../../gpu/optics/spectral.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { withChunks } from '../../gpu/shader.ts';
import { createUniformBuffer, defineUniformStruct, uniformArray } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';
import shader from './prism.wgsl';
import {
  BEAM_FLOATS,
  camera,
  GLASS_ID,
  landing,
  MAX_BEAMS,
  SCENE,
  SOURCES,
  TABLE_SIZE,
  TABLE_X0,
  TABLE_X1,
  tracePrism,
  type PrismSettings,
  type Source,
} from './scene.ts';

const Params = defineUniformStruct('Params', {
  eye: 'vec3f',
  beta: 'f32',
  forward: 'vec3f',
  g: 'f32',
  right: 'vec3f',
  wall_z: 'f32',
  up: 'vec3f',
  glass_id: 'u32',
  tan_fov: 'vec2f',
  table: 'vec2f',
  /** The beams' height above the floor, half the slit's height, and the soft edge. */
  beam: 'vec3f',
  slit_distance: 'f32',
  ambient: 'vec3f',
  glass_scatter: 'f32',
  band_centre: 'vec3f',
  surface_scatter: 'f32',
  band_power: 'vec3f',
  patchy: 'f32',
  /** Albedo of the wall and of the floor. */
  albedo: 'vec2f',
  drift: 'vec2f',
  haze_cell: 'f32',
  beam_count: 'f32',
  plane_count: 'u32',
  /** A pixel's size at unit distance. */
  pixel_angle: 'f32',
  edge_glow: 'f32',
  body_glow: 'f32',
  /** A sphere round the prism: rays that miss it skip the glass. */
  bound: 'vec4f',
  planes: uniformArray('vec4f', 20),
  beams: uniformArray('vec4f', (MAX_BEAMS * BEAM_FLOATS) / 4),
});

/** A faint fill so the room is there at all: light leaking round the lamp's housing. */
const AMBIENT: [number, number, number] = [0.045, 0.048, 0.06];
/** Scatter inside the glass, per unit length: real optical glass scatters far less (striae, dust). */
const GLASS_SCATTER = 0.15;
/** The share of the light at a face that the polished surface scatters back as a dim spot. */
const SURFACE_SCATTER = 0.0015;
/** The haze's forward scattering and the size of its patches (units per noise cell). */
const HAZE_G = 0;
const HAZE_CELL = 2.5;
const FLOOR_ALBEDO = 0.3;
/**
 * The prism's own faint glow, per unit of the beam's irradiance: light scattered out of the beam
 * inside the glass, leaking from the edges (per unit) and the body (per unit length of glass seen).
 */
const EDGE_GLOW = 0.0012;
const BODY_GLOW = 0.0003;

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    glass: {
      type: 'select',
      default: 'flint',
      options: ['crown', 'flint', 'diamond'] satisfies Glass[],
    },
    apex: { type: 'number', default: 60, min: 30, max: 70, step: 1, label: 'prism angle (°)' },
    turn: {
      type: 'number',
      default: 0,
      min: -30,
      max: 30,
      step: 0.1,
      label: 'turn from minimum deviation (°)',
    },
    sweep: { type: 'number', default: 8, min: 0, max: 20, step: 0.5, label: 'sweep (± °)' },
    period: { type: 'number', default: 45, min: 15, max: 120, step: 1, label: 'sweep period (s)' },
    source: {
      type: 'select',
      default: 'white',
      options: Object.keys(SOURCES) as Source[],
      label: 'lamp',
    },
    slit: { type: 'number', default: 0.05, min: 0.01, max: 0.3, step: 0.005, label: 'slit width' },
    beam: { type: 'number', default: 1, min: 0.1, max: 4, step: 0.05, label: 'beam power' },
    haze: { type: 'number', default: 0.1, min: 0, max: 0.2, step: 0.005, label: 'haze (1/unit)' },
    patchy: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, label: 'patchy haze' },
    drift: { type: 'number', default: 0.12, min: 0, max: 1, step: 0.01, label: 'haze drift' },
    // An orbit of the view about the point it looks at (scene.ts), for a page's orbit controls.
    slitHeight: {
      type: 'number',
      default: SCENE.beamHeight,
      min: 0.1,
      max: 0.9,
      step: 0.01,
      label: 'slit height (band height)',
    },
    look: { type: 'number', default: 0, min: 0, max: 1, step: 0.01, label: 'look at the band' },
    orbitYaw: {
      type: 'number',
      default: 0,
      min: -60,
      max: 60,
      step: 0.5,
      label: 'orbit across (°)',
    },
    orbitPitch: { type: 'number', default: 0, min: -40, max: 40, step: 0.5, label: 'orbit up (°)' },
    orbitDistance: {
      type: 'number',
      default: 1,
      min: 0.35,
      max: 1.6,
      step: 0.01,
      label: 'orbit distance',
    },
    ...TAIL_PARAMS,
    exposure: { ...TAIL_PARAMS.exposure, default: 1.6 },
    bloom: { ...TAIL_PARAMS.bloom, default: 0.5 },
  },
  presets: {
    'flint prism': {},
    'crown glass': { glass: 'crown' },
    diamond: { glass: 'diamond', apex: 40 },
    'hydrogen lamp': { source: 'hydrogen', sweep: 0, exposure: 0.9 },
    'mercury lamp': { source: 'mercury', sweep: 0, exposure: 0.9 },
    'wide slit': { slit: 0.25, sweep: 0 },
    'turning wide': { sweep: 18, period: 60 },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'prism' });
    const uniforms = createUniformBuffer(device, Params, 'prism');
    const noise = getNoiseTexture(device);
    const pipeline = createFullscreenPipeline(device, {
      fragment: withChunks(shader, { 'params.wgsl': Params.wgsl }),
      entryPoint: 'scene',
      format: tail.scene.format,
    });
    const table = device.createTexture({
      label: 'prism wall profile',
      size: [TABLE_SIZE, 1],
      format: 'rgba32float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    const group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniforms.buffer } },
        { binding: 1, resource: table.createView() },
        { binding: 2, resource: noise.view },
        { binding: 3, resource: noise.sampler },
      ],
    });
    let width = 1;
    let height = 1;
    let clock = 0;
    let traced = '';
    let aimedAt = '';
    let aim: Vec3 | undefined;
    let beamCount = 0;
    let planeCount = 0;

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        // A held frame stands at minimum deviation (plus the manual turn); the sweep starts there.
        if (!time.still) clock += time.delta;
        const phase = time.still ? 0 : (2 * Math.PI * clock) / params.period;
        const settings: PrismSettings = {
          glass: params.glass as Glass,
          apex: params.apex,
          turn: params.turn + params.sweep * Math.sin(phase),
          slit: params.slit,
          source: params.source as Source,
          haze: params.haze,
          beamHeight: params.slitHeight,
        };
        const key = JSON.stringify([settings, params.beam]);
        if (key !== traced) {
          traced = key;
          const state = tracePrism(settings);
          // The beam's power scales everything the trace found. A taller slit lets through light in
          // proportion, so the band grows taller and stays as bright.
          const power = (params.beam * params.slitHeight) / SCENE.beamHeight;
          if (power !== 1) {
            for (let i = 0; i < state.table.length; i++) state.table[i]! *= power;
            for (let i = 0; i < state.beamCount; i++) {
              for (let c = 8; c < 11; c++) state.beams[i * BEAM_FLOATS + c]! *= power;
            }
            for (let c = 0; c < 3; c++) state.wallPower[c]! *= power;
          }
          device.queue.writeTexture(
            { texture: table },
            state.table,
            { bytesPerRow: TABLE_SIZE * 16 },
            [TABLE_SIZE, 1],
          );
          beamCount = state.beamCount;
          planeCount = state.planes.length;
          uniforms.set({
            glass_id: GLASS_ID[settings.glass],
            beam_count: beamCount,
            plane_count: planeCount,
            planes: state.planes.flat(),
            beams: state.beams,
            band_centre: state.wallCentroid,
            band_power: state.wallPower,
          });
        }
        // The band to look at: where the reference colour lands at the prism's set turn, without the
        // sweep, so the view holds still while the band swings across it.
        const aimKey = JSON.stringify([params.glass, params.apex, params.turn]);
        if (aimKey !== aimedAt) {
          aimedAt = aimKey;
          aim = landing({ ...settings, turn: params.turn }, SCENE.referenceNm);
        }
        const cam = camera(width, height, {
          yaw: params.orbitYaw,
          pitch: params.orbitPitch,
          distance: params.orbitDistance,
          look: params.look,
          aim,
        });
        const drifted = (clock * params.drift) / HAZE_CELL;
        uniforms.set({
          eye: cam.eye,
          forward: cam.forward,
          right: cam.right,
          up: cam.up,
          tan_fov: [cam.tanX, cam.tanY],
          beta: params.haze,
          g: HAZE_G,
          wall_z: SCENE.wallZ,
          table: [TABLE_X0, TABLE_X1],
          beam: [SCENE.centre[1], params.slitHeight / 2, 0.012],
          slit_distance: SCENE.slitDistance,
          ambient: AMBIENT,
          glass_scatter: GLASS_SCATTER,
          surface_scatter: SURFACE_SCATTER,
          patchy: params.patchy,
          albedo: [SCENE.albedo, FLOOR_ALBEDO],
          drift: [drifted, 0.4 * drifted],
          haze_cell: HAZE_CELL,
          pixel_angle: (2 * cam.tanY) / height,
          edge_glow: EDGE_GLOW,
          body_glow: BODY_GLOW,
          bound: [...SCENE.centre, Math.hypot(SCENE.side, SCENE.height / 2)],
        });
        uniforms.upload();
        renderFullscreen(encoder, tail.scene.view, pipeline, [group], {
          timestampWrites: profiler.pass('scene'),
        });
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({ beams: beamCount }),
      destroy() {
        uniforms.destroy();
        table.destroy();
        tail.destroy();
      },
    };
  },
});
