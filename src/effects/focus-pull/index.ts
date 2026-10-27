import { APERTURE_PARAMS } from '../../gpu/optics/aperture.ts';
import { flickerIntensity } from '../../gpu/optics/flicker.ts';
import { cocRadius, focalLengthPx } from '../../gpu/optics/lens.ts';
import { createPointLayer, POINT_FLOATS } from '../../gpu/points.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { createRandom } from '../../gpu/random.ts';
import { defineEffect } from '../types.ts';
import { FOCAL_LENGTH, focusAt, pullLens, sectionDepth } from './lens.ts';
import { meta } from './meta.ts';

const VIEW_SCALE = 24 / FOCAL_LENGTH;
const NEAR = 1.2;
const FAR = 60;
/** Sections the gallery's demo racks through, and how long it holds each, seconds. */
const DEMO_SECTIONS = 6;
const DEMO_HOLD = 2.5;

interface Light {
  /** Metres: x right, y down, z ahead. */
  x: number;
  y: number;
  z: number;
  phase: number;
  warmth: number;
  level: number;
}

function buildLights(count: number): Light[] {
  const random = createRandom(29);
  return Array.from({ length: count }, () => {
    // Even in log depth, so every section's depth has lights near it to come sharp with it.
    const z = NEAR * Math.pow(FAR / NEAR, random());
    const halfHeight = 0.5 * VIEW_SCALE * z;
    return {
      x: (random() * 2 - 1) * halfHeight * 2.2,
      y: (random() * 2 - 1) * halfHeight * 1.1,
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
    drive: { type: 'select', default: 'demo', options: ['demo', 'page'] },
    focus: { type: 'number', default: 3.4, min: 0.5, max: 60, step: 0.1, label: 'focus (m)' },
    fNumber: { type: 'number', default: 2.8, min: 1, max: 16, step: 0.1, label: 'f-number' },
    rack: { type: 'number', default: 0.35, min: 0.02, max: 2, step: 0.01, label: 'focus time (s)' },
    lights: { type: 'number', default: 320, min: 20, max: 1200, step: 10 },
    brightness: { type: 'number', default: 1, min: 0, max: 4, step: 0.05 },
    ...APERTURE_PARAMS,
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.6 },
  },
  presets: {
    'racking through sections': {},
    'f/1.4': { fNumber: 1.4 },
    'f/8': { fNumber: 8 },
    'nine blades': { blades: 9, curvature: 0.3 },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'focus pull' });
    const points = createPointLayer(device, { label: 'focus pull', format: tail.scene.format });
    let lights: Light[] = [];
    let data = new Float32Array(0);
    let width = 1;
    let height = 1;
    let clock = 0;
    let focus = sectionDepth(1);

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        clock += time.delta;
        const count = Math.round(params.lights);
        if (lights.length !== count) {
          lights = buildLights(count);
          data = new Float32Array(count * POINT_FLOATS);
        }
        // The page drives the focus from its scroll and sets it every frame, already smooth. The
        // gallery's demo racks from section to section, held a while on each, eased like a motor.
        if (params.drive === 'page') {
          focus = params.focus;
        } else {
          const step = time.still ? 1 : Math.floor(clock / DEMO_HOLD) % DEMO_SECTIONS;
          const aim = focusAt(step);
          const ease = time.still ? 1 : 1 - Math.exp(-time.delta / params.rack);
          focus = Math.exp(Math.log(focus) + (Math.log(aim) - Math.log(focus)) * ease);
        }

        const lens = pullLens(focus, params.fNumber, height);
        const f = focalLengthPx({ focalLength: FOCAL_LENGTH, imageHeight: height });
        // About a focus-cursor lantern's light at 4 m, falling off with distance squared.
        const scale = 0.04 * 16 * Math.PI * (0.045 * height) ** 2 * params.brightness;
        const candle = { rate: 2, depth: 0.12, shimmer: 0.02, shimmerRate: 11 };
        let n = 0;
        lights.forEach((l, i) => {
          const x = width / 2 + (l.x * f) / l.z;
          const y = height / 2 + ((l.y + 0.03 * Math.sin(clock * 0.4 + l.phase)) * f) / l.z;
          const radius = cocRadius(lens, l.z);
          const reach = Math.abs(radius) + 2;
          if (x < -reach || x > width + reach || y < -reach || y > height + reach) return;
          const light = ((scale * l.level) / (l.z * l.z)) * flickerIntensity(clock, i, candle);
          // Cool far lights, warm near ones: a city behind, lamps in front.
          const warm = l.warmth * (1 - Math.min(1, Math.log(l.z / NEAR) / Math.log(FAR / NEAR)));
          const r = 0.55 + 0.45 * warm;
          const g = 0.5 + 0.2 * warm;
          const b = 0.95 - 0.75 * warm;
          data.set([x, y, radius, 0, r * light, g * light, b * light, 0], n * POINT_FLOATS);
          n++;
        });
        points.setPoints(data, n);
        points.encode(
          encoder,
          tail.scene.view,
          { width, height, aperture: params, clear: [0.0014, 0.0013, 0.0024, 1] },
          profiler,
        );
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({ 'focus (m)': focus.toFixed(2) }),
      destroy() {
        points.destroy();
        tail.destroy();
      },
    };
  },
});
