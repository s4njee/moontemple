/*
 * The lunar corona (story 5.2): the coloured rings round a moon seen through a thin cloud of water
 * droplets. Each droplet diffracts the moonlight like a circular hole of the same radius (Babinet),
 * into the Airy pattern
 *
 *   I(theta) ~ [2 J1(x) / x]^2,   x = k a sin(theta),   k = 2 pi / lambda
 *
 * whose dark rings fall where J1 is zero, x = 3.83, 7.02, 10.17, ...: sin(theta) = 0.61 lambda / a
 * for the first. Red light, with the longest wavelength, spreads widest, so each ring is blue on
 * the inside and red on the outside, and summed over the spectrum the pattern is a white aureole
 * with a brownish-red edge, then rings of blue-green and red. Bigger droplets make smaller rings.
 *
 * A real cloud has a spread of droplet sizes. Each size draws its rings at its own radius, so a
 * narrow spread keeps them sharp and a wide one averages them into a plain aureole: summing the
 * pattern over a Gaussian spread of radius (weighted by each droplet's cross-section, a^2) is the
 * whole model. It is evaluated on the CPU into a table of RGB against angle, blurred by the moon's
 * own disc, and the shader only looks it up.
 *
 * As a phase function, per steradian: a droplet much larger than the wavelength diffracts half of
 * the light it removes (the other half it refracts and reflects, into a broad forward lobe), into
 *
 *   p(theta) = (k a)^2 / (4 pi) [2 J1(x) / x]^2
 *
 * which integrates to one over the sphere, since the integral of [2 J1(x) / x]^2 x dx is 2.
 */

import { createProfile, profileAngle, smoothProfile, type AngularProfile } from './profile.ts';
import { spectralSamples } from './spectral.ts';

/**
 * The Bessel function J1, by the rational approximations of Numerical Recipes (`bessj1`, after
 * Hart et al.), absolute error below 1e-8.
 */
export function besselJ1(x: number): number {
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    const a =
      x *
      (72362614232.0 +
        y *
          (-7895059235.0 +
            y * (242396853.1 + y * (-2972611.439 + y * (15704.4826 + y * -30.16036606)))));
    const b =
      144725228442.0 +
      y * (2300535178.0 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))));
    return a / b;
  }
  const z = 8 / ax;
  const y = z * z;
  const xx = ax - 2.356194491;
  const a =
    1 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6)));
  const b =
    0.04687499995 +
    y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
  const value = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * a - z * Math.sin(xx) * b);
  return x < 0 ? -value : value;
}

/** The Airy pattern [2 J1(x) / x]^2: 1 at the centre, first zero at x = 3.8317. */
export function airy(x: number): number {
  if (Math.abs(x) < 1e-4) return 1;
  const v = (2 * besselJ1(x)) / x;
  return v * v;
}

/**
 * Light a droplet of radius `radiusUm` micrometres diffracts at `theta` radians, wavelength `nm`,
 * per steradian, as a share of the light it diffracts in all: (k a)^2 / 4 pi [2 J1(x) / x]^2.
 */
export function diffractionPhase(theta: number, radiusUm: number, nm: number): number {
  const ka = (2 * Math.PI * radiusUm * 1000) / nm;
  return ((ka * ka) / (4 * Math.PI)) * airy(ka * Math.sin(theta));
}

export interface CoronaOptions {
  /** Mean droplet radius, micrometres. */
  radius: number;
  /** Standard deviation of the radius as a share of the mean: 0.05 sharp rings, 0.35 an aureole. */
  spread: number;
  /** Angular radius of the source, radians, which blurs the rings (the moon: 0.00452). */
  source?: number;
  /** Largest angle in the table, radians. Default 24 degrees. */
  maxAngle?: number;
  /** Entries in the table. Default 1024. */
  size?: number;
  /** Wavelengths summed. Default 32. */
  wavelengths?: number;
}

/** The droplet radii and their weights: a Gaussian spread, each weighted by its cross-section. */
export function dropletSizes(
  radius: number,
  spread: number,
  maxAngle: number,
): { radius: number; weight: number }[] {
  const sigma = Math.max(0, spread) * radius;
  if (sigma < 1e-3 * radius) return [{ radius, weight: 1 }];
  // Neighbouring radii must be close enough that their rings blend at the widest angle drawn
  // (their phase x = k a theta differs by under ~pi / 2 at 400 nm), or they leave false rings.
  const k = (2 * Math.PI) / 0.4;
  const step = Math.PI / 2 / (k * maxAngle);
  const lo = Math.max(0.15 * radius, radius - 2.5 * sigma);
  const hi = radius + 2.5 * sigma;
  const count = Math.min(160, Math.max(9, Math.ceil((hi - lo) / step)));
  const sizes = Array.from({ length: count }, (_, i) => {
    const a = lo + ((hi - lo) * (i + 0.5)) / count;
    const z = (a - radius) / sigma;
    return { radius: a, weight: Math.exp(-0.5 * z * z) * a * a };
  });
  const total = sizes.reduce((sum, s) => sum + s.weight, 0);
  for (const s of sizes) s.weight /= total;
  return sizes;
}

/**
 * The corona's phase function in linear RGB per steradian against angle from the moon: the share
 * of the light the droplets diffract that goes into each steradian, coloured by the spectrum, with
 * an equal-energy white source (scale by the moon's colour). Blurred by the source's disc.
 */
export function coronaProfile(options: CoronaOptions): AngularProfile {
  const maxAngle = options.maxAngle ?? (24 * Math.PI) / 180;
  const size = options.size ?? 1024;
  const spectrum = spectralSamples(options.wavelengths ?? 32);
  const sizes = dropletSizes(options.radius, options.spread, maxAngle);
  const profile = createProfile(0, maxAngle, size);
  for (let i = 0; i < size; i++) {
    const s = Math.sin(profileAngle(profile, i));
    let r = 0;
    let g = 0;
    let b = 0;
    for (const { nm, rgb } of spectrum) {
      let sum = 0;
      for (const drop of sizes) {
        const ka = (2 * Math.PI * drop.radius * 1000) / nm;
        sum += drop.weight * ka * ka * airy(ka * s);
      }
      sum /= 4 * Math.PI;
      r += rgb[0] * sum;
      g += rgb[1] * sum;
      b += rgb[2] * sum;
    }
    profile.data[i * 4] = r;
    profile.data[i * 4 + 1] = g;
    profile.data[i * 4 + 2] = b;
  }
  const source = options.source ?? 0;
  return source > 0 ? smoothProfile(profile, source, 0.25 * source) : profile;
}
