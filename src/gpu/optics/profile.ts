/*
 * Angular colour profiles (Epic 5): the light a cloud of droplets or crystals sends towards the eye,
 * as linear RGB per steradian against the angle from the moon (or from the point opposite it), on
 * an even grid. The corona, halo and moonbow each build one on the CPU when their settings change,
 * from the physics in corona.ts, halo.ts and rainbow.ts, and upload it as a row of an rgba32float
 * texture; the fragment shader only looks it up (src/wgsl/profile.wgsl, the twin of `profileAt`).
 *
 * A ray-traced profile starts as a histogram: each traced ray drops its weight into the two
 * nearest entries (`deposit`), which gives light per radian of angle. `smoothProfile` then blurs it
 * by the moon's own disc, so the sharp caustic of a halo's or a bow's edge comes out as wide as the
 * moon makes it, and `perSteradian` turns light per radian into light per steradian, the units a
 * phase function has.
 */

export interface AngularProfile {
  /** Angles of the first and last entries, radians. */
  readonly min: number;
  readonly max: number;
  readonly size: number;
  /** Linear RGB, four floats an entry (the fourth unused): one row of an rgba32float texture. */
  readonly data: Float32Array;
}

export function createProfile(min: number, max: number, size: number): AngularProfile {
  return { min, max, size, data: new Float32Array(size * 4) };
}

/** The angle of entry `i`, radians. */
export function profileAngle(p: AngularProfile, i: number): number {
  return p.min + ((p.max - p.min) * i) / (p.size - 1);
}

/** Linear interpolation, zero outside the range: the CPU twin of `profile_at`. */
export function profileAt(p: AngularProfile, angle: number): [number, number, number] {
  const t = (angle - p.min) / (p.max - p.min);
  if (!(t >= 0 && t <= 1)) return [0, 0, 0];
  const x = t * (p.size - 1);
  const i = Math.min(Math.floor(x), p.size - 2);
  const f = x - i;
  const a = i * 4;
  const b = a + 4;
  const d = p.data;
  return [
    d[a]! + (d[b]! - d[a]!) * f,
    d[a + 1]! + (d[b + 1]! - d[a + 1]!) * f,
    d[a + 2]! + (d[b + 2]! - d[a + 2]!) * f,
  ];
}

/** Adds light `r, g, b` arriving at `angle`, shared between the two nearest entries, per radian. */
export function deposit(p: AngularProfile, angle: number, r: number, g: number, b: number): void {
  const step = (p.max - p.min) / (p.size - 1);
  const x = (angle - p.min) / step;
  const i = Math.floor(x);
  if (i < 0 || i >= p.size - 1) return;
  const f = x - i;
  const d = p.data;
  const a = i * 4;
  d[a] = d[a]! + (r * (1 - f)) / step;
  d[a + 1] = d[a + 1]! + (g * (1 - f)) / step;
  d[a + 2] = d[a + 2]! + (b * (1 - f)) / step;
  d[a + 4] = d[a + 4]! + (r * f) / step;
  d[a + 5] = d[a + 5]! + (g * f) / step;
  d[a + 6] = d[a + 6]! + (b * f) / step;
}

/**
 * The blur of a disc of angular radius `radius` seen edge-on along one line (the chord length of a
 * disc, (2 / pi R^2) sqrt(R^2 - x^2)), widened by a Gaussian of `sigma`, sampled at `step` and
 * normalised to sum to one. Index 0 is the centre; the kernel is symmetric.
 */
export function discKernel(radius: number, sigma: number, step: number): Float32Array {
  const reach = radius + 3 * sigma;
  const half = Math.max(0, Math.ceil(reach / step));
  const kernel = new Float32Array(half + 1);
  if (half === 0) {
    kernel[0] = 1;
    return kernel;
  }
  // The Gaussian, or a box one tap wide when there is none.
  const blur = (u: number) =>
    sigma > 0 ? Math.exp((-0.5 * u * u) / (sigma * sigma)) : Math.abs(u) <= step / 2 ? 1 : 0;
  // Each tap is the convolution at that offset, by a fine sum over the disc's chord.
  const fine = 64;
  for (let j = 0; j <= half; j++) {
    const x = j * step;
    if (radius <= 0) {
      kernel[j] = blur(x);
      continue;
    }
    let sum = 0;
    for (let k = 0; k < fine; k++) {
      const y = radius * (-1 + (2 * (k + 0.5)) / fine);
      sum += Math.sqrt(Math.max(0, radius * radius - y * y)) * blur(x - y);
    }
    kernel[j] = sum;
  }
  let total = kernel[0]!;
  for (let j = 1; j <= half; j++) total += 2 * kernel[j]!;
  for (let j = 0; j <= half; j++) kernel[j] = kernel[j]! / total;
  return kernel;
}

/**
 * The profile blurred by a disc of angular radius `radius` and a Gaussian of `sigma` (radians),
 * along the angle. A profile that starts at zero angle is mirrored there, as a pattern round the
 * moon is symmetric through it; past either end it is zero. Seen along one line, which is exact
 * where the pattern is far from its centre compared with the disc, and slightly too soft within a
 * disc or two of it.
 */
export function smoothProfile(p: AngularProfile, radius: number, sigma: number): AngularProfile {
  const step = (p.max - p.min) / (p.size - 1);
  const kernel = discKernel(radius, sigma, step);
  const half = kernel.length - 1;
  const out = createProfile(p.min, p.max, p.size);
  const mirror = p.min === 0;
  for (let i = 0; i < p.size; i++) {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let j = -half; j <= half; j++) {
      let k = i + j;
      if (k < 0) {
        if (!mirror) continue;
        k = -k;
      }
      if (k >= p.size) continue;
      const w = kernel[Math.abs(j)]!;
      r += w * p.data[k * 4]!;
      g += w * p.data[k * 4 + 1]!;
      b += w * p.data[k * 4 + 2]!;
    }
    out.data[i * 4] = r;
    out.data[i * 4 + 1] = g;
    out.data[i * 4 + 2] = b;
  }
  return out;
}

/** Light per radian of angle from the centre to light per steradian: divided by 2 pi sin(angle). */
export function perSteradian(p: AngularProfile): AngularProfile {
  const step = (p.max - p.min) / (p.size - 1);
  for (let i = 0; i < p.size; i++) {
    // The ring at the centre entry is half an entry wide; keep it finite.
    const theta = Math.max(profileAngle(p, i), step / 4);
    const solid = 2 * Math.PI * Math.sin(theta);
    for (let c = 0; c < 3; c++) p.data[i * 4 + c] = p.data[i * 4 + c]! / solid;
  }
  return p;
}

/** The integral of a per-steradian profile over the sphere, channel by channel. */
export function profileIntegral(p: AngularProfile): [number, number, number] {
  const step = (p.max - p.min) / (p.size - 1);
  const sum: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < p.size; i++) {
    const w = (i === 0 || i === p.size - 1 ? 0.5 : 1) * step;
    const solid = 2 * Math.PI * Math.sin(profileAngle(p, i)) * w;
    for (let c = 0; c < 3; c++) sum[c]! += p.data[i * 4 + c]! * solid;
  }
  return sum;
}
