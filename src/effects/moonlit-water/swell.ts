/*
 * The sea's large waves: five directional swells, ported from Water Temple's
 * src/wgsl/waterplane.wgsl (`_waterplane_swell`, used by its `sun-glint`), with the same
 * wavelengths, directions, steepness and phases. This is the CPU twin of `sea_swell` in sea.wgsl:
 * the glint finder needs the surface's slope at a few thousand cells a frame, the sea pass at
 * every pixel, and both must agree on where the waves are.
 *
 * World: y up, the mean sea level is y = 0, x to the right, z ahead (away from the camera).
 * Each swell is exp(sin(phase) - 1) (sharp crests, broad troughs) less its mean, travelling at the
 * deep-water speed omega = sqrt(g k). Water Temple's two octaves of gradient-noise ripples are left
 * out: the slopes they would add are smaller than a glint cell, so the glint finder gives them to
 * the Cox–Munk facet statistics instead (glints.ts), and the sea pass fades them out anyway.
 */

export const GRAVITY = 9.81;
/** Mean of exp(sin(x) - 1) over a period, I0(1) / e: subtracted so each swell has zero mean. */
export const PROFILE_MEAN = 0.4658;
/**
 * Mean square of exp(sin(x) - 1) cos(x) over a period, I1(2) / (2 e^2): the variance of one
 * swell's slope is (amplitude * k)^2 times this.
 */
export const SLOPE_SQUARE_MEAN = 0.10763;

export interface Swell {
  /** Direction of travel, radians: 0 rolls towards the camera (-z), positive turns to +x. */
  angle: number;
  wavelength: number;
  steep: number;
  phase: number;
}

/** Water Temple's five swells, longest first. */
export const SWELLS: readonly Swell[] = [
  { angle: 0, wavelength: 25, steep: 1, phase: 0 },
  { angle: 0.5, wavelength: 14, steep: 0.9, phase: 1.7 },
  { angle: -0.65, wavelength: 8.3, steep: 0.8, phase: 3.1 },
  { angle: 1.05, wavelength: 4.6, steep: 0.7, phase: 4.4 },
  { angle: -1.3, wavelength: 2.5, steep: 0.55, phase: 0.9 },
];

/** Per-swell constants: direction (x, z), wavenumber, angular frequency, amplitude per strength. */
export const SWELL_TERMS = SWELLS.map((s) => {
  const k = (2 * Math.PI) / s.wavelength;
  return {
    dx: Math.sin(s.angle),
    dz: -Math.cos(s.angle),
    k,
    omega: Math.sqrt(GRAVITY * k),
    amplitude: 0.03 * s.wavelength * s.steep,
    phase: s.phase,
    wavelength: s.wavelength,
  };
});

/**
 * How much of a swell a patch `size` metres across (or a pixel footprint) still resolves: 1 for
 * waves at least 8 patches long, 0 under 2.5, smooth between, as waterplane.wgsl fades its waves.
 */
export function swellFade(wavelength: number, size: number): number {
  const t = Math.min(1, Math.max(0, (wavelength / Math.max(size, 1e-6) - 2.5) / 5.5));
  return t * t * (3 - 2 * t);
}

/** Variance of the slope along x and z of one swell at `strength`, before fading. */
export function swellSlopeVariance(index: number, strength: number): [number, number] {
  const s = SWELL_TERMS[index]!;
  const v = (s.amplitude * s.k * strength) ** 2 * SLOPE_SQUARE_MEAN;
  return [v * s.dx * s.dx, v * s.dz * s.dz];
}

/**
 * Height and gradient (d/dx, d/dz) of the swell at (x, z) and time `t`, written into `out`.
 * `fades` holds each swell's resolve factor (all 1 for the full surface).
 */
export function swellAt(
  x: number,
  z: number,
  t: number,
  strength: number,
  fades: ArrayLike<number>,
  out: Float64Array,
): void {
  let h = 0;
  let gx = 0;
  let gz = 0;
  for (let i = 0; i < SWELL_TERMS.length; i++) {
    const fade = fades[i]!;
    if (fade <= 0) continue;
    const s = SWELL_TERMS[i]!;
    const phase = s.k * (s.dx * x + s.dz * z) - s.omega * t + s.phase;
    const sin = Math.sin(phase);
    const e = Math.exp(sin - 1);
    const amp = s.amplitude * strength * fade;
    const slope = amp * s.k * e * Math.cos(phase);
    h += amp * (e - PROFILE_MEAN);
    gx += slope * s.dx;
    gz += slope * s.dz;
  }
  out[0] = h;
  out[1] = gx;
  out[2] = gz;
}
