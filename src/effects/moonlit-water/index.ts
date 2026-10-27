import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { APERTURE_PARAMS } from '../../gpu/optics/aperture.ts';
import { lensCamera } from '../../gpu/optics/camera.ts';
import { MOON_ANGULAR_RADIUS, moonLight, moonRadiance } from '../../gpu/optics/moon.ts';
import { trackPointer } from '../../gpu/pointer.ts';
import { createPointLayer, PointList } from '../../gpu/points.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { withChunks } from '../../gpu/shader.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import { buildCells, emitGlints, type Cells, type SeaView } from './glints.ts';
import { meta } from './meta.ts';
import shader from './sea.wgsl';

const Params = defineUniformStruct('Params', {
  moon_dir: 'vec3f',
  moon_radius: 'f32',
  moon_colour: 'vec3f',
  aureole: 'f32',
  sky_top: 'vec3f',
  eye: 'f32',
  sky_horizon: 'vec3f',
  time: 'f32',
  body: 'vec3f',
  waves: 'f32',
  centre: 'vec2f',
  focal_px: 'f32',
  focus: 'f32',
  blur_inf: 'f32',
  gain: 'f32',
});

type Rgb = [number, number, number];

/** An 85 mm lens on full frame: long enough for big discs at f/1.8 and a moon worth seeing. */
const FOCAL_LENGTH = 85;
const VIEW_SCALE = 24 / FOCAL_LENGTH;
/** The horizon's row, as a share of the height from the top: the optical axis is level. */
const HORIZON = 0.4;
/** The lens's height above the sea, metres: standing on a low jetty. */
const EYE = 2.5;
const MOON_COLOUR: Rgb = [0.9, 0.93, 1];
/**
 * Radiance of the moon's disc as drawn, and the radiance whose reflection makes the path. A camera
 * exposed for the path clips the moon by a long way; drawn at the path's radiance, its bloom would
 * fill the frame, so the disc is drawn 1/20 as bright.
 */
const DISC_RADIANCE = 30;
const PATH_RADIANCE = 600;

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    focus: { type: 'number', default: 1.5, min: 0.5, max: 400, step: 0.1, label: 'focus (m)' },
    fNumber: {
      type: 'number',
      default: 1.8,
      min: 1,
      max: 16,
      step: 0.1,
      label: 'f-number (85 mm)',
    },
    pointerFocus: { type: 'boolean', default: true, label: 'pointer pulls focus' },
    moonHeight: {
      type: 'number',
      default: 3.5,
      min: 0.5,
      max: 30,
      step: 0.1,
      label: 'moon height (°)',
    },
    phase: {
      type: 'number',
      default: 0.5,
      min: 0.05,
      max: 0.95,
      step: 0.01,
      label: 'phase (½ full)',
    },
    waves: { type: 'number', default: 0.6, min: 0, max: 2, step: 0.01, label: 'swell' },
    wind: { type: 'number', default: 4, min: 0, max: 15, step: 0.1, label: 'wind (m/s)' },
    speed: { type: 'number', default: 1, min: 0, max: 2, step: 0.05, label: 'wave speed' },
    twinkle: {
      type: 'number',
      default: 3,
      min: 0,
      max: 4,
      step: 0.1,
      label: 'twinkle (per s, capped at 4)',
    },
    glints: {
      type: 'number',
      default: 6000,
      min: 500,
      max: 20000,
      step: 500,
      label: 'glint cells',
    },
    brightness: { type: 'number', default: 1, min: 0, max: 4, step: 0.05 },
    ...APERTURE_PARAMS,
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.4 },
  },
  presets: {
    'river of discs': {},
    'sharp sparkle': { focus: 400, fNumber: 5.6 },
    'calm sea': { waves: 0.25, wind: 1.5 },
    'windy night': { waves: 1.3, wind: 11 },
    'high moon': { moonHeight: 16 },
    'half moon': { phase: 0.25, focus: 400, fNumber: 2.8 },
    'nine blades': { blades: 9, curvature: 0.1, fNumber: 2.8, focus: 1 },
  },

  async create({ device, format, hdr, canvas, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'moonlit water' });
    const points = createPointLayer(device, { label: 'moonlit water', format: tail.scene.format });
    const uniforms = createUniformBuffer(device, Params, 'moonlit water');
    const pipeline = createFullscreenPipeline(device, {
      fragment: withChunks(shader, { 'params.wgsl': Params.wgsl }),
      entryPoint: 'sea_fs',
      format: tail.scene.format,
    });
    const group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniforms.buffer } }],
    });
    const pointer = trackPointer(canvas);
    const list = new PointList();
    let cells: Cells | undefined;
    let cellsKey = '';
    let width = 1;
    let height = 1;
    let clock = 0;
    let waveClock = 0;
    let focus = params.focus;
    let glinting = 0;
    let lightPhase = -1;
    let light = 1;

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        clock += time.delta;
        waveClock += time.delta * params.speed;
        const elevation = (params.moonHeight * Math.PI) / 180;
        const view: SeaView = {
          eye: EYE,
          moonElevation: elevation,
          waves: params.waves,
          wind: params.wind,
          cap: Math.round(params.glints),
          aspect: width / height,
          viewScale: VIEW_SCALE,
          horizon: HORIZON,
        };
        const key = JSON.stringify(view);
        if (key !== cellsKey) {
          cellsKey = key;
          cells = buildCells(view);
        }
        if (params.phase !== lightPhase) {
          lightPhase = params.phase;
          light = moonLight(params.phase, 64);
        }

        // The pointer's height pulls the focus, top out to sea and bottom close, eased like a
        // focus ring, in log distance.
        const aim =
          params.pointerFocus && pointer.state.inside
            ? 0.6 * Math.pow(400 / 0.6, 1 - Math.min(1, Math.max(0, pointer.state.y)))
            : params.focus;
        const ease = time.still ? 1 : 1 - Math.exp(-time.delta / 0.3);
        focus = Math.exp(Math.log(focus) + (Math.log(aim) - Math.log(focus)) * ease);
        const camera = lensCamera({
          focalLength: FOCAL_LENGTH,
          fNumber: params.fNumber,
          focus,
          width,
          height,
          centre: [0.5, HORIZON],
        });
        const blurInf = camera.lens.blurAtInfinity;

        list.clear();
        // The glints: each patch of sea that mirrors the moon, a point at its distance.
        const irradiance = PATH_RADIANCE * light * Math.PI * MOON_ANGULAR_RADIUS ** 2;
        glinting = emitGlints(
          cells!,
          {
            waveTime: waveClock,
            twinkleTime: clock,
            twinkleRate: params.twinkle,
            still: time.still === true,
            waves: params.waves,
            gain: irradiance * camera.focalPx ** 2 * params.brightness,
          },
          (x, h, z, l) => {
            const [px, py] = camera.project(x, EYE - h, z);
            const radius = camera.coc(z);
            if (!camera.visible(px, py, radius)) return;
            list.push(px, py, radius, MOON_COLOUR[0] * l, MOON_COLOUR[1] * l, MOON_COLOUR[2] * l);
          },
        );

        // The moon's disc as points at infinity, sampled from the shared moon model, so that out
        // of focus it becomes an aperture-shaped disc like the glints.
        const moonX = 0.5 * width;
        const moonY = HORIZON * height - camera.focalPx * Math.tan(elevation);
        const moonR = MOON_ANGULAR_RADIUS * camera.focalPx;
        if (camera.visible(moonX, moonY, Math.abs(blurInf) + moonR)) {
          const step = Math.max(0.5, moonR / 24);
          const n = Math.ceil(moonR / step);
          const scale = DISC_RADIANCE * step * step * params.brightness;
          for (let j = -n; j < n; j++) {
            for (let i = -n; i < n; i++) {
              const dx = (i + 0.5) * step;
              const dy = (j + 0.5) * step;
              const r = moonRadiance(dx / moonR, dy / moonR, params.phase) * scale;
              if (r <= 0) continue;
              list.push(
                moonX + dx,
                moonY + dy,
                blurInf,
                MOON_COLOUR[0] * r,
                MOON_COLOUR[1] * r,
                MOON_COLOUR[2] * r,
              );
            }
          }
        }
        list.upload(points);

        uniforms.set({
          moon_dir: [0, Math.sin(elevation), Math.cos(elevation)],
          moon_radius: MOON_ANGULAR_RADIUS,
          moon_colour: MOON_COLOUR,
          aureole: 1.2 * light,
          sky_top: [0.0006, 0.0009, 0.002],
          eye: EYE,
          sky_horizon: [0.003, 0.0038, 0.0065],
          time: waveClock,
          body: [0.0003, 0.0005, 0.0008],
          waves: params.waves,
          centre: [0.5 * width, HORIZON * height],
          focal_px: camera.focalPx,
          focus,
          blur_inf: blurInf,
          gain: params.brightness,
        });
        uniforms.upload();
        renderFullscreen(encoder, tail.scene.view, pipeline, [group], {
          timestampWrites: profiler.pass('sea'),
        });
        points.encode(encoder, tail.scene.view, { width, height, aperture: params }, profiler);
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({
        cells: cells?.count ?? 0,
        glinting,
        'focus (m)': focus.toFixed(1),
      }),
      destroy() {
        pointer.destroy();
        points.destroy();
        uniforms.destroy();
        tail.destroy();
      },
    };
  },
});
