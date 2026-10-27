import { APERTURE_PARAMS } from '../../gpu/optics/aperture.ts';
import { lensCamera } from '../../gpu/optics/camera.ts';
import { createPointLayer, PointList } from '../../gpu/points.ts';
import { trackPointer } from '../../gpu/pointer.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { createRandom, noise1 } from '../../gpu/random.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';

const NEAR = 0.5;
const FAR = 14;
/** A firefly's glow: a slow swell and fade, its width in seconds (the Gaussian's sigma). */
const PULSE = 0.35;

interface Firefly {
  /** Where it hovers, metres (x across the view at its depth, y down from eye level, z ahead). */
  u: number;
  y: number;
  z: number;
  seed: number;
  /** Seconds between glows, and where in that cycle it starts. */
  period: number;
  offset: number;
}

function buildFireflies(count: number): Firefly[] {
  const random = createRandom(151);
  return Array.from({ length: count }, (_, i) => ({
    u: random() * 2 - 1,
    // Mostly low over the grass, a few higher.
    y: 0.2 - 1.4 * random() ** 2,
    z: NEAR * Math.pow(FAR / NEAR, random()),
    seed: i,
    period: 2.5 + 4 * random(),
    offset: random(),
  }));
}

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    fireflies: { type: 'number', default: 180, min: 10, max: 800, step: 10 },
    focus: { type: 'number', default: 2.5, min: 0.5, max: 14, step: 0.05, label: 'focus (m)' },
    fNumber: {
      type: 'number',
      default: 1.4,
      min: 1,
      max: 16,
      step: 0.1,
      label: 'f-number (50 mm)',
    },
    wander: { type: 'number', default: 1, min: 0, max: 3, step: 0.05 },
    pointerFocus: { type: 'boolean', default: true, label: 'pointer moves focus' },
    brightness: { type: 'number', default: 1, min: 0, max: 4, step: 0.05 },
    ...APERTURE_PARAMS,
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.9 },
  },
  presets: {
    meadow: {},
    swarm: { fireflies: 600, brightness: 0.6 },
    'focus near': { focus: 0.8 },
    'focus far': { focus: 9 },
    'deep focus': { fNumber: 11 },
  },

  async create({ device, format, hdr, canvas, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'fireflies' });
    const points = createPointLayer(device, { label: 'fireflies', format: tail.scene.format });
    const pointer = trackPointer(canvas);
    const list = new PointList();
    let fireflies: Firefly[] = [];
    let width = 1;
    let height = 1;
    let clock = 0;
    let focus = params.focus;

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        clock += time.delta;
        if (fireflies.length !== Math.round(params.fireflies)) {
          fireflies = buildFireflies(Math.round(params.fireflies));
        }
        const aim =
          params.pointerFocus && pointer.state.inside
            ? NEAR * Math.pow(FAR / NEAR, Math.min(1, Math.max(0, pointer.state.y)))
            : params.focus;
        const ease = time.still ? 1 : 1 - Math.exp(-time.delta / 0.3);
        focus = Math.exp(Math.log(focus) + (Math.log(aim) - Math.log(focus)) * ease);
        const camera = lensCamera({
          focalLength: 50,
          fNumber: params.fNumber,
          focus,
          width,
          height,
          centre: [0.5, 0.42],
        });
        const scale = 0.08 * 9 * Math.PI * (0.04 * height) ** 2 * params.brightness;

        list.clear();
        const t = clock * params.wander;
        for (const fly of fireflies) {
          // Wandering: smooth noise in each direction, a metre or so either way, slower far off.
          const z = fly.z * (1 + 0.15 * noise1(t * 0.07 + fly.seed * 1.3, 3));
          const half = 0.75 * camera.viewScale * z;
          const x = fly.u * half + 0.4 * noise1(t * 0.11 + fly.seed * 2.1, 1);
          const y = fly.y + 0.25 * noise1(t * 0.13 + fly.seed * 3.7, 2);
          // A slow swell and fade once a period, and a faint glow between.
          const phase = (((clock / fly.period + fly.offset) % 1) + 1) % 1;
          const d = (phase - 0.5) * fly.period;
          const glow = 0.03 + Math.exp((-d * d) / (2 * PULSE * PULSE));
          const [px, py] = camera.project(x, y, z);
          const radius = camera.coc(z);
          if (!camera.visible(px, py, radius)) continue;
          const l = (scale * glow) / (z * z);
          list.push(px, py, radius, 0.72 * l, l, 0.16 * l);
        }
        list.upload(points);
        points.encode(
          encoder,
          tail.scene.view,
          { width, height, aperture: params, clear: [0.0012, 0.0022, 0.003, 1] },
          profiler,
        );
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({ fireflies: fireflies.length, 'focus (m)': focus.toFixed(2) }),
      destroy() {
        pointer.destroy();
        points.destroy();
        tail.destroy();
      },
    };
  },
});
