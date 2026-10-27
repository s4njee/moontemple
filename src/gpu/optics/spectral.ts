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

// ---- Story 9.1: hero-wavelength sampling ------------------------------------------------------

/** The visible range every spectral estimate here covers, nm. */
export const SPECTRUM_MIN = 400;
export const SPECTRUM_MAX = 700;

/**
 * The mean of `spectralRgb` over the visible range, per channel: divide by it and a flat spectrum
 * comes out white. Twin of `SPECTRAL_WHITE` in src/wgsl/spectral.wgsl (a test keeps them equal).
 */
export function spectralWhite(steps = 3000): Rgb {
  const sum: Rgb = [0, 0, 0];
  for (let i = 0; i < steps; i++) {
    const rgb = spectralRgb(SPECTRUM_MIN + ((i + 0.5) * (SPECTRUM_MAX - SPECTRUM_MIN)) / steps);
    for (let c = 0; c < 3; c++) sum[c]! += rgb[c]! / steps;
  }
  return sum;
}

/**
 * Hero-wavelength sampling (Wilkie, Nawaz, Droske, Weidlich and Hanika, 2014): one wavelength from
 * a uniform `u` in [0, 1), and three more a quarter of the range apart, wrapped round. Four
 * wavelengths that always cover the spectrum evenly, so a dispersive path traced once per hero
 * carries four colours instead of one, and the estimate's noise in colour is far lower.
 */
export function heroWavelengths(u: number): [number, number, number, number] {
  const span = SPECTRUM_MAX - SPECTRUM_MIN;
  return [0, 1, 2, 3].map((i) => SPECTRUM_MIN + ((((u + i / 4) % 1) + 1) % 1) * span) as [
    number,
    number,
    number,
    number,
  ];
}

/** Linear RGB of four wavelengths carrying `radiance` each, as one sample of a spectral estimate. */
export function heroToRgb(nm: readonly number[], radiance: readonly number[]): Rgb {
  const white = spectralWhite();
  const out: Rgb = [0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const rgb = spectralRgb(nm[i]!);
    for (let c = 0; c < 3; c++) out[c]! += (rgb[c]! * radiance[i]!) / (4 * white[c]!);
  }
  return out;
}

// ---- Story 9.2: glass -------------------------------------------------------------------------

/** Sellmeier: n^2 = 1 + sum B lambda^2 / (lambda^2 - C), lambda in micrometres. */
function sellmeier(nm: number, b: readonly number[], c: readonly number[]): number {
  const l2 = (nm / 1000) ** 2;
  let n2 = 1;
  for (let i = 0; i < b.length; i++) n2 += (b[i]! * l2) / (l2 - c[i]!);
  return Math.sqrt(n2);
}

/** Schott N-BK7, crown glass: 1.5168 at 587.6 nm. */
export const bk7Index = (nm: number) =>
  sellmeier(nm, [1.03961212, 0.231792344, 1.01046945], [0.00600069867, 0.0200179144, 103.560653]);
/** Schott F2, flint glass: 1.6200 at 587.6 nm, about twice the crown's dispersion. */
export const flintIndex = (nm: number) =>
  sellmeier(nm, [1.34533359, 0.209073176, 0.937357162], [0.00997743871, 0.0470450767, 111.886764]);
/** Diamond: 2.417 at 589 nm, and the strongest split of the three ("fire"). */
export const diamondIndex = (nm: number) =>
  sellmeier(nm, [4.3356, 0.3306], [0.106 ** 2, 0.175 ** 2]);

export const GLASSES = { crown: bk7Index, flint: flintIndex, diamond: diamondIndex } as const;
export type Glass = keyof typeof GLASSES;

// ---- CIE colour, for halos ----------------------------------------------------------------------

const lobe = (x: number, mu: number, s1: number, s2: number) => {
  const t = (x - mu) / (x < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
};

/**
 * The CIE 1931 2-degree colour-matching functions at `nm`, by Wyman, Sloan and Shirley's multi-lobe
 * fit (2013), within a few per cent of the tabulated curves.
 */
export function cieXyz(nm: number): Rgb {
  return [
    1.056 * lobe(nm, 599.8, 37.9, 31.0) +
      0.362 * lobe(nm, 442.0, 16.0, 26.7) -
      0.065 * lobe(nm, 501.1, 20.4, 26.2),
    0.821 * lobe(nm, 568.8, 46.9, 40.5) + 0.286 * lobe(nm, 530.9, 16.3, 31.1),
    1.217 * lobe(nm, 437.0, 11.8, 36.0) + 0.681 * lobe(nm, 459.0, 26.0, 13.8),
  ];
}

/**
 * Linear sRGB of a wavelength from the CIE functions, clamped into the gamut (the spectrum's colours
 * lie outside it; clamping keeps their hue and loses saturation). Unlike `spectralRgb`, the red end
 * is red: 620 nm and beyond carry no green or blue, so a halo whose rim is long wavelengths reads
 * orange and then red rather than brown. Story 10.2 found that.
 */
export function cieRgb(nm: number): Rgb {
  const [x, y, z] = cieXyz(nm);
  return [
    Math.max(0, 3.2406 * x - 1.5372 * y - 0.4986 * z),
    Math.max(0, -0.9689 * x + 1.8758 * y + 0.0415 * z),
    Math.max(0, 0.0557 * x - 0.204 * y + 1.057 * z),
  ];
}

/** Like `spectralSamples`, with `cieRgb`'s colours: a flat spectrum still sums to white. */
export function cieSamples(count: number): SpectralSample[] {
  const samples = Array.from({ length: count }, (_, i) => {
    const nm = SPECTRUM_MIN + ((SPECTRUM_MAX - SPECTRUM_MIN) * (i + 0.5)) / count;
    return { nm, rgb: cieRgb(nm) };
  });
  const sum: Rgb = [0, 0, 0];
  for (const s of samples) for (let c = 0; c < 3; c++) sum[c]! += s.rgb[c]!;
  for (const s of samples) for (let c = 0; c < 3; c++) s.rgb[c]! /= sum[c]!;
  return samples;
}
