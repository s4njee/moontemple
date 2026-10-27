import { APERTURE_PARAMS } from '../../gpu/optics/aperture.ts';
import { flickerIntensity } from '../../gpu/optics/flicker.ts';
import { cocRadius, focalLengthPx, lensFromCamera } from '../../gpu/optics/lens.ts';
import { createPointLayer, POINT_FLOATS } from '../../gpu/points.ts';
import { trackPointer } from '../../gpu/pointer.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { createRandom, hash1 } from '../../gpu/random.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';

/** An 85 mm lens on a full-frame sensor: the view is 24 / 85 m tall at 1 m. A portrait lens, so
 * the depth of field is shallow enough for a rack to read. */
const FOCAL_LENGTH = 85;
const VIEW_SCALE = 24 / FOCAL_LENGTH;
const NEAR = 2;
const FAR = 60;
/** How long the demo holds each lantern in focus before moving on, seconds. */
const DEMO_HOLD = 3.5;

interface Lantern {
  /** Metres: x right, y down from eye level, z ahead. */
  x: number;
  y: number;
  z: number;
  /** Bob phase and warmth (0 deep orange, 1 pale gold). */
  phase: number;
  warmth: number;
  level: number;
}

export function buildLanterns(count: number): Lantern[] {
  const random = createRandom(71);
  return Array.from({ length: count }, () => {
    // Even in log depth, so near, middle and far each have their share to focus on.
    const z = NEAR * Math.pow(FAR / NEAR, random());
    const halfWidth = 0.75 * VIEW_SCALE * z;
    return {
      x: (random() * 2 - 1) * halfWidth * 1.2,
      // Floating anywhere in the view at their depth, a little more of them above the middle.
      y: (random() - 0.6) * 0.95 * VIEW_SCALE * z,
      z,
      phase: random() * Math.PI * 2,
      warmth: random(),
      level: 0.6 + 0.8 * random(),
    };
  });
}

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    lanterns: { type: 'number', default: 260, min: 20, max: 1200, step: 10 },
    fNumber: { type: 'number', default: 1.4, min: 1, max: 16, step: 0.1, label: 'f-number' },
    rack: { type: 'number', default: 0.25, min: 0.02, max: 2, step: 0.01, label: 'focus time (s)' },
    flicker: { type: 'number', default: 0.2, min: 0, max: 0.6, step: 0.01, label: 'flame flicker' },
    brightness: { type: 'number', default: 1, min: 0, max: 4, step: 0.05 },
    ...APERTURE_PARAMS,
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.7 },
  },
  presets: {
    'f/1.4': {},
    'f/4': { fNumber: 4 },
    'slow focus motor': { rack: 1.2 },
    'nine blades': { blades: 9, curvature: 0.3 },
    'lantern festival': { lanterns: 900, brightness: 0.7 },
  },

  async create({ device, format, hdr, canvas, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'focus cursor' });
    const points = createPointLayer(device, { label: 'focus cursor', format: tail.scene.format });
    const pointer = trackPointer(canvas);
    let lanterns: Lantern[] = [];
    let data = new Float32Array(0);
    let width = 1;
    let height = 1;
    let clock = 0;
    // The focus distance the lens is at, and where it is going: eased, as a focus motor moves.
    let focus = 8;
    let aim = 8;

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        clock += time.delta;
        const count = Math.round(params.lanterns);
        if (lanterns.length !== count) {
          lanterns = buildLanterns(count);
          data = new Float32Array(count * POINT_FLOATS);
        }
        const camera = {
          focalLength: FOCAL_LENGTH,
          fNumber: params.fNumber,
          focusDistance: focus,
          imageHeight: height,
        };
        const f = focalLengthPx(camera);
        const screen = lanterns.map((l) => {
          const y = l.y + 0.05 * Math.sin(clock * 0.6 + l.phase);
          return { x: width / 2 + (l.x * f) / l.z, y: height / 2 + (y * f) / l.z };
        });

        // What to focus on: the lantern under the pointer, judged by how far the pointer is from
        // its centre against the size of its disc; or, with no pointer, a new one every few seconds.
        if (pointer.state.inside) {
          const px = pointer.state.x * width;
          const py = pointer.state.y * height;
          const lens = lensFromCamera(camera);
          let best = Infinity;
          lanterns.forEach((l, i) => {
            const reach = Math.max(Math.abs(cocRadius(lens, l.z)), 6) + 10;
            const d = Math.hypot(screen[i]!.x - px, screen[i]!.y - py) / reach;
            if (d < 1 && d < best) {
              best = d;
              aim = l.z;
            }
          });
        } else {
          const visible = lanterns.filter((_, i) => {
            const s = screen[i]!;
            return (
              s.x > width * 0.1 && s.x < width * 0.9 && s.y > height * 0.1 && s.y < height * 0.9
            );
          });
          const pick =
            visible[Math.floor(hash1(Math.floor(clock / DEMO_HOLD) + 17) * visible.length)];
          if (pick) aim = pick.z;
        }
        // Eased in log distance, so a rack from 1 m to 40 m and from 4 m to 8 m take alike.
        const ease = time.still ? 1 : 1 - Math.exp(-time.delta / params.rack);
        focus = Math.exp(Math.log(focus) + (Math.log(aim) - Math.log(focus)) * ease);

        const lens = lensFromCamera({ ...camera, focusDistance: focus });
        // A lantern's light at the lens falls off with distance squared; one at 4 m carries about a
        // bokeh-drift orb's light.
        const scale = 0.05 * 16 * Math.PI * (0.045 * height) ** 2 * params.brightness;
        const candle = { rate: 3, depth: params.flicker, shimmer: 0.03, shimmerRate: 13 };
        let n = 0;
        lanterns.forEach((l, i) => {
          const s = screen[i]!;
          const radius = cocRadius(lens, l.z);
          if (s.x < -Math.abs(radius) - 2 || s.x > width + Math.abs(radius) + 2) return;
          const light = ((scale * l.level) / (l.z * l.z)) * flickerIntensity(clock, i, candle);
          const g = 0.42 + 0.25 * l.warmth;
          const b = 0.1 + 0.15 * l.warmth;
          data.set([s.x, s.y, radius, 0, light, g * light, b * light, 0], n * POINT_FLOATS);
          n++;
        });
        points.setPoints(data, n);
        points.encode(
          encoder,
          tail.scene.view,
          { width, height, aperture: params, clear: [0.0016, 0.0014, 0.0022, 1] },
          profiler,
        );
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({ 'focus (m)': focus.toFixed(2), lanterns: lanterns.length }),
      destroy() {
        pointer.destroy();
        points.destroy();
        tail.destroy();
      },
    };
  },
});
