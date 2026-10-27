/*
 * The 22-degree halo and moon dogs (story 5.3): moonlight refracted through hexagonal ice crystals,
 * in at one side face and out at the next but one, which makes a 60-degree prism.
 *
 * A prism of apex A deviates light least, by D_min = 2 asin(n sin(A / 2)) - A, when the ray passes
 * through it symmetrically, and every other path deviates it more. Near the minimum the deviation
 * hardly changes as the crystal turns, so the light of many crystals piles up there: a bright inner
 * edge, nothing inside it, and a tail fading outwards. Ice's index n is about 1.31, slightly larger
 * for blue than for red, so the minimum is 21.6 degrees for red and 22.4 for blue: the inner edge
 * is red, and further out the colours overlap back into white.
 *
 * Columns tumbling at random make the halo, a full ring. Plates float with their faces level, so
 * they refract only in the horizontal plane, and only to the left and right of the moon: the moon
 * dogs. A ray climbing at elevation h through a vertical prism behaves, in plan, like one through a
 * prism of larger index n' = sqrt(n^2 - sin^2 h) / cos h (Bravais), so the dogs move out from the
 * halo as the moon rises, and fade out above about 61 degrees, where n' sin 30 reaches one.
 *
 * Both profiles are traced here rather than written down: a fine even grid of crystal orientations,
 * each crystal's side faces lit by the moon, refracted in and out by Snell's law with Fresnel
 * losses, with the share of each entry face that reaches the exit face worked out from the hexagon.
 * The deviations land in a histogram against angle, blurred by the moon's disc and by diffraction
 * at the crystals' size (src/gpu/optics/profile.ts). No crystal faces other than the six sides are
 * traced: no basal faces (the 46-degree halo, the parhelic circle), no reflections, long columns.
 */

import {
  createProfile,
  deposit,
  perSteradian,
  smoothProfile,
  type AngularProfile,
} from './profile.ts';
import { iceIndex, spectralSamples } from './spectral.ts';

type Vec3 = [number, number, number];

const DEG = Math.PI / 180;

/** The least deviation of a prism of apex `apex` (radians) and index `n`, radians. */
export function minimumDeviation(n: number, apex = 60 * DEG): number {
  return 2 * Math.asin(Math.min(1, n * Math.sin(apex / 2))) - apex;
}

/** Bravais' index: the index a ray climbing at `elevation` sees in plan through a vertical prism. */
export function bravaisIndex(n: number, elevation: number): number {
  const s = Math.sin(elevation);
  return Math.sqrt(n * n - s * s) / Math.cos(elevation);
}

/**
 * How far round from the moon a moon dog's inner edge is, in azimuth, radians, for a moon at
 * `elevation`; NaN where there is none (above about 61 degrees).
 */
export function moonDogAzimuth(n: number, elevation: number): number {
  const index = bravaisIndex(n, elevation);
  return index * Math.sin(30 * DEG) >= 1 ? NaN : minimumDeviation(index);
}

/** The angle on the sky between the moon and its dog's inner edge, radians. */
export function moonDogDistance(n: number, elevation: number): number {
  const az = moonDogAzimuth(n, elevation);
  const s = Math.sin(elevation);
  const c = Math.cos(elevation);
  return Math.acos(Math.min(1, s * s + c * c * Math.cos(az)));
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Refracts unit `incident` at a surface of unit normal `normal` facing against it, index ratio
 * `eta` = n1 / n2; undefined on total internal reflection. Also returns the cosines either side.
 */
function refract(
  incident: Vec3,
  normal: Vec3,
  eta: number,
): { dir: Vec3; cosIn: number; cosOut: number } | undefined {
  const cosIn = -dot(normal, incident);
  const k = 1 - eta * eta * (1 - cosIn * cosIn);
  if (k < 0) return undefined;
  const cosOut = Math.sqrt(k);
  const f = eta * cosIn - cosOut;
  return {
    dir: [
      eta * incident[0] + f * normal[0],
      eta * incident[1] + f * normal[1],
      eta * incident[2] + f * normal[2],
    ],
    cosIn,
    cosOut,
  };
}

/** Unpolarised Fresnel transmittance between indices n1 and n2 at the given cosines. */
export function fresnelTransmittance(n1: number, n2: number, cosIn: number, cosOut: number) {
  const rs = (n1 * cosIn - n2 * cosOut) / (n1 * cosIn + n2 * cosOut);
  const rp = (n2 * cosIn - n1 * cosOut) / (n2 * cosIn + n1 * cosOut);
  return 1 - 0.5 * (rs * rs + rp * rp);
}

export interface PrismRay {
  /** Direction the light leaves in. */
  out: Vec3;
  /** Projected area of the entry face, times the share that reaches the exit face, times Fresnel. */
  weight: number;
}

/**
 * Traces light travelling along unit `d` into a hexagonal crystal whose c-axis is e1 x e2 (`e1`,
 * `e2` unit and square to each other, across the axis), its first face normal at angle `psi` from
 * `e1`. Calls `emit` for each path in at a side face and out at the next but one (a 60-degree
 * prism). Also returns the projected area of the lit side faces (hexagon of unit side, unit length),
 * the light the crystal's sides intercept.
 */
export function traceSideFaces(
  d: Vec3,
  e1: Vec3,
  e2: Vec3,
  psi: number,
  n: number,
  emit: (ray: PrismRay) => void,
): number {
  const normals: Vec3[] = [];
  const corners: [number, number][] = [];
  for (let k = 0; k < 6; k++) {
    const a = psi + k * 60 * DEG;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    normals.push([ca * e1[0] + sa * e2[0], ca * e1[1] + sa * e2[1], ca * e1[2] + sa * e2[2]]);
    // The corner after face k, in the (e1, e2) plane, on the circle through the corners (radius 1).
    corners.push([Math.cos(a + 30 * DEG), Math.sin(a + 30 * DEG)]);
  }
  // A side face of a hexagon with unit sides is 1 wide; the column is 1 long.
  let intercepted = 0;
  for (let k = 0; k < 6; k++) {
    const nk = normals[k]!;
    const facing = -dot(d, nk);
    if (facing <= 0) continue;
    intercepted += facing;
    const inside = refract(d, nk, 1 / n);
    if (!inside) continue;
    const tIn = fresnelTransmittance(1, n, inside.cosIn, inside.cosOut);
    const t = inside.dir;
    // Where the refracted beam goes, seen down the axis: across the hexagon along u. Each far face
    // takes the part of the entry face's width (measured across u) that its own width covers.
    const u = [dot(t, e1), dot(t, e2)] as const;
    const w = (p: readonly [number, number]) => -u[1] * p[0] + u[0] * p[1];
    const from = corners[(k + 5) % 6]!;
    const to = corners[k]!;
    const lo = Math.min(w(from), w(to));
    const hi = Math.max(w(from), w(to));
    if (hi - lo < 1e-9) continue;
    for (const j of [(k + 2) % 6, (k + 4) % 6]) {
      const nj = normals[j]!;
      if (dot(t, nj) <= 0) continue;
      const a = w(corners[(j + 5) % 6]!);
      const b = w(corners[j]!);
      const share = Math.max(0, Math.min(hi, Math.max(a, b)) - Math.max(lo, Math.min(a, b)));
      if (share <= 0) continue;
      const outside = refract(t, [-nj[0], -nj[1], -nj[2]], n);
      if (!outside) continue;
      const tOut = fresnelTransmittance(n, 1, outside.cosIn, outside.cosOut);
      emit({ out: outside.dir, weight: (facing * tIn * tOut * share) / (hi - lo) });
    }
  }
  return intercepted;
}

export interface HaloOptions {
  /** Angular radius of the source, radians (the moon: 0.00452). */
  source?: number;
  /** Extra blur, radians: diffraction at the crystals' size, about lambda / D. Default 0.25 degrees. */
  blur?: number;
  /** Steps across the tilt of the axis and round it. Defaults 120 and 72 (within 0.5% of 400 by 240). */
  tilts?: number;
  turns?: number;
  /** Wavelengths traced. Default 16. */
  wavelengths?: number;
  /** Table range and size. Default 0 to 64 degrees, 2048 entries. */
  maxAngle?: number;
  size?: number;
}

/**
 * The 22-degree halo of columns tumbling at random, in linear RGB per steradian against angle from
 * the moon, as a share of the light the columns' side faces intercept: its integral over the sky is
 * the share that goes round the 60-degree path (`haloShare`).
 */
export function haloProfile(options: HaloOptions = {}): AngularProfile {
  const tilts = options.tilts ?? 120;
  const turns = options.turns ?? 72;
  const spectrum = spectralSamples(options.wavelengths ?? 16);
  const profile = createProfile(0, options.maxAngle ?? 64 * DEG, options.size ?? 2048);
  const d: Vec3 = [0, 0, 1];
  let intercepted = 0;
  for (const { nm, rgb } of spectrum) {
    const n = iceIndex(nm);
    for (let i = 0; i < tilts; i++) {
      // The axis at a uniformly random cosine to the ray: random orientation in space. By symmetry
      // only the tilt and the turn about the axis matter, and the turn only over 60 degrees.
      const mu = (i + 0.5) / tilts;
      const s = Math.sqrt(1 - mu * mu);
      // The axis is (s, 0, mu).
      const e1: Vec3 = [mu, 0, -s];
      const e2: Vec3 = [0, 1, 0];
      for (let j = 0; j < turns; j++) {
        const psi = ((j + 0.5) / turns) * 60 * DEG;
        intercepted += traceSideFaces(d, e1, e2, psi, n, ({ out, weight }) => {
          const angle = Math.acos(Math.min(1, Math.max(-1, dot(out, d))));
          deposit(profile, angle, weight * rgb[0], weight * rgb[1], weight * rgb[2]);
        });
      }
    }
  }
  // `intercepted` summed every wavelength; each wavelength's share is weighted by its colour.
  const perWavelength = intercepted / spectrum.length;
  for (let i = 0; i < profile.data.length; i++) profile.data[i] = profile.data[i]! / perWavelength;
  const source = options.source ?? 0;
  const smoothed = smoothProfile(profile, source, options.blur ?? 0.25 * DEG);
  return perSteradian(smoothed);
}

export interface MoonDogOptions extends Omit<HaloOptions, 'tilts' | 'turns'> {
  /** The moon's elevation, radians. */
  elevation: number;
  /** Steps round the axis. Default 3000. */
  turns?: number;
}

/**
 * One moon dog of level plates, in linear RGB per radian of azimuth against azimuth from the moon,
 * at the moon's elevation, as a share of the light the plates' side faces intercept. The other dog
 * is its mirror image. Blurred in azimuth by the moon's disc and the crystals' diffraction, both
 * widened by 1 / cos(elevation), since a degree on the sky is more than a degree of azimuth there.
 */
export function moonDogProfile(options: MoonDogOptions): AngularProfile {
  const turns = options.turns ?? 3000;
  const spectrum = spectralSamples(options.wavelengths ?? 16);
  const profile = createProfile(0, options.maxAngle ?? 64 * DEG, options.size ?? 2048);
  const h = options.elevation;
  // Light from the moon, ahead (+z) and up at h, travelling towards us; plates' axes vertical.
  const d: Vec3 = [0, -Math.sin(h), -Math.cos(h)];
  const e1: Vec3 = [1, 0, 0];
  const e2: Vec3 = [0, 0, -1];
  let intercepted = 0;
  for (const { nm, rgb } of spectrum) {
    const n = iceIndex(nm);
    for (let j = 0; j < turns; j++) {
      const psi = ((j + 0.5) / turns) * 60 * DEG;
      intercepted += traceSideFaces(d, e1, e2, psi, n, ({ out, weight }) => {
        // Seen from where the light comes from: the opposite of its direction of travel.
        const az = Math.abs(Math.atan2(-out[0], -out[2]));
        // Half to each dog: count the light at |az| once, as one dog's.
        deposit(profile, az, weight * rgb[0], weight * rgb[1], weight * rgb[2]);
      });
    }
  }
  const perWavelength = intercepted / spectrum.length;
  // Both dogs together carry the traced share; one dog half of it.
  for (let i = 0; i < profile.data.length; i++) {
    profile.data[i] = profile.data[i]! / perWavelength / 2;
  }
  const widen = 1 / Math.max(Math.cos(h), 0.05);
  return smoothProfile(
    profile,
    (options.source ?? 0) * widen,
    (options.blur ?? 0.25 * DEG) * widen,
  );
}
