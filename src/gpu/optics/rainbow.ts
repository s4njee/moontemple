/*
 * The moonbow (story 5.7): the rainbow by moonlight, the light of spray drops, scattered back
 * towards the side the moon is on, by geometric optics.
 *
 * A ray hitting a drop at incidence i refracts to r, sin r = sin i / n, and leaves after p - 1
 * reflections inside, turned through D_p = 2 (i - r) + (p - 1)(pi - 2 r) (D_0 = pi - 2 i for the
 * light reflected off the outside). For p = 2 the turn has a minimum as i varies (Descartes' ray, at
 * cos^2 i = (n^2 - 1) / 3), so the light of every drop piles up there: the primary bow, 42 degrees
 * from the point opposite the moon, and the sky inside it is lit by the rest of the rays. For p = 3
 * the turn has a maximum, at cos^2 i = (n^2 - 1) / 8: the secondary bow, at 51 degrees, its colours
 * the other way round, and between them Alexander's dark band, which neither reaches. Water's index
 * is larger for blue, so blue's bow is smaller: red outside on the primary.
 *
 * By day it is coloured; by moonlight it is the same light, a few hundred thousand times dimmer, too
 * dim for the eye's cones, so it is seen nearly white (a long exposure shows the colours).
 *
 * The profile here is the drop's whole phase function in the back half of the sky: rays traced over
 * the drop's face for p = 0 to 3 with Fresnel's coefficients for each polarisation, into a histogram
 * against angle from the antilunar point, blurred by the moon's disc and a little more for the
 * spread a real drop's wave optics gives (Airy's theory, not modelled: no supernumerary bows, which
 * spray drops of a millimetre are too big to show anyway).
 */

import {
  createProfile,
  deposit,
  perSteradian,
  smoothProfile,
  type AngularProfile,
} from './profile.ts';
import { spectralSamples, waterIndex } from './spectral.ts';

const DEG = Math.PI / 180;

/** The turn of a ray after p - 1 internal reflections at incidence `i`, radians. */
export function deviation(p: number, i: number, n: number): number {
  if (p === 0) return Math.PI - 2 * i;
  const r = Math.asin(Math.sin(i) / n);
  return 2 * (i - r) + (p - 1) * (Math.PI - 2 * r);
}

/** The angle from the antilunar point of light turned through `d` radians. */
export function fromAntisolar(d: number): number {
  return Math.PI - Math.acos(Math.cos(d));
}

/**
 * Descartes' ray for `p` - 1 internal reflections (p = 2 primary, 3 secondary): the bow's radius
 * round the antilunar point, radians.
 */
export function bowRadius(p: 2 | 3, n: number): number {
  const k = p * p - 1;
  const i = Math.acos(Math.sqrt((n * n - 1) / k));
  return fromAntisolar(deviation(p, i, n));
}

/** Fresnel reflectance for s and p polarisation going from index 1 into `n` at incidence `i`. */
function reflectance(i: number, n: number): [number, number] {
  const ci = Math.cos(i);
  const ct = Math.sqrt(Math.max(0, 1 - (Math.sin(i) / n) ** 2));
  const rs = (ci - n * ct) / (ci + n * ct);
  const rp = (n * ci - ct) / (n * ci + ct);
  return [rs * rs, rp * rp];
}

/** The share of a ray's light that leaves after p - 1 internal reflections, unpolarised. */
export function pathShare(p: number, i: number, n: number): number {
  const [rs, rp] = reflectance(i, n);
  if (p === 0) return 0.5 * (rs + rp);
  const share = (r: number) => (1 - r) * (1 - r) * Math.pow(r, p - 1);
  return 0.5 * (share(rs) + share(rp));
}

export interface RainbowOptions {
  /** Angular radius of the source, radians (the moon: 0.00452). */
  source?: number;
  /** Extra blur, radians, for the wave optics of drops about a millimetre across. 0.15 degrees. */
  blur?: number;
  /** Rays across the drop's face, per wavelength. Default 6000. */
  rays?: number;
  wavelengths?: number;
  /** Table range and size: default 0 to 90 degrees from the antilunar point, 2048 entries. */
  maxAngle?: number;
  size?: number;
}

/**
 * The geometric phase function of water drops, p = 0 to 3, in linear RGB per steradian against the
 * angle from the antilunar point, per unit of light the drops' faces intercept.
 */
export function rainbowProfile(options: RainbowOptions = {}): AngularProfile {
  const rays = options.rays ?? 6000;
  const spectrum = spectralSamples(options.wavelengths ?? 24);
  const profile = createProfile(0, options.maxAngle ?? 90 * DEG, options.size ?? 2048);
  for (const { nm, rgb } of spectrum) {
    const n = waterIndex(nm);
    for (let k = 0; k < rays; k++) {
      // Evenly over the drop's face: the impact parameter b = sin i, b^2 uniform.
      const b = Math.sqrt((k + 0.5) / rays);
      const i = Math.asin(b);
      for (let p = 0; p <= 3; p++) {
        const w = pathShare(p, i, n) / rays;
        const angle = fromAntisolar(deviation(p, i, n));
        deposit(profile, angle, w * rgb[0], w * rgb[1], w * rgb[2]);
      }
    }
  }
  const smoothed = smoothProfile(profile, options.source ?? 0, options.blur ?? 0.15 * DEG);
  return perSteradian(smoothed);
}
