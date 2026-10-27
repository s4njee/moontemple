/*
 * Spectral colour for the sky optics of Epic 5 (corona, halo, moonbow): a wavelength to linear
 * sRGB, a white-balanced set of wavelengths to sum a pattern over, and the dispersion of water and
 * ice. GPU-free: the effects build their colour profiles here and upload them as tables.
 *
 * `spectralRgb` is Alan Zucconi's six-bump fit to the colours of the spectrum, copied from Light
 * Temple's src/shaders/optics.wgsl (`spectral_rgb`), where it colours holographic foil.
 */

type Rgb = [number, number, number];

const bump = (x: number, y: number) => Math.min(1, Math.max(0, 1 - x * x - y));

/** Visible wavelength in nm (400..700) to linear RGB, roughly equal energy (Zucconi). */
export function spectralRgb(nm: number): Rgb {
  const x = Math.min(1, Math.max(0, (nm - 400) / 300));
  return [
    bump(3.54585104 * (x - 0.69549072), 0.02312639) + bump(3.9030714 * (x - 0.11748627), 0.8489713),
    bump(2.93225262 * (x - 0.49228336), 0.15225084) +
      bump(3.21182957 * (x - 0.86755042), 0.88445281),
    bump(2.41593945 * (x - 0.2769988), 0.52607955) + bump(3.96587128 * (x - 0.6607786), 0.73949448),
  ];
}

export interface SpectralSample {
  /** Wavelength, nm. */
  nm: number;
  /** Linear RGB weight: summed over the set, an equal-energy spectrum comes out (1, 1, 1). */
  rgb: Rgb;
}

/**
 * `count` wavelengths spread evenly over 400..700 nm, each with the colour it adds, scaled per
 * channel so that a flat spectrum sums to white. A pattern summed over these with the same
 * strength at every wavelength is white; where some wavelengths are missing it takes their
 * complement, which is all a corona's or a halo's colour is.
 */
export function spectralSamples(count: number): SpectralSample[] {
  const samples = Array.from({ length: count }, (_, i) => {
    const nm = 400 + (300 * (i + 0.5)) / count;
    return { nm, rgb: spectralRgb(nm) };
  });
  const sum: Rgb = [0, 0, 0];
  for (const s of samples) for (let c = 0; c < 3; c++) sum[c]! += s.rgb[c]!;
  for (const s of samples) for (let c = 0; c < 3; c++) s.rgb[c]! /= sum[c]!;
  return samples;
}

/**
 * Refractive index of ice, Ih, in the visible: Cauchy's A + B / lambda^2 fitted through 1.3070 at
 * 656 nm and 1.3133 at 486 nm (Warren and Brandt 2008); 1.3090 at 589 nm and 1.3194 at 405 nm
 * from the same two numbers, both within 0.0002 of the measured values.
 */
export function iceIndex(nm: number): number {
  const um = nm / 1000;
  return 1.29933 + 0.003298 / (um * um);
}

/**
 * Refractive index of water at about 20 degrees C: Cauchy fitted through 1.3311 at 656 nm and
 * 1.3371 at 486 nm (Hale and Querry 1973); 1.3329 at 589 nm and 1.3430 at 405 nm from the same
 * two numbers.
 */
export function waterIndex(nm: number): number {
  const um = nm / 1000;
  return 1.3238 + 0.003141 / (um * um);
}

/** Linear sRGB luminance. */
export function luminance(rgb: readonly number[]): number {
  return 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
}
