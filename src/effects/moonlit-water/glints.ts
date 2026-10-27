/*
 * The glitter path as points of light: which patches of sea mirror the moon into the lens, and how
 * much of its light each one sends. Pure CPU, no GPU, so tests can run it.
 *
 * Built on Water Temple's `sun-glint` "stable glitter" (src/wgsl/specular.wgsl, `spec_sparkle`):
 * the sea is cut into cells fixed in the world, a cell glints when the slope its facets need to
 * mirror the moon into the lens is near the slope the sea has there, and the cells twinkle without
 * ever popping. What changes here is that each cell is not shaded into a pixel but emitted as a
 * point at its distance, so the thin lens can blur it into an aperture-shaped disc.
 *
 *   1. Cells. A grid on the sea whose cells are all about `kappa` radians across on screen: the
 *      lateral size grows as the distance z, the depth size as z^2 / eye (a patch of sea is
 *      foreshortened by eye / z). Sizes come in power-of-two levels (lateral x2, depth x4 per
 *      level, one level per doubling of distance), and each point of sea is shared by two levels
 *      with hat weights summing to 1, so the light per area is the same everywhere and there is no
 *      seam where the level changes. `kappa` is set from the cell budget (`cap`).
 *   2. Where the moon glints. The facet a cell needs is the half vector h between the moon and the
 *      lens: its slope is (-h.x / h.y, -h.z / h.y). Slopes on a real sea are spread about the
 *      large waves' slope by the small ones, as a Gaussian whose variance Cox and Munk measured
 *      against wind speed. So a cell's expected radiance is the classic glitter formula
 *
 *        L = E_moon F(v.h) p(slope needed - swell slope) / (4 cos^4 beta)
 *
 *      with E_moon the moon's irradiance, F water's Fresnel reflectance, p the Gaussian and beta
 *      the facet's tilt. The light reaching the lens is L times the cell's solid angle; the cos of
 *      the view angle cancels. Swells shorter than a cell can resolve go into the Gaussian.
 *   3. When it glints. Instead of facets circling at their own speed (sun-glint's twinkle, whose
 *      rate is unbounded), each cell's brightness is multiplied by a peaked function of the capped
 *      flicker signal (src/gpu/optics/flicker.ts), normalised to mean 1. A monotone function of the
 *      signal reverses direction no more often than the signal does, so a single glint never makes
 *      more than three WCAG flashes a second, and the path's mean light is the formula's.
 *      A held frame keeps the moment's pattern of glints but clips each at STILL_PEAK times its mean,
      so the path is calm: no glint is frozen at the top of a sparkle.
 */
import {
  FLICKER_PERIOD,
  flickerClamp,
  flickerIntensity,
  type FlickerSettings,
} from '../../gpu/optics/flicker.ts';
import { SWELL_TERMS, swellAt, swellFade, swellSlopeVariance } from './swell.ts';

/** Refractive index of sea water. */
const WATER_IOR = 1.34;
/** Below this flicker level a glint is dark; above it, it rises as the square. */
export const TWINKLE_THRESHOLD = 0.5;
/**
 * Mean of `twinkleShape` over time and seeds for TWINKLE_SETTINGS at any rate above 0
 * (tests/moonlit-water.test.ts measures it), so `twinkle` has mean 1.
 */
export const TWINKLE_MEAN = 0.0444;
/** The flicker signal under the twinkle: full depth, the largest safe shimmer. */
export const TWINKLE_SETTINGS: Readonly<FlickerSettings> = {
  rate: 3,
  depth: 0.96,
  shimmer: 0.04,
  shimmerRate: 12,
};
/**
 * A held frame clips each glint's twinkle at this many times its mean. The first try held every
 * cell steady at its mean: calm, but the path became a smooth smear with no discs in it, and
 * spread evenly its light read 7% brighter through the tone curve than any played frame (the
 * reduced-motion audit caught it).
 */
export const STILL_PEAK = 2;
/** A cell is skipped when its Gaussian exponent is above this (e^-7: under 0.1% of its peak). */
const CUTOFF = 7;
/** Cells reach this far past the frame, as a share of its height, for discs that spill in. */
const MARGIN = 0.15;
/** Farthest sea that holds cells, metres. */
const FAR = 6000;

/** The twinkle's peaked shape of a flicker level f in [0, 1]: 0 below the threshold, then f^2-like. */
export function twinkleShape(f: number): number {
  const x = Math.max(0, (f - TWINKLE_THRESHOLD) / (1 - TWINKLE_THRESHOLD));
  return x * x;
}

/** A cell's brightness factor at time `t` (real seconds), mean 1. */
export function twinkle(t: number, seed: number, settings: Readonly<FlickerSettings>): number {
  return twinkleShape(flickerIntensity(t % FLICKER_PERIOD, seed, settings)) / TWINKLE_MEAN;
}

/** Water's unpolarised Fresnel reflectance at incidence cosine `c`. */
export function fresnelWater(c: number): number {
  const cos = Math.min(1, Math.max(1e-4, c));
  const sin2 = (1 - cos * cos) / (WATER_IOR * WATER_IOR);
  const cosT = Math.sqrt(Math.max(0, 1 - sin2));
  const n = WATER_IOR;
  const rs = (cos - n * cosT) / (cos + n * cosT);
  const rp = (n * cos - cosT) / (n * cos + cosT);
  return 0.5 * (rs * rs + rp * rp);
}

/** Cox and Munk's slope variances (crosswind x, upwind z) for a wind of `wind` m/s along z. */
export function coxMunk(wind: number): [number, number] {
  const u = Math.max(0, wind);
  // A floor for a dead calm: no sea is a perfect mirror over a whole cell.
  return [0.003 + 0.00192 * u, Math.max(0.0008, 0.00316 * u)];
}

export interface SeaView {
  /** Height of the lens above mean sea level, metres. */
  eye: number;
  /** The moon's elevation, radians. It is straight ahead (azimuth 0). */
  moonElevation: number;
  /** Swell strength: 1 is Water Temple's lively sea. */
  waves: number;
  /** Wind speed, m/s, for the Cox–Munk slope spread. */
  wind: number;
  /** About how many cells to keep. */
  cap: number;
  /** Width / height of the frame. */
  aspect: number;
  /** Height of the view at 1 m (24 / focal length). */
  viewScale: number;
  /** Where the horizon (the optical axis) crosses the frame, uv.y from the top. */
  horizon: number;
}

/** The cells that can glint, as parallel arrays. */
export interface Cells {
  count: number;
  /** Angular size of a cell before its level's resizing, tan units. */
  kappa: number;
  x: Float64Array;
  z: Float64Array;
  /** Everything but the moon's irradiance, the Gaussian and the twinkle: w A F / (4 cos^4 beta d^2). */
  base: Float64Array;
  /** Slope the facets need, x and z. */
  needX: Float64Array;
  needZ: Float64Array;
  /** 1 / (2 sigma^2) per axis, and the Gaussian's normalisation 1 / (2 pi sigma_x sigma_z). */
  ax: Float64Array;
  az: Float64Array;
  norm: Float64Array;
  /** How much of each swell the cell resolves, SWELL_TERMS.length per cell. */
  fades: Float64Array;
  seed: Uint32Array;
  /** Which size level the cell belongs to. */
  level: Uint8Array;
}

/** A small integer hash to [0, 1), for cell jitter and seeds. */
function hash3(a: number, b: number, c: number): number {
  let h =
    Math.imul(a | 0, 0x8da6b343) ^ Math.imul(b | 0, 0xd8163841) ^ Math.imul(c | 0, 0xcb1ab31f);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

interface Bounds {
  /** Largest slope offset, per axis, that can still glint. */
  kx: number;
  kz: number;
  zNear: number;
  /** Half-width of the frame at 1 m, with the margin. */
  side: number;
  sinE: number;
  cosE: number;
  cm: [number, number];
}

function bounds(view: SeaView): Bounds {
  const cm = coxMunk(view.wind);
  let swellX = 0;
  let swellZ = 0;
  for (let i = 0; i < SWELL_TERMS.length; i++) {
    const [vx, vz] = swellSlopeVariance(i, view.waves);
    swellX += vx;
    swellZ += vz;
  }
  const below = (1 - view.horizon + MARGIN) * view.viewScale;
  return {
    kx: 3 * Math.sqrt(swellX) + 3.7 * Math.sqrt(cm[0]),
    kz: 3 * Math.sqrt(swellZ) + 3.7 * Math.sqrt(cm[1]),
    zNear: view.eye / below,
    side: (view.aspect / 2 + MARGIN) * view.viewScale,
    sinE: Math.sin(view.moonElevation),
    cosE: Math.cos(view.moonElevation),
    cm,
  };
}

/** Visits every cell at angular size `kappa` that can glint; returns the count. */
function walk(
  view: SeaView,
  b: Bounds,
  kappa: number,
  scales: readonly number[],
  visit?: (
    x: number,
    z: number,
    w: number,
    sx: number,
    sz: number,
    seed: number,
    level: number,
  ) => void,
): number {
  let count = 0;
  for (let level = 0; ; level++) {
    const zl = b.zNear * 2 ** level;
    if (zl / 2 > FAR) break;
    const k = kappa * (scales[level] ?? 1);
    const sx = k * zl;
    const sz = (k * zl * zl) / view.eye;
    // This level's hat: lod = log2(z / zNear), weight 1 - |lod - level|; level 0 takes all nearer.
    const zLo = Math.max(b.zNear * 0.75, level === 0 ? 0 : zl / 2);
    const zHi = Math.min(FAR, zl * 2);
    for (let iz = Math.floor(zLo / sz); iz * sz < zHi; iz++) {
      const zRow = (iz + 0.5) * sz;
      const dRow = Math.hypot(zRow, view.eye);
      // The row is in the path only if the needed upwind slope can be reached.
      const needZ = (zRow - dRow * b.cosE) / (view.eye + dRow * b.sinE);
      if (Math.abs(needZ) > b.kz * 1.2) continue;
      const half = Math.min(b.side * zRow, b.kx * 1.2 * (view.eye + dRow * b.sinE));
      const ixHi = Math.ceil(half / sx);
      if (!visit) {
        count += 2 * ixHi;
        continue;
      }
      for (let ix = -ixHi; ix < ixHi; ix++) {
        const jx = hash3(ix, iz, level * 2 + 1) - 0.5;
        const jz = hash3(ix, iz, level * 2 + 2) - 0.5;
        const x = (ix + 0.5 + 0.8 * jx) * sx;
        const z = (iz + 0.5 + 0.8 * jz) * sz;
        if (z < b.zNear * 0.75 || z > FAR) continue;
        const lod = Math.max(0, Math.log2(z / b.zNear));
        const w = 1 - Math.abs(lod - level);
        if (w <= 0) continue;
        if (Math.abs(x) > b.side * z) continue;
        const seed = (hash3(ix, iz, level * 2 + 7) * 4294967296) >>> 0;
        visit(x, z, w, sx, sz, seed, level);
        count++;
      }
    }
  }
  return count;
}

/** Unit half vector between the lens and the moon for a patch of sea at (x, z). */
function halfVector(view: SeaView, b: Bounds, x: number, z: number) {
  const d = Math.hypot(x, view.eye, z);
  const v = [-x / d, view.eye / d, -z / d] as const;
  const hx = v[0];
  const hy = v[1] + b.sinE;
  const hz = v[2] + b.cosE;
  const l = Math.hypot(hx, hy, hz);
  return { d, v, h: [hx / l, hy / l, hz / l] as const };
}

/** Slope variances (x, z) for a cell `sx` by `sz` metres: Cox–Munk plus the swells it cannot resolve. */
function spread(
  view: SeaView,
  b: Bounds,
  sx: number,
  sz: number,
  fades?: number[],
): [number, number] {
  let varX = b.cm[0];
  let varZ = b.cm[1];
  for (let i = 0; i < SWELL_TERMS.length; i++) {
    const s = SWELL_TERMS[i]!;
    const fade = swellFade(s.wavelength, Math.abs(s.dx) * sx + Math.abs(s.dz) * sz);
    const [px, pz] = swellSlopeVariance(i, view.waves);
    varX += (1 - fade * fade) * px;
    varZ += (1 - fade * fade) * pz;
    fades?.push(fade);
  }
  return [varX, varZ];
}

/**
 * Cell sizes per level so that every cell carries about the same expected light. The path's
 * radiance grows many times towards the horizon (Fresnel at grazing, and the needed slope near
 * zero), and with cells of one angular size a few far ones carried most of the light: their
 * twinkle moved the whole path's brightness by 6% in a frame. So the cells are laid out once,
 * each level's mean light per cell measured, and each level's cells resized by the square root of
 * its share (light per cell goes as cell area), twice, then the overall size set by the budget.
 */
export function buildCells(view: SeaView): Cells {
  const b = bounds(view);
  const cap = Math.max(50, view.cap);
  let scales: number[] = [];
  let kappa = 0.01;
  let cells = collect(view, b, kappa, scales);
  for (let pass = 0; pass < 4; pass++) {
    if (pass === 1 || pass === 2) {
      // Equalise: each level's mean light per cell to the overall mean.
      const sum: number[] = [];
      const count: number[] = [];
      for (let i = 0; i < cells.count; i++) {
        const level = cells.level[i]!;
        const q = cells.needX[i]! ** 2 * cells.ax[i]! + cells.needZ[i]! ** 2 * cells.az[i]!;
        sum[level] = (sum[level] ?? 0) + cells.base[i]! * cells.norm[i]! * Math.exp(-q);
        count[level] = (count[level] ?? 0) + 1;
      }
      const mean = sum.reduce((a, v) => a + (v ?? 0), 0) / Math.max(1, cells.count);
      scales = sum.map((v, level) => {
        const share = (v ?? 0) / Math.max(1, count[level] ?? 0) / Math.max(mean, 1e-30);
        const scale = (scales[level] ?? 1) / Math.sqrt(Math.max(share, 1e-4));
        return Math.min(16, Math.max(1 / 16, scale));
      });
    }
    // The count goes as 1 / kappa^2.
    kappa *= Math.sqrt(Math.max(1, cells.count) / cap);
    cells = collect(view, b, kappa, scales);
  }
  return cells;
}

function collect(view: SeaView, b: Bounds, kappa: number, scales: readonly number[]): Cells {
  const terms = SWELL_TERMS.length;
  const list: number[][] = [];
  walk(view, b, kappa, scales, (x, z, w, sx, sz, seed, level) => {
    // The facet the cell needs is the half vector between the lens and the moon.
    const { d, v, h } = halfVector(view, b, x, z);
    const needX = -h[0] / h[1];
    const needZ = -h[2] / h[1];
    if (Math.abs(needX) > b.kx || Math.abs(needZ) > b.kz) return;
    // Swells shorter than the cell along their direction are unresolved: their slopes join the
    // Gaussian's spread.
    const fades: number[] = [];
    const [varX, varZ] = spread(view, b, sx, sz, fades);
    const f = fresnelWater(v[0] * h[0] + v[1] * h[1] + v[2] * h[2]);
    const base = (w * sx * sz * f) / (4 * h[1] ** 4 * d * d);
    list.push([
      x,
      z,
      base,
      needX,
      needZ,
      1 / (2 * varX),
      1 / (2 * varZ),
      1 / (2 * Math.PI * Math.sqrt(varX * varZ)),
      seed,
      level,
      ...fades,
    ]);
  });

  const n = list.length;
  const cells: Cells = {
    count: n,
    kappa,
    x: new Float64Array(n),
    z: new Float64Array(n),
    base: new Float64Array(n),
    needX: new Float64Array(n),
    needZ: new Float64Array(n),
    ax: new Float64Array(n),
    az: new Float64Array(n),
    norm: new Float64Array(n),
    fades: new Float64Array(n * terms),
    seed: new Uint32Array(n),
    level: new Uint8Array(n),
  };
  list.forEach((c, i) => {
    cells.x[i] = c[0]!;
    cells.z[i] = c[1]!;
    cells.base[i] = c[2]!;
    cells.needX[i] = c[3]!;
    cells.needZ[i] = c[4]!;
    cells.ax[i] = c[5]!;
    cells.az[i] = c[6]!;
    cells.norm[i] = c[7]!;
    cells.seed[i] = c[8]!;
    cells.level[i] = c[9]!;
    for (let k = 0; k < terms; k++) cells.fades[i * terms + k] = c[10 + k]!;
  });
  return cells;
}

export interface GlintFrame {
  /** Wave clock, seconds (scaled by the wave speed). */
  waveTime: number;
  /** Real seconds, for the twinkle; its rate cap holds only in real time. */
  twinkleTime: number;
  /** Knots per second of the twinkle, clamped to the safe cap of 4. */
  twinkleRate: number;
  /** A held frame: the twinkle clipped at STILL_PEAK. */
  still: boolean;
  /** Each glint's expected light, with no twinkle at all (for measuring the path). */
  expected?: boolean;
  /** Swell strength, as the cells were built with. */
  waves: number;
  /** Light scale: the moon's irradiance times the focal length in pixels squared. */
  gain: number;
}

/**
 * Calls `emit(x, height, z, light)` for each glinting cell: its position on the sea (with the
 * swell's height at it) and the light it sends to the lens, in the point layer's units.
 */
export function emitGlints(
  cells: Cells,
  frame: GlintFrame,
  emit: (x: number, height: number, z: number, light: number) => void,
): number {
  const terms = SWELL_TERMS.length;
  const swell = new Float64Array(3);
  const fades = new Float64Array(terms);
  const settings = flickerClamp({ ...TWINKLE_SETTINGS, rate: frame.twinkleRate });
  let emitted = 0;
  for (let i = 0; i < cells.count; i++) {
    for (let k = 0; k < terms; k++) fades[k] = cells.fades[i * terms + k]!;
    swellAt(cells.x[i]!, cells.z[i]!, frame.waveTime, frame.waves, fades, swell);
    const dx = cells.needX[i]! - swell[1]!;
    const dz = cells.needZ[i]! - swell[2]!;
    const q = dx * dx * cells.ax[i]! + dz * dz * cells.az[i]!;
    if (q > CUTOFF) continue;
    const p = cells.norm[i]! * Math.exp(-q);
    const shine = frame.expected ? 1 : twinkle(frame.twinkleTime, cells.seed[i]!, settings);
    const g = frame.still ? Math.min(STILL_PEAK, shine) : shine;
    if (g <= 0) continue;
    emit(cells.x[i]!, swell[0]!, cells.z[i]!, frame.gain * cells.base[i]! * p * g);
    emitted++;
  }
  return emitted;
}
