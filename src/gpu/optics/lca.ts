/*
 * Longitudinal chromatic aberration (story 9.7): each wavelength focuses at its own distance, so a
 * point out of focus spreads to a disc of a slightly different size in every colour, and fringes
 * one colour outside and its complement inside.
 *
 * The thin lens of src/gpu/optics/lens.ts, with its power depending on the wavelength. A lens of
 * focal length f focused at S (the sensor at v, 1/S + 1/v = 1/f) draws a point at depth D as a disc
 * of signed radius
 *
 *   r = a (1/S - 1/D) * S,  a = blurAtInfinity: the aperture's radius on the sensor times v/f
 *
 * in the model's units (`cocRadius`). If the power 1/f changes by a share delta(lambda) at another
 * wavelength while the sensor stays where it is, that wavelength is in focus at 1/S' = 1/S + delta/f,
 * and its disc is
 *
 *   r(lambda) = r + delta(lambda) * blurAtInfinity * S / f
 *
 * A shift by the same number of pixels at every depth: the aperture's radius on the sensor in
 * pixels (`apertureRadiusPx`, several hundred for a fast portrait lens) times the change in power.
 * Behind focus (r > 0) a wavelength with more power (delta > 0) draws a bigger disc and rings the
 * others; in front of focus (r < 0) the same wavelength draws a smaller one and sits inside.
 *
 * Two lenses, from Schott's Sellmeier fits in spectral.ts, focused at 555 nm (the green the eye and
 * an autofocus see best):
 *
 *   singlet   one element of N-BK7, under-corrected: power (n - 1) rises towards the blue, so blue
 *             focuses nearest the lens. Behind focus a white point has a blue-violet rim round a
 *             yellow-red middle; in front of focus a red rim round a cyan-blue middle. `amount` -1
 *             over-corrects it, which swaps them: the red rim behind focus.
 *   achromat  an N-BK7 crown cemented to an F2 flint, powers chosen so 486 and 656 nm (F and C)
 *             focus together. What is left, the secondary spectrum, is about 50 times weaker and
 *             parabolic: green has the most power, red and blue less. Behind focus a green rim
 *             round magenta, in front of focus a magenta-purple rim round green: the "bokeh
 *             fringing" (purple in front, green behind) fast lenses are known for. Real fast lenses
 *             show it far stronger than the paraxial secondary spectrum alone, through
 *             spherochromatism; `amount` scales it up to match a picture. Its blue end curls up
 *             steeply (violet at 400 nm has ten times the shift of the blue channel's mean), so
 *             scaled up it is a violet halo first and a green or magenta rim second.
 *   secondary the achromat's secondary spectrum without that curl: a parabola in wavelength about
 *             555 nm, matched to the achromat at the F and C lines. A stylised fast lens, whose
 *             sensor's UV-cut filter would hide the violet anyway: scaled up it gives magenta and
 *             green rims rather than a violet halo.
 */
import type { ThinLens } from './lens.ts';
import {
  bk7Index,
  flintIndex,
  SPECTRUM_MAX,
  SPECTRUM_MIN,
  spectralRgb,
  spectralSamples,
} from './spectral.ts';

type Rgb = [number, number, number];

export type LcaLens = 'singlet' | 'achromat' | 'secondary';

export interface LcaSettings {
  lens: LcaLens;
  /** Times the glass's own aberration: 1 is the real lens, 0 none, -1 over-corrected. */
  amount: number;
}

/** The wavelength in focus, nm: where the achromat has the most power. */
export const LCA_FOCUS_NM = 555;

const crown = (nm: number) => (bk7Index(nm) - 1) / (bk7Index(LCA_FOCUS_NM) - 1);
const flint = (nm: number) => (flintIndex(nm) - 1) / (flintIndex(LCA_FOCUS_NM) - 1);

/** The achromat's share of power in the crown and the flint: F and C lines in one focus. */
const ACHROMAT = (() => {
  const dCrown = crown(486.1) - crown(656.3);
  const dFlint = flint(486.1) - flint(656.3);
  return { crown: -dFlint / (dCrown - dFlint), flint: dCrown / (dCrown - dFlint) };
})();

const achromat = (nm: number) => ACHROMAT.crown * crown(nm) + ACHROMAT.flint * flint(nm) - 1;
/** The parabola's curvature: the achromat's mean shift at F and C over the parabola's there. */
const SECONDARY =
  (achromat(486.1) + achromat(656.3)) /
  (((486.1 - LCA_FOCUS_NM) / 100) ** 2 + ((656.3 - LCA_FOCUS_NM) / 100) ** 2);

/**
 * The lens's change of power at `nm` as a share of its power at 555 nm, before `amount`: positive
 * focuses nearer the lens (shorter focal length).
 */
export function powerShift(lens: LcaLens, nm: number): number {
  if (lens === 'singlet') return crown(nm) - 1;
  if (lens === 'secondary') return SECONDARY * ((nm - LCA_FOCUS_NM) / 100) ** 2;
  return achromat(nm);
}

/**
 * The aperture's radius on the sensor, device pixels: blurAtInfinity * S / f. Every wavelength's
 * disc is shifted by this times its change of power. `focalLength` in the lens's distance units
 * (metres for `lensFromCamera`).
 */
export function apertureRadiusPx(lens: ThinLens, focalLength: number): number {
  return (lens.blurAtInfinity * lens.focus) / focalLength;
}

/** How much a wavelength's circle of confusion differs from the 555 nm one, device pixels. */
export function lcaShiftPx(
  lens: ThinLens,
  focalLength: number,
  lca: LcaSettings,
  nm: number,
): number {
  return apertureRadiusPx(lens, focalLength) * lca.amount * powerShift(lca.lens, nm);
}

/**
 * The two-number lens a shift of `shift` pixels at every depth amounts to: a thin lens with
 * blur at infinity B + shift focused at B S / (B + shift). So any method that takes a `ThinLens`
 * can draw one wavelength.
 */
export function shiftedLens(lens: ThinLens, shift: number): ThinLens {
  const blur = Math.max(lens.blurAtInfinity + shift, 1e-3);
  return { focus: (lens.blurAtInfinity * lens.focus) / blur, blurAtInfinity: blur };
}

/** One colour a point is drawn in: its circle's shift in pixels and its share of the light. */
export interface LcaBand {
  /** Added to the 555 nm circle of confusion's signed radius, device pixels. */
  shift: number;
  /** Per-channel share of the light; summed over the bands, (1, 1, 1). */
  weight: Rgb;
  /** The band's wavelength, nm (for channels, the channel's mean). */
  nm: number;
}

/**
 * How to split the light: `none` one white band with no shift (the aberration ignored),
 * `channels` red, green and blue each at its own focus (the cheap version), or a number of
 * wavelengths spread evenly over 400 to 700 nm, white-balanced (spectralSamples).
 */
export type LcaBands = 'none' | 'channels' | number;

/** The change of power each channel sees on average, weighted by its response. */
function channelMeans(lens: LcaLens): { power: Rgb; nm: Rgb } {
  const power: Rgb = [0, 0, 0];
  const nm: Rgb = [0, 0, 0];
  const weight: Rgb = [0, 0, 0];
  const steps = 600;
  for (let i = 0; i < steps; i++) {
    const l = SPECTRUM_MIN + ((i + 0.5) * (SPECTRUM_MAX - SPECTRUM_MIN)) / steps;
    const rgb = spectralRgb(l);
    const p = powerShift(lens, l);
    for (let c = 0; c < 3; c++) {
      power[c]! += rgb[c]! * p;
      nm[c]! += rgb[c]! * l;
      weight[c]! += rgb[c]!;
    }
  }
  for (let c = 0; c < 3; c++) {
    power[c]! /= weight[c]!;
    nm[c]! /= weight[c]!;
  }
  return { power, nm };
}

const channelCache = new Map<LcaLens, { power: Rgb; nm: Rgb }>();
const sampleCache = new Map<number, ReturnType<typeof spectralSamples>>();

/** The bands a point is split into for `lens`, focused as `thin`, `focalLength` in its units. */
export function lcaBands(
  thin: ThinLens,
  focalLength: number,
  lca: LcaSettings,
  bands: LcaBands,
): LcaBand[] {
  const scale = apertureRadiusPx(thin, focalLength) * lca.amount;
  if (bands === 'none' || scale === 0) return [{ shift: 0, weight: [1, 1, 1], nm: LCA_FOCUS_NM }];
  if (bands === 'channels') {
    let means = channelCache.get(lca.lens);
    if (!means) channelCache.set(lca.lens, (means = channelMeans(lca.lens)));
    return [0, 1, 2].map((c) => ({
      shift: scale * means.power[c]!,
      weight: [c === 0 ? 1 : 0, c === 1 ? 1 : 0, c === 2 ? 1 : 0] as Rgb,
      nm: means.nm[c]!,
    }));
  }
  const count = Math.max(1, Math.round(bands));
  let samples = sampleCache.get(count);
  if (!samples) sampleCache.set(count, (samples = spectralSamples(count)));
  return samples.map((s) => ({
    shift: scale * powerShift(lca.lens, s.nm),
    weight: [...s.rgb] as Rgb,
    nm: s.nm,
  }));
}

/** Entries in `powerTable`: 64 wavelengths, 400 to 700 nm inclusive. */
export const LCA_TABLE_SIZE = 64;

/**
 * The change of power at 64 wavelengths evenly from 400 to 700 nm, times `amount` and divided by
 * the focal length: what adds to 1/S to give each wavelength's focus. For the spectral reference
 * (spectral-reference.wgsl), which looks it up per ray.
 */
export function powerTable(lca: LcaSettings, focalLength: number): Float32Array {
  return Float32Array.from({ length: LCA_TABLE_SIZE }, (_, i) => {
    const nm = SPECTRUM_MIN + ((SPECTRUM_MAX - SPECTRUM_MIN) * i) / (LCA_TABLE_SIZE - 1);
    return (lca.amount * powerShift(lca.lens, nm)) / focalLength;
  });
}
