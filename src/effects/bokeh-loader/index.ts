import { APERTURE_PARAMS } from '../../gpu/optics/aperture.ts';
import { flickerIntensity } from '../../gpu/optics/flicker.ts';
import { cocRadius, type ThinLens } from '../../gpu/optics/lens.ts';
import { createPointLayer, POINT_FLOATS } from '../../gpu/points.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { createRandom } from '../../gpu/random.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';

/*
 * A loader of lights (story 6.7). N orbs each have a slot on a ring or a bar, in the focal plane,
 * and a depth of their own off it, some nearer and some farther. An orb's "gather" (0..1) moves
 * it in log depth from its own depth to the focal plane: its circle of confusion shrinks to a
 * point through the thin-lens model, its position closes on its slot by perspective, and its
 * wander dies away. Progress gathers the orbs in order round the ring or along the bar, a few
 * orbs at a time overlapping so the front is soft. The point layer keeps each orb's light, so a
 * gathered orb is a bright sharp point and an ungathered one a dim soft disc: the progress reads
 * in brightness as well as in sharpness.
 */

/** Depths are in units of the focus distance: the focal plane is 1. */
const FOCUS = 1;
/** The disc size an orb's light is set against, as a share of the image height. */
const REFERENCE_BLUR = 0.05;
/** How many orbs the gathering front spans. */
const FRONT = 2.5;
/** The demo: seconds to rise to full, hold there, and let go back to soft. */
const DEMO_RISE = 4.5;
const DEMO_HOLD = 1;
const DEMO_FALL = 1.5;
/** Where a held demo stands under reduced motion. */
const STILL_PROGRESS = 0.7;
/** The spinner's sharp head leads by this share of the track, and its trail by this. */
const SPIN_LEAD = 0.05;
const SPIN_TAIL = 0.5;

interface Orb {
  /** Depth when ungathered, in focus distances: below 1 is nearer than focus, above is farther. */
  depth: number;
  /** Wander phases and its light relative to the others. */
  phase: number;
  phase2: number;
  level: number;
  seed: number;
}

function buildOrbs(count: number): Orb[] {
  const random = createRandom(67);
  return Array.from({ length: count }, (_, i) => {
    // Three in five behind focus, the rest in front, where the lens flips their disc.
    const far = random() < 0.6;
    const depth = far ? 1.6 * Math.pow(2.5, random()) : 0.55 + 0.25 * random();
    return {
      depth,
      phase: random() * Math.PI * 2,
      phase2: random() * Math.PI * 2,
      level: 0.75 + 0.5 * random(),
      seed: 401 + i,
    };
  });
}

const smoothstep = (x: number) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * (3 - 2 * t);
};

/** The demo's progress and how far it has let go, at `t` seconds into its loop. */
export function demoProgress(t: number): { progress: number; release: number } {
  const cycle = DEMO_RISE + DEMO_HOLD + DEMO_FALL;
  const at = ((t % cycle) + cycle) % cycle;
  if (at < DEMO_RISE) {
    // Monotone, in surges and stalls the way a real download comes in.
    const x = at / DEMO_RISE;
    const surge = 3 * 2 * Math.PI;
    return { progress: x - (0.8 * Math.sin(surge * x)) / surge, release: 0 };
  }
  if (at < DEMO_RISE + DEMO_HOLD) return { progress: 1, release: 0 };
  const fall = smoothstep((at - DEMO_RISE - DEMO_HOLD) / DEMO_FALL);
  // All of them let go together; progress drops to zero underneath, out of sight.
  return { progress: fall < 1 ? 1 : 0, release: fall };
}

/** How gathered orb `i` of `count` is at `progress`, before any release. */
export function gatherAt(progress: number, i: number, count: number): number {
  const p = Math.min(Math.max(progress, 0), 1);
  return Math.min(Math.max((p * (count - 1 + FRONT) - i) / FRONT, 0), 1);
}

/** The spinner: orbs just ahead of the head sharpen, the trail behind it softens again. */
function spinGather(head: number, u: number, wrap: boolean): number {
  let behind = head - u;
  if (wrap) behind = (((behind % 1) + 1.5) % 1) - 0.5;
  if (behind < 0) return smoothstep(1 + behind / SPIN_LEAD);
  return Math.pow(Math.max(1 - behind / SPIN_TAIL, 0), 1.3);
}

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    mode: {
      type: 'select',
      default: 'auto',
      options: ['auto', 'progress', 'spinner'],
      label: 'mode (auto demos until progress is set)',
    },
    progress: { type: 'number', default: 0, min: 0, max: 1, step: 0.001 },
    layout: { type: 'select', default: 'ring', options: ['ring', 'bar'], label: 'shape' },
    count: { type: 'number', default: 32, min: 6, max: 120, step: 1, label: 'orbs' },
    size: { type: 'number', default: 0.22, min: 0.08, max: 0.42, step: 0.01, label: 'ring size' },
    blur: {
      type: 'number',
      default: 0.075,
      min: 0.01,
      max: 0.2,
      step: 0.005,
      label: 'blur at infinity',
    },
    parallax: { type: 'number', default: 0.3, min: 0, max: 1, step: 0.01, label: 'depth parallax' },
    wander: { type: 'number', default: 1, min: 0, max: 3, step: 0.05 },
    ease: { type: 'number', default: 0.2, min: 0.02, max: 1, step: 0.01, label: 'follow time (s)' },
    spin: { type: 'number', default: 0.5, min: 0.1, max: 2, step: 0.05, label: 'spinner turns/s' },
    twinkle: { type: 'number', default: 0.15, min: 0, max: 0.5, step: 0.01 },
    colour: { type: 'color', default: [0.42, 0.62, 1], label: 'first colour' },
    endColour: { type: 'color', default: [0.72, 0.5, 1], label: 'last colour' },
    brightness: { type: 'number', default: 1, min: 0, max: 4, step: 0.05 },
    ...APERTURE_PARAMS,
    rim: { ...APERTURE_PARAMS.rim, default: 0.25 },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.8 },
  },
  presets: {
    'moon ring': {},
    'progress bar': { layout: 'bar', count: 40 },
    spinner: { mode: 'spinner' },
    'bar spinner': { mode: 'spinner', layout: 'bar', count: 40, spin: 0.35 },
    'at 30%': { mode: 'progress', progress: 0.3 },
    'gold hexagons': {
      colour: [1, 0.62, 0.2],
      endColour: [1, 0.36, 0.1],
      blades: 6,
      curvature: 0.1,
      rotation: 10,
    },
    'few and large': { count: 12, blur: 0.12, size: 0.26 },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'bokeh loader' });
    const points = createPointLayer(device, { label: 'bokeh loader', format: tail.scene.format });
    let orbs: Orb[] = [];
    let data = new Float32Array(0);
    let width = 1;
    let height = 1;
    let clock = 0;
    // The progress on screen eases towards the progress asked for, so a jump reads as a rush.
    let shown = 0;
    let started = false;
    // In `auto`, the demo runs until a page first sets progress; from then the page drives it.
    let driven = false;

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        if (!time.still) clock += time.delta;
        const count = Math.round(params.count);
        if (orbs.length !== count) {
          orbs = buildOrbs(count);
          data = new Float32Array(count * POINT_FLOATS);
        }
        if (params.progress !== 0) driven = true;
        const spinner = params.mode === 'spinner';
        const demo = params.mode === 'auto' && !driven;

        let target01 = params.progress;
        let release = 0;
        if (demo) {
          const now = time.still ? { progress: STILL_PROGRESS, release: 0 } : demoProgress(clock);
          target01 = now.progress;
          release = now.release;
        }
        // The demo is already smooth, and a held frame shows where things stand, not on the way.
        const snap = demo || time.still || !started;
        shown = snap
          ? target01
          : shown + (target01 - shown) * (1 - Math.exp(-time.delta / params.ease));
        started = true;

        const bar = params.layout === 'bar';
        const cx = width / 2;
        const cy = height / 2;
        const radius = params.size * height;
        const halfBar = Math.min(0.42 * width, 2 * radius);
        const lens: ThinLens = { focus: FOCUS, blurAtInfinity: params.blur * height };
        const reference = Math.PI * (REFERENCE_BLUR * height) ** 2;
        const base = 0.18 * reference * params.brightness;
        const drift = 0.035 * height * params.wander;
        const head = clock * params.spin;
        const shimmer = { rate: 1.5, depth: params.twinkle, shimmer: 0, shimmerRate: 0 };

        let n = 0;
        orbs.forEach((orb, i) => {
          const u = bar ? i / Math.max(count - 1, 1) : i / count;
          // Ring slots run clockwise from twelve o'clock; bar slots left to right.
          const angle = -Math.PI / 2 + 2 * Math.PI * u;
          const slotX = bar ? cx + halfBar * (2 * u - 1) : cx + radius * Math.cos(angle);
          const slotY = bar ? cy : cy + radius * Math.sin(angle);

          let gather = spinner
            ? spinGather(bar ? (head % (1 + SPIN_LEAD + SPIN_TAIL)) - SPIN_LEAD : head, u, !bar)
            : gatherAt(shown, i, count);
          gather = Math.min(gather, 1 - release);
          const e = smoothstep(gather);

          // In log depth from its own depth to the focal plane.
          const depth = Math.exp(Math.log(orb.depth) * (1 - e)) * FOCUS;
          const coc = cocRadius(lens, depth);
          // Perspective about the image centre, toned down by `parallax` so the orbs stay near
          // their slots; and a slow wander that settles as the orb arrives.
          const scale = 1 + params.parallax * (FOCUS / depth - 1);
          const loose = (1 - e) * drift;
          const x = cx + (slotX - cx) * scale + loose * Math.sin(clock * 0.45 + orb.phase);
          const y =
            cy +
            (slotY - cy) * scale +
            loose * Math.sin(clock * 0.33 + orb.phase2) * (bar ? 1.6 : 1);
          // A soft orb breathes a little (the capped flicker signal); a gathered one holds still.
          const breathe = 1 - (1 - e) * (1 - flickerIntensity(clock, orb.seed, shimmer));
          const light = base * orb.level * breathe;
          const c0 = params.colour;
          const c1 = params.endColour;
          data.set(
            [
              x,
              y,
              coc,
              0,
              (c0[0] + (c1[0] - c0[0]) * u) * light,
              (c0[1] + (c1[1] - c0[1]) * u) * light,
              (c0[2] + (c1[2] - c0[2]) * u) * light,
              0,
            ],
            n * POINT_FLOATS,
          );
          n++;
        });
        points.setPoints(data, n);
        points.encode(
          encoder,
          tail.scene.view,
          { width, height, aperture: params, clear: [0.0012, 0.0012, 0.0024, 1] },
          profiler,
        );
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({ progress: shown.toFixed(3), orbs: orbs.length }),
      destroy() {
        points.destroy();
        tail.destroy();
      },
    };
  },
});
