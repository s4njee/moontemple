import { APERTURE_PARAMS } from '../../gpu/optics/aperture.ts';
import { flickerIntensity } from '../../gpu/optics/flicker.ts';
import { cocRadius, focalLengthPx, lensFromCamera } from '../../gpu/optics/lens.ts';
import { createPointLayer, POINT_FLOATS } from '../../gpu/points.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { createRandom } from '../../gpu/random.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';

type Rgb = [number, number, number];

/** Bulb colours by palette; a string takes its bulbs from the list in turn. */
const PALETTES: Record<string, readonly Rgb[]> = {
  // A tungsten filament at about 2700 K.
  warm: [[1, 0.5, 0.18]],
  cool: [[0.8, 0.88, 1]],
  multicolour: [
    [1, 0.12, 0.1],
    [1, 0.55, 0.08],
    [0.15, 1, 0.25],
    [0.15, 0.35, 1],
  ],
};

/** One string: its two ends in metres (x right, y down, z ahead) and how far it sags. */
interface Strand {
  from: [number, number, number];
  to: [number, number, number];
  sag: number;
  /** Phase of its sway. */
  phase: number;
  bulbs: number;
}

/** Height of the view at 1 m, for a 35 mm lens on a full-frame sensor: 24 / 35. */
const VIEW_SCALE = 24 / 35;

function buildStrands(count: number, aspect: number): Strand[] {
  const random = createRandom(53);
  // Each string gets its own band of the frame's height, in a shuffled order, so near and far
  // strings are spread over the whole view rather than bunched.
  const bands = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [bands[i], bands[j]] = [bands[j]!, bands[i]!];
  }
  return Array.from({ length: count }, (_, i) => {
    // Spread from near to far, each string across the whole view and a little beyond it.
    const z = 1.8 * Math.pow(3.5, (i + 0.3 + 0.4 * random()) / count);
    const half = 0.62 * aspect * VIEW_SCALE * z;
    const height = VIEW_SCALE * z;
    const y = (-0.5 + (bands[i]! + 0.2 + 0.3 * random()) / count) * height * 0.9;
    const tilt = (random() - 0.5) * 0.25 * height;
    const deep = (random() - 0.5) * 0.6 * z;
    const length = 2 * half;
    return {
      from: [-half, y - tilt, z - deep],
      to: [half, y + tilt, z + deep],
      sag: (0.04 + 0.06 * random()) * length,
      phase: random() * Math.PI * 2,
      // A bulb every 18 cm or so.
      bulbs: Math.round(length / 0.18),
    };
  });
}

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    strings: { type: 'number', default: 6, min: 1, max: 12, step: 1 },
    focus: { type: 'number', default: 0.7, min: 0.3, max: 15, step: 0.05, label: 'focus (m)' },
    fNumber: { type: 'number', default: 1.4, min: 1, max: 16, step: 0.1, label: 'f-number' },
    twinkle: { type: 'number', default: 0.3, min: 0, max: 0.9, step: 0.01, label: 'twinkle depth' },
    twinkleRate: {
      type: 'number',
      default: 1.2,
      min: 0,
      max: 4,
      step: 0.05,
      label: 'twinkles a second',
    },
    sway: { type: 'number', default: 1, min: 0, max: 3, step: 0.05 },
    brightness: { type: 'number', default: 1, min: 0, max: 4, step: 0.05 },
    palette: { type: 'select', default: 'warm', options: Object.keys(PALETTES) },
    ...APERTURE_PARAMS,
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.7 },
  },
  presets: {
    'warm white': {},
    multicolour: { palette: 'multicolour', brightness: 1.4 },
    'cool white': { palette: 'cool' },
    'one string sharp': { focus: 2.9, fNumber: 2 },
    'hexagonal lens': { blades: 6, curvature: 0.05, rim: 0.05 },
    still: { twinkle: 0, sway: 0 },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'fairy lights' });
    const points = createPointLayer(device, { label: 'fairy lights', format: tail.scene.format });
    let strands: Strand[] = [];
    let strandKey = '';
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
        const aspect = width / height;
        const key = `${Math.round(params.strings)}|${aspect.toFixed(3)}`;
        if (key !== strandKey) {
          strandKey = key;
          strands = buildStrands(Math.round(params.strings), aspect);
          const total = strands.reduce((sum, s) => sum + s.bulbs + 1, 0);
          data = new Float32Array(total * POINT_FLOATS);
        }
        const camera = {
          focalLength: 35,
          fNumber: params.fNumber,
          focusDistance: params.focus,
          imageHeight: height,
        };
        const lens = lensFromCamera(camera);
        const f = focalLengthPx(camera);
        const colours = PALETTES[params.palette] ?? PALETTES.warm!;
        // A bulb's light at the lens falls off with distance squared; this sets one at 3 m to
        // about the light of a bokeh-drift orb.
        const scale = 0.12 * 9 * Math.PI * (0.045 * height) ** 2 * params.brightness;
        const twinkle = {
          rate: params.twinkleRate,
          depth: params.twinkle,
          shimmer: 0.02,
          shimmerRate: 8,
        };

        let n = 0;
        let seed = 0;
        for (const strand of strands) {
          const swing = params.sway * 0.04 * Math.sin(clock * 0.7 + strand.phase);
          for (let b = 0; b <= strand.bulbs; b++, seed++) {
            const t = b / strand.bulbs;
            const x = strand.from[0] + (strand.to[0] - strand.from[0]) * t;
            const z = strand.from[2] + (strand.to[2] - strand.from[2]) * t;
            // A parabola is close enough to a catenary at this sag; it swings forward and back.
            const bow = 4 * t * (1 - t);
            const y =
              strand.from[1] + (strand.to[1] - strand.from[1]) * t + strand.sag * bow * (1 + swing);
            const zz = z + strand.sag * bow * swing * 2;
            const radius = cocRadius(lens, zz);
            const px = width / 2 + (x * f) / zz;
            const py = height / 2 + (y * f) / zz;
            if (px < -Math.abs(radius) - 2 || px > width + Math.abs(radius) + 2) continue;
            const colour = colours[b % colours.length]!;
            const level = (scale / (zz * zz)) * flickerIntensity(clock, seed, twinkle);
            data.set(
              [px, py, radius, 0, colour[0] * level, colour[1] * level, colour[2] * level, 0],
              n * POINT_FLOATS,
            );
            n++;
          }
        }
        points.setPoints(data, n);
        points.encode(
          encoder,
          tail.scene.view,
          { width, height, aperture: params, clear: [0.003, 0.0022, 0.002, 1] },
          profiler,
        );
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({ bulbs: strands.reduce((sum, s) => sum + s.bulbs + 1, 0) }),
      destroy() {
        points.destroy();
        tail.destroy();
      },
    };
  },
});
