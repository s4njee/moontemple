/*
 * The prism's scene (story 9.3), GPU-free: where the prism stands, the beam that goes into it, and
 * everything 9.2's tracer (src/gpu/optics/glass.ts) says comes out, as the shader draws it and as
 * tests/prism.test.ts checks it.
 *
 * Everything that matters happens in one horizontal plane. The prism stands upright on the floor,
 * its refracting edges vertical, and a slit lights it with a sheet of light `slit` wide and
 * BEAM_HEIGHT tall, travelling level. Every face but the top and bottom is vertical, so a level ray
 * stays level through every refraction and reflection, and the light on the back wall is a band:
 * a profile across the wall (traced here) times the slit's height.
 *
 * Collimated light through flat faces is an affine map, so tracing the two edges of the sheet is
 * enough to know where each wavelength's strip of light lands. Each wavelength's share of the beam
 * (`spectralSamples`, which sums to white) is spread evenly over its strip; summed over 96
 * wavelengths, and over every ray the tracer splits off (the front reflection, light that leaves
 * after reflecting inside), that is the irradiance across the wall, exact up to the sampling.
 */

import { prismPlanes, traceRays, type Plane, type Vec3 } from '../../gpu/optics/glass.ts';
import {
  GLASSES,
  spectralRgb,
  spectralSamples,
  spectralWhite,
  type Glass,
} from '../../gpu/optics/spectral.ts';

export const DEG = Math.PI / 180;

/** Lamps behind the slit: a continuum, or the emission lines of a discharge tube. */
export const SOURCES = {
  white: [],
  // Balmer lines, H-alpha to H-delta, at the Balmer decrement of a hot gas (2.86 : 1 : 0.47 : 0.26).
  hydrogen: [
    [656.3, 2.86],
    [486.1, 1],
    [434.0, 0.47],
    [410.2, 0.26],
  ],
  // The visible lines of a low-pressure mercury lamp, roughly as bright as they look.
  mercury: [
    [404.7, 0.4],
    [435.8, 1],
    [546.1, 1],
    [577.0, 0.25],
    [579.1, 0.25],
  ],
  // The sodium D doublet, 0.6 nm apart: far too close for this slit to split.
  sodium: [
    [589.0, 1],
    [589.6, 0.5],
  ],
} as const satisfies Record<string, readonly (readonly [number, number])[]>;
export type Source = keyof typeof SOURCES;

/** Glass to the index `glass_index` in src/wgsl/spectral.wgsl takes. */
export const GLASS_ID: Record<Glass, number> = { crown: 0, flint: 1, diamond: 2 };

export interface PrismSettings {
  glass: Glass;
  /** The prism's refracting angle, degrees. */
  apex: number;
  /** The prism turned from minimum deviation, degrees (positive: the beam meets it more steeply). */
  turn: number;
  /** Width of the slit, scene units (the prism's side is 1). */
  slit: number;
  source: Source;
  /** Extinction of the haze, per unit length. */
  haze: number;
  /** The slit's height, and so the band's; default SCENE.beamHeight. */
  beamHeight?: number;
}

/** The fixed parts of the scene. One unit is the prism's side: call it 5 cm. */
export const SCENE = {
  side: 1,
  /** Length of the prism's edges, standing upright on the floor (y = 0). */
  height: 1.1,
  /** The prism's centroid; the beam runs at its height. */
  centre: [0, 0.55, 0] as Vec3,
  /** The slit's height: the band on the wall is this tall. */
  beamHeight: 0.22,
  /** How far back along the beam the slit is. */
  slitDistance: 9,
  /** The back wall, the plane z = wallZ, facing +z. */
  wallZ: -2.5,
  /** The wall's diffuse albedo. */
  albedo: 0.8,
  /**
   * The direction a ray at the reference wavelength leaves at minimum deviation: 65° off the wall's
   * normal, so the band lands obliquely and is drawn out 2.4 times wider than it is across the beam.
   */
  heading: 65 * DEG,
  /** Minimum deviation is set for the sodium D line, the textbook's reference. */
  referenceNm: 589.3,
  /** Light in the beam, in the scene's units of power. */
  power: 0.45,
} as const;

/** The irradiance profile across the wall: TABLE texels from TABLE_X0 to TABLE_X1. */
export const TABLE_SIZE = 4096;
export const TABLE_X0 = -6;
export const TABLE_X1 = 10;
/** Wavelengths the continuous spectrum is traced at. */
export const SPECTRUM_SAMPLES = 96;
/** How many of them each haze beam stands for: 96 / 4 = 24 coloured beams in the fan. */
const HAZE_GROUP = 4;
/** Beams the shader draws in the haze, at most. */
export const MAX_BEAMS = 48;
/** Floats per beam: (origin xz, direction xz), (a0, a1, half width, inside glass), (rgb, unused). */
export const BEAM_FLOATS = 12;

type Rgb = [number, number, number];

/** The deviation at minimum deviation, radians; undefined when the light cannot get through. */
export function minimumDeviation(n: number, apex: number): number | undefined {
  const s = n * Math.sin(apex / 2);
  return s < 1 ? 2 * Math.asin(s) - apex : undefined;
}

/** A level direction at `angle` radians from -z towards +x. */
const heading = (angle: number): Vec3 => [Math.sin(angle), 0, -Math.cos(angle)];
/** The level direction a quarter turn on from `heading(angle)`. */
const across = (angle: number): Vec3 => [Math.cos(angle), 0, Math.sin(angle)];
const add = (a: Vec3, b: Vec3, s = 1): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dot = (a: readonly number[], b: readonly number[]) =>
  a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

export interface Layout {
  /** Deviation at minimum deviation for the reference wavelength, radians. */
  deviation: number;
  /** The beam's direction, and where its centre meets the first face with the prism unturned. */
  beamDir: Vec3;
  beamAcross: Vec3;
  entry: Vec3;
  /** The prism's base direction when unturned, as a heading angle. */
  baseAngle: number;
}

/**
 * The beam and the prism at minimum deviation for the reference wavelength. The beam is fixed by
 * that: it comes in at whatever angle sends the reference wavelength off at SCENE.heading. Turning
 * the prism (`turn`) leaves the beam where it is, as turning a real prism on its table does.
 */
export function layout(glass: Glass, apexDeg: number): Layout {
  const apex = apexDeg * DEG;
  const n = GLASSES[glass](SCENE.referenceNm);
  // Past total internal reflection there is no minimum: set the prism as if the glass were just
  // weak enough to let light through, so the scene stays put and the beam meets total reflection.
  const deviation =
    minimumDeviation(n, apex) ?? minimumDeviation(0.999 / Math.sin(apex / 2), apex)!;
  // At minimum deviation the ray inside runs parallel to the base, half the deviation from each.
  const baseAngle = SCENE.heading + deviation / 2;
  const beamAngle = SCENE.heading + deviation;
  const h = SCENE.side * Math.cos(apex / 2);
  // The beam crosses the prism at its centroid's height in the section: v = 0.
  const apexV = (2 * h) / 3;
  const u = -apexV * Math.tan(apex / 2);
  const entry = add(SCENE.centre, heading(baseAngle), u);
  return {
    deviation,
    beamDir: heading(beamAngle),
    beamAcross: across(beamAngle),
    entry,
    baseAngle,
  };
}

/** The prism's faces in the scene: its section's base along `baseAngle + turn`, edges vertical. */
export function worldPlanes(glass: Glass, apexDeg: number, turnDeg: number): Plane[] {
  const { baseAngle } = layout(glass, apexDeg);
  const angle = baseAngle + turnDeg * DEG;
  const eu = heading(angle);
  const ev = across(angle);
  // The section's u (base) and v (apex) axes to eu and ev; its edges (z) to y.
  return prismPlanes(apexDeg, SCENE.side, SCENE.height).map(([x, y, z, d]) => {
    const normal: Vec3 = [eu[0] * x + ev[0] * y, z, eu[2] * x + ev[2] * y];
    return [...normal, d + dot(normal, SCENE.centre)] as Plane;
  });
}

/** Wavelengths and the colour each adds: a flat spectrum's sums to white, a line lamp's to its colour. */
export function sourceSamples(source: Source): { nm: number; rgb: Rgb }[] {
  const lines = SOURCES[source];
  if (lines.length === 0) {
    return spectralSamples(SPECTRUM_SAMPLES).map((s) => ({ nm: s.nm, rgb: s.rgb }));
  }
  // Each line's share of the power, in the same units as the continuum: a flat spectrum's colour per
  // unit power is white, a line's is its own colour over the spectrum's mean.
  const white = spectralWhite();
  const total = lines.reduce((sum, [, power]) => sum + power, 0);
  return lines.map(([nm, power]) => {
    const rgb = spectralRgb(nm);
    return { nm, rgb: rgb.map((v, c) => (v * power) / total / white[c]!) as Rgb };
  });
}

interface Strip {
  bounces: number;
  /** The rays from either side of a slice of the sheet, and the share of the beam it carries. */
  a: { from: Vec3; dir: Vec3; weight: number };
  b: { from: Vec3; dir: Vec3; weight: number };
  share: number;
}

/** Slices of the sheet traced apart, so a prism that catches only part of the beam is right. */
const SLICES = 3;

/**
 * Every ray that leaves the prism from either side of each slice of the sheet, paired by how it
 * left. Light that misses the prism carries on as it was (`bounces` -2).
 */
function traceStrips(planes: readonly Plane[], lay: Layout, slit: number, n: number): Strip[] {
  const back = add(lay.entry, lay.beamDir, -3);
  const edges = Array.from({ length: SLICES + 1 }, (_, k) => {
    const o = add(back, lay.beamAcross, slit * (k / SLICES - 0.5));
    const rays = traceRays(planes, o, lay.beamDir, n, 6);
    return rays.length > 0 ? rays : [{ from: o, dir: lay.beamDir, weight: 1, bounces: -2 }];
  });
  const strips: Strip[] = [];
  for (let k = 0; k < SLICES; k++) {
    for (const a of edges[k]!) {
      const b = edges[k + 1]!.find((r) => r.bounces === a.bounces);
      if (b) strips.push({ bounces: a.bounces, a, b, share: 1 / SLICES });
    }
  }
  return strips;
}

/** Where a level ray from `from` along `dir` meets the wall, as x; undefined if it never does. */
function wallX(from: Vec3, dir: Vec3): { x: number; t: number } | undefined {
  if (dir[2] > -1e-6) return undefined;
  const t = (SCENE.wallZ - from[2]) / dir[2];
  return { x: from[0] + t * dir[0], t };
}

/** Where the centre of the beam lands on the wall at `nm`, having gone straight through. */
export function landing(settings: PrismSettings, nm: number): Vec3 | undefined {
  const lay = layout(settings.glass, settings.apex);
  const planes = worldPlanes(settings.glass, settings.apex, settings.turn);
  const ray = traceRays(
    planes,
    add(lay.entry, lay.beamDir, -3),
    lay.beamDir,
    GLASSES[settings.glass](nm),
    6,
  ).find((r) => r.bounces === 0);
  if (!ray) return undefined;
  const hit = wallX(ray.from, ray.dir);
  return hit && [hit.x, SCENE.centre[1], SCENE.wallZ];
}

export interface PrismState {
  planes: Plane[];
  layout: Layout;
  /** Irradiance per unit height across the wall, RGBA per texel (power per unit length). */
  table: Float32Array;
  /** The beams in the haze, BEAM_FLOATS each. */
  beams: Float32Array;
  beamCount: number;
  /** All the light that reaches the wall, and its centroid there: the room's bounce light. */
  wallPower: Rgb;
  wallCentroid: Vec3;
}

/** Traces the scene: the light on the wall and the beams in the haze. */
export function tracePrism(settings: PrismSettings): PrismState {
  const lay = layout(settings.glass, settings.apex);
  const planes = worldPlanes(settings.glass, settings.apex, settings.turn);
  const index = GLASSES[settings.glass];
  const samples = sourceSamples(settings.source);
  const table = new Float32Array(TABLE_SIZE * 4);
  const dx = (TABLE_X1 - TABLE_X0) / TABLE_SIZE;
  const wallPower: Rgb = [0, 0, 0];
  let centroid = 0;
  let centroidWeight = 0;

  /** Spreads `rgb` power evenly over the wall from x0 to x1 (box-filtered into texels). */
  const deposit = (x0: number, x1: number, rgb: Rgb) => {
    const lo = Math.min(x0, x1);
    const hi = Math.max(x0, x1, lo + 1e-6);
    for (let c = 0; c < 3; c++) wallPower[c]! += rgb[c]!;
    const luma = rgb[0] + rgb[1] + rgb[2];
    centroid += ((lo + hi) / 2) * luma;
    centroidWeight += luma;
    const first = Math.max(0, Math.floor((lo - TABLE_X0) / dx));
    const last = Math.min(TABLE_SIZE - 1, Math.floor((hi - TABLE_X0) / dx));
    for (let i = first; i <= last; i++) {
      const left = TABLE_X0 + i * dx;
      const share = (Math.min(hi, left + dx) - Math.max(lo, left)) / (hi - lo);
      // Power per unit length along the wall.
      for (let c = 0; c < 3; c++) table[i * 4 + c]! += (rgb[c]! * share) / dx;
    }
  };

  const beams = new Float32Array(MAX_BEAMS * BEAM_FLOATS);
  let beamCount = 0;
  const area = (width: number) => Math.max(width, 1e-4) * (settings.beamHeight ?? SCENE.beamHeight);
  /** A strip of light in the haze: from `origin` along `dir`, a0 to a1 of its length. */
  const pushBeam = (
    origin: Vec3,
    dir: Vec3,
    a0: number,
    a1: number,
    width: number,
    rgb: Rgb,
    inside = false,
  ) => {
    if (beamCount >= MAX_BEAMS) return;
    const len = Math.hypot(dir[0], dir[2]);
    const irradiance = rgb.map((v) => v / area(width));
    beams.set(
      [
        origin[0],
        origin[2],
        dir[0] / len,
        dir[2] / len,
        a0,
        a1,
        width / 2,
        inside ? 1 : 0,
        ...irradiance,
        0,
      ],
      beamCount * BEAM_FLOATS,
    );
    beamCount++;
  };

  // The beam coming in, from the slit to the first face; and its share reflected off it.
  const white: Rgb = [0, 0, 0];
  for (const s of samples) for (let c = 0; c < 3; c++) white[c]! += s.rgb[c]! * SCENE.power;
  // The slit is SCENE.slitDistance back along the beam, or in the back wall if that is nearer.
  const toWall =
    lay.beamDir[2] > 1e-6 ? (lay.entry[2] - SCENE.wallZ) / lay.beamDir[2] : SCENE.slitDistance;
  const slitAt = Math.min(SCENE.slitDistance, toWall);
  pushBeam(lay.entry, lay.beamDir, -slitAt, settings.slit * 1.5, settings.slit, white);

  // Haze beams gather a few neighbouring wavelengths each (line lamps: one line each).
  const group = samples.length > 8 ? HAZE_GROUP : 1;
  interface Gathered {
    points: Vec3[];
    dir: Vec3;
    rgb: Rgb;
    reach: number;
    n: number;
    bounces: number;
  }
  const gathered = new Map<string, Gathered>();
  const inside: Vec3[] = [];
  const reference = samples.reduce((best, s) =>
    Math.abs(s.nm - SCENE.referenceNm) < Math.abs(best.nm - SCENE.referenceNm) ? s : best,
  );

  samples.forEach((sample, i) => {
    const n = index(sample.nm);
    for (const strip of traceStrips(planes, lay, settings.slit, n)) {
      const weight = ((strip.a.weight + strip.b.weight) / 2) * strip.share;
      const ha = wallX(strip.a.from, strip.a.dir);
      const hb = wallX(strip.b.from, strip.b.dir);
      const reach = ha && hb ? (ha.t + hb.t) / 2 : 30;
      // Haze takes its toll on the way to the wall (the beam's power is given where it meets the prism).
      const kept = weight * Math.exp(-settings.haze * Math.min(reach, 30));
      const rgb = sample.rgb.map((v) => v * SCENE.power * kept) as Rgb;
      if (ha && hb) deposit(ha.x, hb.x, rgb);

      if (strip.bounces === 0 && sample === reference) inside.push(strip.a.from, strip.b.from);
      // The haze: everything straight through, the front reflection and any light that missed the
      // prism, plus the first light out after one reflection inside; fainter light is left to the wall.
      if (strip.bounces > 1) continue;
      const bin = strip.bounces === 0 ? Math.floor(i / group) : Math.floor(i / (group * 5));
      const key = `${strip.bounces}:${strip.bounces < 0 ? 0 : bin}`;
      const haze = sample.rgb.map((v) => v * SCENE.power * weight) as Rgb;
      const g = gathered.get(key);
      if (!g) {
        gathered.set(key, {
          points: [strip.a.from, strip.b.from],
          dir: add(strip.a.dir, strip.b.dir),
          rgb: haze,
          reach,
          n: 1,
          bounces: strip.bounces,
        });
      } else {
        g.points.push(strip.a.from, strip.b.from);
        g.dir = add(g.dir, add(strip.a.dir, strip.b.dir));
        g.reach += reach;
        for (let c = 0; c < 3; c++) g.rgb[c]! += haze[c]!;
        g.n++;
      }
    }
  });

  // The light inside the glass, entry to exit, for the glass's own faint scatter.
  if (inside.length > 0) {
    const exit = inside.reduce((sum, p) => add(sum, p, 1 / inside.length), [0, 0, 0] as Vec3);
    const path = add(exit, lay.entry, -1);
    const len = Math.hypot(path[0], path[2]);
    pushBeam(lay.entry, path, 0, len, settings.slit, white, true);
  }
  for (const g of gathered.values()) {
    // The strip's width across its direction, and its middle, from where its rays set out.
    const side: Vec3 = [-g.dir[2], 0, g.dir[0]];
    const sideLen = Math.hypot(side[0], side[2]);
    const lateral = g.points.map((p) => dot(p, side) / sideLen);
    const lo = Math.min(...lateral);
    const hi = Math.max(...lateral);
    const width = Math.max(hi - lo, 1e-4);
    const mean = g.points.reduce((sum, p) => add(sum, p, 1 / g.points.length), [0, 0, 0] as Vec3);
    const from = add(mean, side, ((lo + hi) / 2 - dot(mean, side) / sideLen) / sideLen);
    // Light that missed the prism set out from 3 units before it: start it at the prism.
    const a0 = g.bounces === -2 ? 3 : -width * 1.5;
    pushBeam(from, g.dir, a0, g.reach / g.n + width * 2, width, g.rgb);
  }

  const centre = centroidWeight > 0 ? centroid / centroidWeight : 0;
  return {
    planes,
    layout: lay,
    table,
    beams,
    beamCount,
    wallPower,
    wallCentroid: [centre, SCENE.centre[1], SCENE.wallZ],
  };
}

// ---- The camera -------------------------------------------------------------------------------

export interface Camera {
  eye: Vec3;
  forward: Vec3;
  right: Vec3;
  up: Vec3;
  /** Tangents of half the field of view across and up. */
  tanX: number;
  tanY: number;
}

/** Standing in front of the prism, above it, looking down past it at the band on the wall. */
export const EYE: Vec3 = [1.6, 2.3, 4.8];
export const TARGET: Vec3 = [1.9, 0.4, -1.0];
/** Horizontal field of view on a wide canvas, with room for the beam coming in on the left. */
const TAN_X = Math.tan(32 * DEG);
/**
 * Below MIN_ASPECT the view keeps its width and grows taller; on its way to a phone (NARROW_ASPECT)
 * it gives up the incoming beam's room, narrowing to just the prism and the band and turning to
 * centre them, so they stay as large as they can.
 */
const MIN_ASPECT = 1.4;
const NARROW_ASPECT = 0.5;
const TAN_X_NARROW = Math.tan(29 * DEG);
const TARGET_NARROW: Vec3 = [2.15, 0.45, -1.0];

const normalize = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/**
 * An orbit of the view about the point it looks at: `yaw` round the vertical and `pitch` up or down,
 * both in degrees from the standing view, and `distance` as a share of the standing distance. All
 * zero (one for distance) is the standing view. The camera stays above the table and in front of
 * the wall: yaw within ±60°, the eye between 8° and 80° above the target, distance 0.35 to 1.6.
 *
 * `look` slides the point the view turns about from the room towards `aim` (0 the room, 1 the aim),
 * carrying the eye with it: with the band on the wall as the aim, a shorter distance then comes
 * closer to the band instead of cropping it out of the frame.
 */
export interface Orbit {
  yaw: number;
  pitch: number;
  distance: number;
  look?: number;
  aim?: Vec3;
}

export const STANDING: Orbit = { yaw: 0, pitch: 0, distance: 1 };

/** The eye, orbiting `target`; `standing` is the point the standing view turns about. */
function orbitEye(target: Vec3, standing: Vec3, orbit: Orbit): Vec3 {
  const offset = add(EYE, standing, -1);
  if (orbit.yaw === 0 && orbit.pitch === 0 && orbit.distance === 1) return add(target, offset);
  const r = Math.hypot(...offset);
  const yaw = Math.atan2(offset[0], offset[2]) + Math.max(-60, Math.min(60, orbit.yaw)) * DEG;
  const pitch = Math.max(8 * DEG, Math.min(80 * DEG, Math.asin(offset[1] / r) + orbit.pitch * DEG));
  const d = r * Math.max(0.35, Math.min(1.6, orbit.distance));
  return add(target, [
    d * Math.cos(pitch) * Math.sin(yaw),
    d * Math.sin(pitch),
    d * Math.cos(pitch) * Math.cos(yaw),
  ]);
}

export function camera(width: number, height: number, orbit: Orbit = STANDING): Camera {
  const aspect = width / height;
  const narrow = Math.min(Math.max((MIN_ASPECT - aspect) / (MIN_ASPECT - NARROW_ASPECT), 0), 1);
  const standing = add(TARGET, add(TARGET_NARROW, TARGET, -1), narrow);
  const look = orbit.aim ? Math.max(0, Math.min(1, orbit.look ?? 0)) : 0;
  const target = orbit.aim ? add(standing, add(orbit.aim, standing, -1), look) : standing;
  const eye = orbitEye(target, standing, orbit);
  const forward = normalize(add(target, eye, -1));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const tanX = TAN_X + (TAN_X_NARROW - TAN_X) * narrow;
  return { eye, forward, right, up, tanX, tanY: tanX / aspect };
}

/** Where a point in the scene lands on the canvas, in pixels from the top left. */
export function project(cam: Camera, p: Vec3, width: number, height: number): [number, number] {
  const v = add(p, cam.eye, -1);
  const z = dot(v, cam.forward);
  const x = dot(v, cam.right) / (z * cam.tanX);
  const y = dot(v, cam.up) / (z * cam.tanY);
  return [((1 + x) / 2) * width, ((1 - y) / 2) * height];
}

/** The point on the wall seen at pixel (px, py). */
export function unprojectToWall(
  cam: Camera,
  px: number,
  py: number,
  width: number,
  height: number,
): Vec3 {
  const x = (2 * px) / width - 1;
  const y = 1 - (2 * py) / height;
  const d = add(add(cam.forward, cam.right, x * cam.tanX), cam.up, y * cam.tanY);
  const t = (SCENE.wallZ - cam.eye[2]) / d[2];
  return add(cam.eye, d, t);
}
