import { APERTURE_PARAMS } from '../../gpu/optics/aperture.ts';
import { lensCamera } from '../../gpu/optics/camera.ts';
import { createPointLayer, PointList } from '../../gpu/points.ts';
import { trackPointer } from '../../gpu/pointer.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { createRandom } from '../../gpu/random.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';

type Rgb = readonly [number, number, number];

const SODIUM: Rgb = [1, 0.5, 0.16];
const HEADLIGHT: Rgb = [0.85, 0.9, 1];
const TAIL_LIGHT: Rgb = [1, 0.04, 0.02];
const NEON: readonly Rgb[] = [
  [1, 0.12, 0.55],
  [0.1, 0.85, 1],
  [0.3, 1, 0.3],
  [1, 0.6, 0.08],
];
const TRAFFIC: readonly Rgb[] = [
  [1, 0.05, 0.02],
  [1, 0.55, 0.02],
  [0.1, 1, 0.45],
];

/** Lane centres, metres to the right of the camera; cars come at it on the left and leave on the right. */
const ONCOMING = -1.8;
const RECEDING = 1.8;
/** Height of the eye above the road, and of headlights and lamps above it. */
const EYE = 1.3;
/** How far along the road the cars run before they come round again, metres. */
const NEAR_END = 6;
const FAR_END = 180;

interface Car {
  start: number;
  speed: number;
}
interface Fixed {
  at: readonly [number, number, number];
  colour: Rgb;
  intensity: number;
}

function buildStreet() {
  const random = createRandom(113);
  const cars = (count: number): Car[] =>
    Array.from({ length: count }, () => ({ start: random(), speed: 11 + 6 * random() }));
  const fixed: Fixed[] = [];
  // Sodium lamps on both sides, 4.5 m up, every 22 m.
  for (let k = 0; k < 12; k++) {
    for (const x of [-7, 7])
      fixed.push({ at: [x, EYE - 5.8, 10 + 22 * k], colour: SODIUM, intensity: 3 });
  }
  // Neon signs: short rows of one colour on the shopfronts either side.
  for (let s = 0; s < 14; s++) {
    const side = s % 2 === 0 ? -1 : 1;
    const x = side * (9 + 3 * random());
    const z = 14 + 70 * random();
    const y = EYE - 2 - 2.5 * random();
    const colour = NEON[Math.floor(random() * NEON.length)]!;
    const length = 6 + Math.floor(8 * random());
    for (let i = 0; i < length; i++) {
      fixed.push({ at: [x, y, z + (i - length / 2) * 0.25], colour, intensity: 0.5 });
    }
  }
  // Lit windows far down the street.
  for (let w = 0; w < 160; w++) {
    const z = 90 + 220 * random();
    fixed.push({
      at: [(random() - 0.5) * 0.9 * z * 0.4, EYE - 2 - random() * 0.12 * z, z],
      colour: random() < 0.7 ? [1, 0.7, 0.35] : [0.7, 0.85, 1],
      intensity: 6 + 10 * random(),
    });
  }
  return { oncoming: cars(9), receding: cars(9), fixed };
}

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    focus: { type: 'number', default: 1.5, min: 0.8, max: 120, step: 0.1, label: 'focus (m)' },
    fNumber: {
      type: 'number',
      default: 1.4,
      min: 1,
      max: 16,
      step: 0.1,
      label: 'f-number (85 mm)',
    },
    traffic: { type: 'number', default: 1, min: 0, max: 3, step: 0.05, label: 'traffic speed' },
    pointerFocus: { type: 'boolean', default: true, label: 'pointer pulls focus' },
    brightness: { type: 'number', default: 1, min: 0, max: 4, step: 0.05 },
    wet: { type: 'number', default: 0.3, min: 0, max: 1, step: 0.01, label: 'wet road' },
    ...APERTURE_PARAMS,
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.7 },
  },
  presets: {
    'focused close': {},
    'focused on the street': { focus: 30, fNumber: 2.8 },
    'nine blades': { blades: 9, curvature: 0.25 },
    'swirly 85': { vignette: 0.9, fNumber: 1.2 },
    'slow traffic': { traffic: 0.3 },
    'dry road': { wet: 0 },
  },

  async create({ device, format, hdr, canvas, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'night street' });
    const points = createPointLayer(device, { label: 'night street', format: tail.scene.format });
    const pointer = trackPointer(canvas);
    const street = buildStreet();
    const list = new PointList();
    let width = 1;
    let height = 1;
    let clock = 0;
    let drive = 0;
    let focus = params.focus;

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        clock += time.delta;
        drive += time.delta * params.traffic;
        // The pointer's height pulls the focus, top near and bottom far, eased like a focus ring.
        const aim =
          params.pointerFocus && pointer.state.inside
            ? 0.8 * Math.pow(120 / 0.8, Math.min(1, Math.max(0, pointer.state.y)))
            : params.focus;
        const ease = time.still ? 1 : 1 - Math.exp(-time.delta / 0.3);
        focus = Math.exp(Math.log(focus) + (Math.log(aim) - Math.log(focus)) * ease);
        const camera = lensCamera({
          focalLength: 85,
          fNumber: params.fNumber,
          focus,
          width,
          height,
          centre: [0.5, 0.45],
        });
        // What reaches the lens from a light of intensity 1 at 10 m, against the area of a disc
        // 4% of the height across: about a bokeh-drift orb.
        const scale = 0.45 * 100 * Math.PI * (0.04 * height) ** 2 * params.brightness;

        list.clear();
        const light = (x: number, y: number, z: number, colour: Rgb, intensity: number) => {
          const [px, py] = camera.project(x, y, z);
          const radius = camera.coc(z);
          if (!camera.visible(px, py, radius)) return;
          const l = (scale * intensity) / (z * z);
          list.push(px, py, radius, colour[0] * l, colour[1] * l, colour[2] * l);
          // A wet road mirrors every light below its surface, dimmer.
          if (params.wet > 0) {
            const [rx, ry] = camera.project(x, 2 * EYE - y, z);
            const w = l * params.wet;
            if (camera.visible(rx, ry, radius))
              list.push(rx, ry, radius, colour[0] * w, colour[1] * w, colour[2] * w);
          }
        };

        for (const f of street.fixed) light(f.at[0], f.at[1], f.at[2], f.colour, f.intensity);
        const span = FAR_END - NEAR_END;
        // Oncoming: headlights, bright, towards the lens. Receding: tail lights, dimmer and red.
        for (const car of street.oncoming) {
          const z = FAR_END - ((((car.start * span + drive * car.speed) % span) + span) % span);
          for (const dx of [-0.75, 0.75]) light(ONCOMING + dx, EYE - 0.65, z, HEADLIGHT, 6);
        }
        for (const car of street.receding) {
          const z = NEAR_END + ((((car.start * span + drive * car.speed) % span) + span) % span);
          for (const dx of [-0.7, 0.7]) light(RECEDING + dx, EYE - 0.8, z, TAIL_LIGHT, 1.5);
        }
        // Traffic lights at 45 m, red, amber and green in turn, each change a half-second fade.
        const phase = (clock / 4) % 3;
        TRAFFIC.forEach((colour, i) => {
          // How far into this light's turn: on for the first third of the cycle, fading at each end.
          const d = (((phase - i) % 3) + 3) % 3;
          const on =
            Math.min(1, Math.max(0, d / 0.125)) * Math.min(1, Math.max(0, (1 - d) / 0.125));
          const level = 0.15 + 0.85 * on;
          for (const x of [-4, 4]) light(x, EYE - 4.2 + i * 0.35, 45, colour, 2 * level);
        });

        list.upload(points);
        points.encode(
          encoder,
          tail.scene.view,
          { width, height, aperture: params, clear: [0.0015, 0.0014, 0.0022, 1] },
          profiler,
        );
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({ lights: list.count, 'focus (m)': focus.toFixed(1) }),
      destroy() {
        pointer.destroy();
        points.destroy();
        tail.destroy();
      },
    };
  },
});
