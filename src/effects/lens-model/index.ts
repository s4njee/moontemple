import { APERTURE_PARAMS } from '../../gpu/optics/aperture.ts';
import { cocRadius, focalLengthPx, lensFromCamera } from '../../gpu/optics/lens.ts';
import { createPointLayer, POINT_FLOATS } from '../../gpu/points.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { createRandom } from '../../gpu/random.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';

/** A light in the scene: metres from the camera (x right, y down, z ahead), and its colour. */
interface Lamp {
  at: [number, number, number];
  colour: [number, number, number];
  /** Luminous intensity, arbitrary units; what reaches the lens falls off with distance squared. */
  intensity: number;
}

const SODIUM: [number, number, number] = [1, 0.55, 0.2];
const LED: [number, number, number] = [0.75, 0.85, 1];

/** Two rows of street lamps, a railing of small lights, and a distant city. */
function buildStreet(): Lamp[] {
  const lamps: Lamp[] = [];
  for (let i = 0; i < 26; i++) {
    const z = 3 * Math.pow(1.17, i);
    for (const x of [-2.2, 2.2]) lamps.push({ at: [x, -1.6, z], colour: SODIUM, intensity: 1 });
  }
  for (let i = 0; i < 40; i++) {
    const z = 0.6 * Math.pow(1.11, i);
    lamps.push({ at: [-0.45, 0.35, z], colour: LED, intensity: 0.02 });
  }
  const random = createRandom(23);
  for (let i = 0; i < 140; i++) {
    const z = 150 + 450 * random();
    lamps.push({
      at: [(random() - 0.5) * 2 * z * 0.9, -random() * 0.08 * z + 0.004 * z, z],
      colour: random() < 0.6 ? SODIUM : LED,
      intensity: 4 + 16 * random(),
    });
  }
  return lamps;
}

/** What reaches the lens from a lamp of intensity 1 at 100 m: four units of light. */
const LIGHT_SCALE = 40000;

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    focalLength: {
      type: 'number',
      default: 50,
      min: 18,
      max: 135,
      step: 1,
      label: 'focal length (mm)',
    },
    fNumber: { type: 'number', default: 1.4, min: 1.2, max: 16, step: 0.1, label: 'f-number' },
    focus: { type: 'number', default: 1.5, min: 0.5, max: 80, step: 0.1, label: 'focus (m)' },
    sweep: { type: 'boolean', default: true, label: 'walk the focus' },
    conserve: { type: 'boolean', default: true, label: 'conserve light' },
    ...APERTURE_PARAMS,
    ...TAIL_PARAMS,
  },
  presets: {
    'f/1.4': {},
    'stopped down': { fNumber: 8 },
    'hexagon f/4': { fNumber: 4, blades: 6, curvature: 0, rim: 0 },
    'soap bubble': { rim: 0.9, focalLength: 85 },
    'swirly 85': { focalLength: 85, fNumber: 1.4, vignette: 0.9 },
    'old zoom': { blades: 7, curvature: 0.1, rings: 0.18, ringCount: 5, fNumber: 2.8 },
    'light not conserved': { conserve: false, sweep: false },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'lens model' });
    const points = createPointLayer(device, { label: 'lens model', format: tail.scene.format });
    const lamps = buildStreet();
    const data = new Float32Array(lamps.length * POINT_FLOATS);
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
        // The focus walks from near to far and back, slowly: a held frame keeps the set focus.
        const walk =
          params.sweep && !time.still ? 0.5 - 0.5 * Math.cos((clock / 12) * 2 * Math.PI) : 0;
        const focus = params.sweep && !time.still ? 0.8 * Math.pow(40 / 0.8, walk) : params.focus;
        const camera = {
          focalLength: params.focalLength,
          fNumber: params.fNumber,
          focusDistance: focus,
          imageHeight: height,
        };
        const lens = lensFromCamera(camera);
        const f = focalLengthPx(camera);
        let count = 0;
        for (const lamp of lamps) {
          const [x, y, z] = lamp.at;
          const px = width / 2 + (x * f) / z;
          const py = height * 0.55 + (y * f) / z;
          const radius = cocRadius(lens, z);
          if (px < -Math.abs(radius) - 2 || px > width + Math.abs(radius) + 2) continue;
          let light = (lamp.intensity * LIGHT_SCALE) / (z * z);
          // Without conservation a point keeps its in-focus brightness however far it spreads.
          if (!params.conserve) light *= Math.max(1, Math.PI * radius * radius);
          data.set(
            [
              px,
              py,
              radius,
              0,
              lamp.colour[0] * light,
              lamp.colour[1] * light,
              lamp.colour[2] * light,
              0,
            ],
            count * POINT_FLOATS,
          );
          count++;
        }
        points.setPoints(data, count);
        points.encode(
          encoder,
          tail.scene.view,
          { width, height, aperture: params, clear: [0.002, 0.002, 0.005, 1] },
          profiler,
        );
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({ lamps: lamps.length }),
      destroy() {
        points.destroy();
        tail.destroy();
      },
    };
  },
});
