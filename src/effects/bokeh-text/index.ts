import { APERTURE_PARAMS } from '../../gpu/optics/aperture.ts';
import { flickerIntensity, type FlickerSettings } from '../../gpu/optics/flicker.ts';
import { cocRadius, lensFromCamera } from '../../gpu/optics/lens.ts';
import { createPointLayer, POINT_FLOATS } from '../../gpu/points.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { createRandom } from '../../gpu/random.ts';
import { decodeAtlas, measureGlyphs } from '../../gpu/ui/atlas.ts';
import { defineEffect } from '../types.ts';
import { fitWord, sampleWord, type Fit } from './glyph-points.ts';
import { meta } from './meta.ts';

/*
 * A word made of lights (story 4.9). The word is set from the MSDF atlas and sampled on the CPU
 * into N points inside its glyphs (glyph-points.ts). Each orb owns one of those points, in the
 * focal plane, and a depth of its own off it, at a scattered place in the frame. Its "gather"
 * (0..1) moves it in log depth to the focal plane, so its circle of confusion shrinks through the
 * thin-lens model (src/gpu/optics/lens.ts), while it travels from its scattered place to its point
 * a little ahead of focusing: the letters gather as soft blobs and then sharpen. The shared point
 * layer (src/gpu/points.ts) keeps each orb's light whatever its size, so the word brightens as it
 * resolves. The structure is bokeh-loader's (story 6.7), with the ring's slots replaced by the
 * glyph samples and a few thousand orbs instead of a few dozen.
 */

type Rgb = readonly [number, number, number];

/** The lens: a short tele focused at two metres; `fNumber` sets how big the discs are. */
const FOCAL_LENGTH = 85;
const FOCUS = 2;
/** How many orbs' worth of progress the gathering front spans, as a share of the whole. */
const FRONT = 0.55;
/** The loop, in multiples of the rise time `duration`: hold, fall, then rest out of focus. */
const LOOP_HOLD = 1.1;
const LOOP_FALL = 0.6;
const LOOP_REST = 0.3;
/**
 * Each orb's light, in units of the grid spacing squared (device pixels): the resolved word has
 * the same brightness per area of ink whatever its size, the frame's or the orb count.
 */
const LIGHT = 1.1;

/** Shown when no page sets a word; a page may write any capitals and digits into `params.word`. */
const WORDS = ['MOON TEMPLE', 'BOKEH', 'AFTER DARK', 'OPENING NIGHT', 'LATE SHOW', 'HELLO 2026'];

interface Palette {
  /** Colours from the word's left to its right. */
  stops: readonly Rgb[];
  /** How far an orb's colour strays from its place along the word, 0..1. */
  spread: number;
  /** Pick one of the stops at random instead (mixed street lights). */
  pick?: boolean;
}

const PALETTES: Record<string, Palette> = {
  moonlight: {
    stops: [
      [0.5, 0.68, 1],
      [0.82, 0.86, 1],
      [0.68, 0.52, 1],
    ],
    spread: 0.25,
  },
  gold: {
    stops: [
      [1, 0.55, 0.18],
      [1, 0.78, 0.42],
      [1, 0.42, 0.12],
    ],
    spread: 0.35,
  },
  'city lights': {
    stops: [
      [1, 0.5, 0.16],
      [1, 0.88, 0.7],
      [0.42, 0.58, 1],
      [1, 0.2, 0.12],
      [1, 0.68, 0.3],
    ],
    spread: 1,
    pick: true,
  },
  rose: {
    stops: [
      [1, 0.4, 0.58],
      [1, 0.68, 0.58],
      [0.72, 0.42, 1],
    ],
    spread: 0.3,
  },
  ice: {
    stops: [
      [0.4, 0.82, 1],
      [0.78, 0.95, 1],
      [0.38, 0.56, 1],
    ],
    spread: 0.25,
  },
  white: { stops: [[1, 0.94, 0.86]], spread: 0 },
};

const ORDERS = ['scattered', 'left to right', 'centre out'] as const;

const smoothstep = (x: number) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * (3 - 2 * t);
};

/** The loop's progress at `t` seconds, with a rise of `rise` seconds. */
export function loopProgress(t: number, rise: number): number {
  const hold = LOOP_HOLD * rise;
  const fall = LOOP_FALL * rise;
  const cycle = rise + hold + fall + LOOP_REST * rise;
  const at = ((t % cycle) + cycle) % cycle;
  if (at < rise) return at / rise;
  if (at < rise + hold) return 1;
  if (at < rise + hold + fall) return 1 - (at - rise - hold) / fall;
  return 0;
}

/** How gathered an orb that starts at `delay` (0..1) is at `progress`. */
export function gatherAt(progress: number, delay: number): number {
  const p = Math.min(Math.max(progress, 0), 1);
  return Math.min(Math.max((p * (1 + FRONT) - delay) / FRONT, 0), 1);
}

function paletteColour(palette: Palette, u: number, r: number): Rgb {
  const { stops } = palette;
  if (palette.pick) return stops[Math.min(Math.floor(r * stops.length), stops.length - 1)]!;
  if (stops.length === 1) return stops[0]!;
  const t = Math.min(Math.max(u * (1 - palette.spread) + r * palette.spread, 0), 1);
  const at = t * (stops.length - 1);
  const i = Math.min(Math.floor(at), stops.length - 2);
  const f = at - i;
  const a = stops[i]!;
  const b = stops[i + 1]!;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** Per-orb state that does not depend on the frame's size or the live parameters. */
interface Orbs {
  count: number;
  /** Target in the word, cell heights. */
  tx: Float32Array;
  ty: Float32Array;
  /** Uniform randoms: behind focus or in front, how far, where it starts, how it wanders. */
  far: Uint8Array;
  depthU: Float32Array;
  angle: Float32Array;
  reach: Float32Array;
  phase: Float32Array;
  phase2: Float32Array;
  level: Float32Array;
  order: Float32Array;
  colour: Float32Array;
}

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    word: { type: 'select', default: 'MOON TEMPLE', options: WORDS },
    mode: {
      type: 'select',
      default: 'loop',
      options: ['loop', 'reveal', 'progress'],
      label: 'mode (reveal plays once)',
    },
    progress: { type: 'number', default: 1, min: 0, max: 1, step: 0.001 },
    duration: { type: 'number', default: 2.6, min: 0.8, max: 8, step: 0.1, label: 'rise (s)' },
    order: { type: 'select', default: 'scattered', options: ORDERS, label: 'gather order' },
    orbs: { type: 'number', default: 1400, min: 300, max: 4000, step: 50 },
    palette: { type: 'select', default: 'moonlight', options: Object.keys(PALETTES) },
    fNumber: { type: 'number', default: 1.4, min: 0.95, max: 8, step: 0.05, label: 'f-number' },
    depth: { type: 'number', default: 1.1, min: 0.2, max: 2, step: 0.05, label: 'depth spread' },
    scatter: {
      type: 'number',
      default: 0.45,
      min: 0,
      max: 1.2,
      step: 0.01,
      label: 'scatter (image heights)',
    },
    parallax: {
      type: 'number',
      default: 0.25,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'depth parallax',
    },
    wander: { type: 'number', default: 1, min: 0, max: 3, step: 0.05 },
    dot: {
      type: 'number',
      default: 0.32,
      min: 0,
      max: 0.8,
      step: 0.01,
      label: 'sharp dot (share of spacing)',
    },
    twinkle: { type: 'number', default: 0.15, min: 0, max: 0.5, step: 0.01 },
    brightness: { type: 'number', default: 1, min: 0, max: 4, step: 0.05 },
    ...APERTURE_PARAMS,
    rim: { ...APERTURE_PARAMS.rim, default: 0.3 },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.7 },
  },
  presets: {
    moonlight: {},
    'reveal once': { mode: 'reveal' },
    'left to right': { order: 'left to right', word: 'AFTER DARK', duration: 3.2 },
    'gold hexagons': {
      palette: 'gold',
      word: 'OPENING NIGHT',
      blades: 6,
      curvature: 0.1,
      rotation: 10,
    },
    'city lights': { palette: 'city lights', word: 'LATE SHOW', fNumber: 1, depth: 1.4 },
    'fine dust': { orbs: 3200, dot: 0.28, fNumber: 2, palette: 'ice', word: 'BOKEH' },
    'few and large': { orbs: 600, fNumber: 0.95, dot: 0.38, palette: 'rose', word: 'BOKEH' },
    'held half way': { mode: 'progress', progress: 0.5 },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'bokeh text' });
    const points = createPointLayer(device, { label: 'bokeh text', format: tail.scene.format });
    const atlas = await decodeAtlas();
    const metrics = measureGlyphs(atlas);

    let width = 1;
    let height = 1;
    let clock = 0;
    let shown = params.progress;
    let started = false;
    let fit: Fit | undefined;
    let fitKey = '';
    let spacing = 1;
    let orbs: Orbs | undefined;
    let key = '';
    let word = '';
    let data = new Float32Array(0);

    /** Sets the word for this frame size and gives every orb a point in it. */
    function build() {
      const sized = `${params.word}|${width}x${height}`;
      if (sized !== fitKey || !fit) {
        fit = fitWord(params.word, metrics, width, height);
        fitKey = sized;
      }
      const next = fit;
      const count = Math.round(params.orbs);
      const nextKey = `${params.word}|${next.layout.lines}|${count}|${params.palette}|${params.order}`;
      if (nextKey === key && orbs) return;
      key = nextKey;
      // A new word starts its reveal over; a new count or palette carries on where it was.
      if (params.word !== word) clock = 0;
      word = params.word;
      const sample = sampleWord(atlas, next.layout, count);
      spacing = sample.spacing;
      const random = createRandom(409);
      const palette = PALETTES[params.palette] ?? PALETTES.moonlight!;
      const { width: w, height: h } = next.layout;
      const made: Orbs = {
        count,
        tx: new Float32Array(count),
        ty: new Float32Array(count),
        far: new Uint8Array(count),
        depthU: new Float32Array(count),
        angle: new Float32Array(count),
        reach: new Float32Array(count),
        phase: new Float32Array(count),
        phase2: new Float32Array(count),
        level: new Float32Array(count),
        order: new Float32Array(count),
        colour: new Float32Array(count * 3),
      };
      for (let i = 0; i < count; i++) {
        const x = sample.points[2 * i]!;
        const y = sample.points[2 * i + 1]!;
        made.tx[i] = x;
        made.ty[i] = y;
        // Three in five behind focus, the rest in front, where the lens flips the disc.
        made.far[i] = random() < 0.6 ? 1 : 0;
        made.depthU[i] = 0.25 + 0.75 * random();
        made.angle[i] = random() * Math.PI * 2;
        made.reach[i] = Math.sqrt(random());
        made.phase[i] = random() * Math.PI * 2;
        made.phase2[i] = random() * Math.PI * 2;
        made.level[i] = 0.75 + 0.5 * random();
        const u = x / Math.max(w, 1e-6);
        const r = random();
        made.order[i] =
          params.order === 'left to right'
            ? 0.8 * u + 0.2 * r
            : params.order === 'centre out'
              ? 0.8 * Math.min(Math.hypot(2 * u - 1, (2 * y) / Math.max(h, 1e-6) - 1), 1) + 0.2 * r
              : r;
        made.colour.set(paletteColour(palette, u, random()), i * 3);
      }
      orbs = made;
      data = new Float32Array(count * POINT_FLOATS);
    }

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        if (!time.still) clock += time.delta;
        build();
        const o = orbs!;
        const layout = fit!.layout;
        const size = fit!.size;

        // Where things stand. A held frame shows the word resolved, unless a page is driving it.
        let goal: number;
        if (params.mode === 'progress') goal = params.progress;
        else if (time.still) goal = 1;
        else if (params.mode === 'reveal') goal = Math.min(clock / params.duration, 1);
        else goal = loopProgress(clock, params.duration);
        // A page's jumps are eased (0.25 s) so they read as a rush, not a cut.
        const snap = params.mode !== 'progress' || time.still || !started;
        shown = snap ? goal : shown + (goal - shown) * (1 - Math.exp(-time.delta / 0.25));
        started = true;

        const cx = width / 2;
        const cy = height / 2;
        const ox = cx - (layout.width * size) / 2;
        const oy = cy - (layout.height * size) / 2;
        const lens = lensFromCamera({
          focalLength: FOCAL_LENGTH,
          fNumber: params.fNumber,
          focusDistance: FOCUS,
          imageHeight: height,
        });
        const pitch = spacing * size;
        const light = LIGHT * pitch * pitch * params.brightness;
        const dot = Math.max(params.dot * pitch, 0.35);
        const reachX = params.scatter * height * Math.max(1, (0.8 * width) / height);
        const reachY = params.scatter * height;
        const drift = 0.02 * height * params.wander;
        const shimmer: FlickerSettings = {
          rate: 1.5,
          depth: params.twinkle,
          shimmer: 0,
          shimmerRate: 0,
        };

        for (let i = 0; i < o.count; i++) {
          const g = gatherAt(shown, o.order[i]!);
          // Travel leads focus: the letters gather soft, then sharpen.
          const ep = 1 - Math.pow(1 - g, 2.2);
          const ed = smoothstep(g);
          const far = o.far[i] === 1;
          const reach = params.depth * o.depthU[i]!;
          const start = far ? Math.exp(reach) : Math.exp(-0.55 * reach);
          // In log depth from its own depth to the focal plane.
          const depth = Math.exp(Math.log(start) * (1 - ed));
          const coc = cocRadius(lens, depth * FOCUS);
          // A sharp orb is a small dot, not a point, so a dense word reads as filled strokes.
          const radius = (far ? 1 : -1) * Math.hypot(coc, dot);

          const tx = ox + o.tx[i]! * size;
          const ty = oy + o.ty[i]! * size;
          const angle = o.angle[i]!;
          const sx = tx + reachX * o.reach[i]! * Math.cos(angle);
          const sy = ty + reachY * o.reach[i]! * Math.sin(angle);
          const scale = 1 + params.parallax * (1 / depth - 1);
          const loose = (1 - ep) * drift;
          const x =
            cx + (sx + (tx - sx) * ep - cx) * scale + loose * Math.sin(clock * 0.4 + o.phase[i]!);
          const y =
            cy + (sy + (ty - sy) * ep - cy) * scale + loose * Math.sin(clock * 0.31 + o.phase2[i]!);

          // A soft orb breathes a little (the capped flicker signal); a sharp one holds still. A
          // held frame shows no breathing at all.
          const breathe =
            params.twinkle > 0 && ed < 1 && !time.still
              ? 1 - (1 - ed) * (1 - flickerIntensity(clock, 900 + i, shimmer))
              : 1;
          const k = light * o.level[i]! * breathe;
          const at = i * POINT_FLOATS;
          data[at] = x;
          data[at + 1] = y;
          data[at + 2] = radius;
          data[at + 3] = 0;
          data[at + 4] = o.colour[i * 3]! * k;
          data[at + 5] = o.colour[i * 3 + 1]! * k;
          data[at + 6] = o.colour[i * 3 + 2]! * k;
          data[at + 7] = 0;
        }
        points.setPoints(data, o.count);
        points.encode(
          encoder,
          tail.scene.view,
          { width, height, aperture: params, clear: [0.0012, 0.0012, 0.0024, 1] },
          profiler,
        );
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({
        progress: shown.toFixed(3),
        orbs: orbs?.count ?? 0,
        lines: fit?.layout.lines ?? 0,
        'spacing px': (spacing * (fit?.size ?? 0)).toFixed(1),
      }),
      destroy() {
        points.destroy();
        tail.destroy();
      },
    };
  },
});
