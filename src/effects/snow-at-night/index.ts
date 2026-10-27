import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { APERTURE_PARAMS } from '../../gpu/optics/aperture.ts';
import { cocRadius, focalLengthPx, lensFromCamera } from '../../gpu/optics/lens.ts';
import { createPointLayer, POINT_FLOATS } from '../../gpu/points.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { createRandom } from '../../gpu/random.ts';
import { withChunks } from '../../gpu/shader.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';
import shader from './night.wgsl';

const Params = defineUniformStruct('Params', {
  ground: 'vec3f',
  aspect: 'f32',
  lamp_colour: 'vec3f',
  fog: 'f32',
  lamp_uv: 'vec2f',
  glow: 'f32',
  view_scale: 'f32',
});

type Rgb = [number, number, number];

const LAMPS: Record<string, Rgb> = {
  sodium: [1, 0.5, 0.15],
  led: [0.85, 0.92, 1],
  warm: [1, 0.72, 0.45],
};

/** An 85 mm lens on a full-frame sensor: the view is 24 / 85 m tall at 1 m. A long lens, so the
 * flakes that pass near it blur into large discs. */
const FOCAL_LENGTH = 85;
const VIEW_SCALE = 24 / FOCAL_LENGTH;
/** The lamp: where it sits in the frame (uv) and how far away, metres. */
const LAMP_UV: [number, number] = [0.27, 0.16];
const LAMP_DEPTH = 12;
/** Henyey–Greenstein asymmetry of a snowflake's scattering: mostly forwards. */
const FORWARD = 0.6;
/** Nearest and farthest a flake is drawn, metres. */
const NEAR = 0.5;
const FAR = 30;
/** The fastest a flake may cross the frame, view heights a second. */
const MAX_CROSSING = 0.3;

interface Flake {
  /** Across the view at its depth, 0..1, and its depth. */
  u: number;
  z: number;
  /** Where it starts in its fall, 0..1 of the view's height. */
  v: number;
  /** Fall speed, m/s, and flutter phase. */
  speed: number;
  phase: number;
  /** Relative size, so a few flakes are much bigger than the rest. */
  size: number;
}

function buildFlakes(count: number): Flake[] {
  const random = createRandom(97);
  return Array.from({ length: count }, () => ({
    u: -0.1 + 1.2 * random(),
    // Even through the view's volume, so the number of flakes grows with depth cubed; but that
    // leaves almost none near the lens, so 1.5% are spread through the first 4 m instead. Those are
    // the big discs, more of them than real snow would give.
    z:
      random() < 0.015
        ? NEAR * Math.pow(4 / NEAR, random())
        : Math.cbrt(NEAR ** 3 + (FAR ** 3 - NEAR ** 3) * random()),
    v: random(),
    speed: 0.6 + 0.6 * random(),
    phase: random() * Math.PI * 2,
    size: 0.5 + random() ** 3 * 2,
  }));
}

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    flakes: { type: 'number', default: 1400, min: 100, max: 5000, step: 100 },
    fall: { type: 'number', default: 1, min: 0, max: 3, step: 0.05, label: 'fall speed' },
    wind: { type: 'number', default: 0.4, min: -2, max: 2, step: 0.05, label: 'wind (m/s)' },
    focus: { type: 'number', default: 5, min: 0.5, max: 25, step: 0.05, label: 'focus (m)' },
    fNumber: { type: 'number', default: 1.8, min: 1, max: 16, step: 0.1, label: 'f-number' },
    lamp: { type: 'number', default: 1, min: 0, max: 3, step: 0.05, label: 'lamp' },
    fog: { type: 'number', default: 0.8, min: 0, max: 3, step: 0.05, label: 'fog (optical depth)' },
    colour: {
      type: 'select',
      default: 'sodium',
      options: Object.keys(LAMPS),
      label: 'lamp colour',
    },
    ...APERTURE_PARAMS,
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.7 },
  },
  presets: {
    'sodium lamp': {},
    'led lamp': { colour: 'led' },
    blizzard: { flakes: 4000, wind: 1.8, fall: 1.6, fog: 1.6 },
    'still air': { wind: 0, fall: 0.5, flakes: 800 },
    'near flakes sharp': { focus: 1.2, fNumber: 2.8 },
    'lamp in focus': { focus: 12 },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'snow at night' });
    const points = createPointLayer(device, { label: 'snow at night', format: tail.scene.format });
    const uniforms = createUniformBuffer(device, Params, 'snow at night');
    const pipeline = createFullscreenPipeline(device, {
      fragment: withChunks(shader, { 'params.wgsl': Params.wgsl }),
      entryPoint: 'night',
      format: tail.scene.format,
    });
    const group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniforms.buffer } }],
    });
    let flakes: Flake[] = [];
    let data = new Float32Array(0);
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
        clock += time.delta;
        const count = Math.round(params.flakes);
        if (flakes.length !== count) {
          flakes = buildFlakes(count);
          data = new Float32Array((count + 1) * POINT_FLOATS);
        }
        const aspect = width / height;
        const camera = {
          focalLength: FOCAL_LENGTH,
          fNumber: params.fNumber,
          focusDistance: params.focus,
          imageHeight: height,
        };
        const lens = lensFromCamera(camera);
        const f = focalLengthPx(camera);
        const lampColour = LAMPS[params.colour] ?? LAMPS.sodium!;
        // A flake's light: the lamp's falling on it (inverse square) and a little sky, scattered
        // towards the lens and falling off with the flake's own distance, scaled by its size.
        const scale = 0.5 * Math.PI * (0.03 * height) ** 2;
        // The fog's optical depth is given to the lamp, so its extinction per metre is fog / depth.
        const fogFade = (d: number) => Math.exp((-params.fog * d) / LAMP_DEPTH);
        const lampAt: [number, number, number] = [
          (LAMP_UV[0] - 0.5) * aspect * VIEW_SCALE * LAMP_DEPTH,
          (LAMP_UV[1] - 0.5) * VIEW_SCALE * LAMP_DEPTH,
          LAMP_DEPTH,
        ];

        let n = 0;
        const put = (x: number, y: number, radius: number, colour: Rgb, light: number) => {
          data.set(
            [x, y, radius, 0, colour[0] * light, colour[1] * light, colour[2] * light, 0],
            n * POINT_FLOATS,
          );
          n++;
        };
        for (const flake of flakes) {
          const z = flake.z;
          const viewHeight = VIEW_SCALE * z;
          const viewWidth = viewHeight * aspect;
          // Fall and drift in metres, wrapped round a slab a little larger than the view at this
          // depth, so the snow never runs out and never visibly pops in.
          // A flake near the lens would cross the frame several times a second, and a big disc
          // sweeping by that fast flickers the area it passes (the flash analyser caught it). So
          // no flake crosses faster than MAX_CROSSING view heights a second: only the near ones
          // slow down, which reads as small flakes drifting by the lens.
          const pace = Math.abs(flake.speed * params.fall) + Math.abs(params.wind) + 0.2;
          const t = clock * Math.min(1, (MAX_CROSSING * viewHeight) / pace);
          const span = viewHeight * 1.3;
          const fallen = flake.v * span + t * flake.speed * params.fall;
          const y = (((fallen % span) + span) % span) - span / 2;
          const flutter =
            0.08 * Math.sin(t * 1.3 + flake.phase) + 0.04 * Math.sin(t * 2.9 + 2 * flake.phase);
          const spanX = viewWidth * 1.3;
          const drifted = flake.u * spanX + t * params.wind + flutter;
          const x = (((drifted % spanX) + spanX) % spanX) - spanX / 2;

          const dx = x - lampAt[0];
          const dy = y - lampAt[1];
          const dz = z - lampAt[2];
          const toLamp = dx * dx + dy * dy + dz * dz;
          // Scattering angle: between the lamp's light arriving and the way to the lens. A flake
          // between the lens and the lamp scatters forwards, and shines.
          const distance = Math.sqrt(toLamp);
          const toEye = Math.hypot(x, y, z);
          const cos = (dx * x + dy * y + dz * z) / (distance * toEye);
          const phase = (1 - FORWARD ** 2) / Math.pow(1 + FORWARD ** 2 - 2 * FORWARD * -cos, 1.5);
          const lit = ((params.lamp * 30 * phase) / (toLamp + 0.5)) * fogFade(distance) + 0.01;
          const light = (scale * flake.size * lit * fogFade(z)) / (z * z);
          const radius = cocRadius(lens, z);
          put(width / 2 + (x * f) / z, height / 2 + (y * f) / z, radius, lampColour, light);
        }
        // The lamp itself: what reaches the lens through the fog.
        if (params.lamp > 0) {
          put(
            LAMP_UV[0] * width,
            LAMP_UV[1] * height,
            cocRadius(lens, LAMP_DEPTH),
            [0.9 + 0.1 * lampColour[0], 0.9 + 0.1 * lampColour[1], 0.9 + 0.1 * lampColour[2]],
            params.lamp * 150 * scale * fogFade(LAMP_DEPTH),
          );
        }
        points.setPoints(data, n);

        uniforms.set({
          ground: [0.0015, 0.0017, 0.0025],
          aspect,
          lamp_colour: lampColour,
          fog: params.fog,
          lamp_uv: LAMP_UV,
          glow: 0.12 * params.lamp,
          view_scale: VIEW_SCALE,
        });
        uniforms.upload();
        renderFullscreen(encoder, tail.scene.view, pipeline, [group], {
          timestampWrites: profiler.pass('night'),
        });
        points.encode(encoder, tail.scene.view, { width, height, aperture: params }, profiler);
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({ flakes: flakes.length }),
      destroy() {
        points.destroy();
        uniforms.destroy();
        tail.destroy();
      },
    };
  },
});
