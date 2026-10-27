import { describe, expect, it } from 'vitest';
import {
  bravaisIndex,
  haloProfile,
  minimumDeviation,
  moonDogAzimuth,
  moonDogDistance,
  moonDogProfile,
  traceSideFaces,
} from '../src/gpu/optics/halo.ts';
import { profileAt, profileIntegral, type AngularProfile } from '../src/gpu/optics/profile.ts';
import { iceIndex, luminance } from '../src/gpu/optics/spectral.ts';

// Story 5.3: the 22-degree halo from the minimum deviation of a 60-degree ice prism, traced through
// tumbling columns, and the moon dogs of level plates.

const DEG = Math.PI / 180;
const MOON = 0.00452;

/** The first angle (degrees) at which a channel reaches half its peak, scanning outwards. */
function innerEdge(profile: AngularProfile, channel: number, from = 15, to = 40): number {
  let peak = 0;
  for (let deg = from; deg < to; deg += 0.01) {
    peak = Math.max(peak, profileAt(profile, deg * DEG)[channel]!);
  }
  for (let deg = from; deg < to; deg += 0.01) {
    if (profileAt(profile, deg * DEG)[channel]! >= peak / 2) return deg;
  }
  return NaN;
}

describe('ice', () => {
  it('has the measured index in the visible (Warren and Brandt)', () => {
    expect(iceIndex(589)).toBeCloseTo(1.309, 3);
    expect(iceIndex(405)).toBeCloseTo(1.3194, 3);
    expect(iceIndex(656)).toBeCloseTo(1.307, 3);
  });

  it('turns light least by about 21.8 degrees through a 60-degree prism, red least of all', () => {
    // D_min = 2 asin(n sin 30) - 60.
    expect(minimumDeviation(iceIndex(589)) / DEG).toBeCloseTo(21.75, 1);
    expect(minimumDeviation(1.31) / DEG).toBeCloseTo(21.84, 1);
    expect(minimumDeviation(iceIndex(656)) / DEG).toBeCloseTo(21.6, 1);
    expect(minimumDeviation(iceIndex(450)) / DEG).toBeCloseTo(22.27, 1);
  });

  it('never deviates a traced ray by less than the minimum, and gets within 0.05 degrees of it', () => {
    const n = iceIndex(550);
    const least = minimumDeviation(n);
    let lowest = Infinity;
    for (let i = 0; i < 400; i++) {
      const mu = (i + 0.5) / 400;
      const s = Math.sqrt(1 - mu * mu);
      for (let j = 0; j < 400; j++) {
        traceSideFaces(
          [0, 0, 1],
          [mu, 0, -s],
          [0, 1, 0],
          ((j + 0.5) / 400) * 60 * DEG,
          n,
          ({ out }) => {
            lowest = Math.min(lowest, Math.acos(Math.min(1, out[2])));
          },
        );
      }
    }
    expect(lowest).toBeGreaterThanOrEqual(least - 1e-9);
    expect((lowest - least) / DEG).toBeLessThan(0.05);
  });
});

describe('the 22-degree halo', () => {
  const halo = haloProfile({ source: MOON });

  it('leaves the sky inside it dark', () => {
    const peak = Math.max(
      ...Array.from({ length: 300 }, (_, i) => luminance(profileAt(halo, (20 + i * 0.02) * DEG))),
    );
    expect(luminance(profileAt(halo, 20 * DEG))).toBeLessThan(1e-3 * peak);
    expect(luminance(profileAt(halo, 10 * DEG))).toBe(0);
  });

  it('has a sharp red inner edge at the minimum deviation, blue further out', () => {
    const [red, green, blue] = [0, 1, 2].map((c) => innerEdge(halo, c));
    expect(red).toBeLessThan(green!);
    expect(green).toBeLessThan(blue!);
    // Each colour's edge lies at its own minimum deviation, softened by the moon's disc.
    expect(red).toBeCloseTo(minimumDeviation(iceIndex(640)) / DEG, 0);
    expect(Math.abs(red! - 21.6)).toBeLessThan(0.3);
    expect(Math.abs(blue! - 22.2)).toBeLessThan(0.3);
  });

  it('fades outwards from the edge', () => {
    const lum = (deg: number) => luminance(profileAt(halo, deg * DEG));
    let peak = 0;
    let at = 0;
    for (let deg = 20; deg < 30; deg += 0.01) {
      if (lum(deg) > peak) {
        peak = lum(deg);
        at = deg;
      }
    }
    expect(at).toBeGreaterThan(21.8);
    expect(at).toBeLessThan(23);
    for (let deg = 23; deg < 45; deg += 0.5) expect(lum(deg + 0.5)).toBeLessThan(lum(deg));
    expect(lum(25) / peak).toBeLessThan(0.65);
    expect(lum(30) / peak).toBeLessThan(0.25);
    expect(lum(35) / peak).toBeLessThan(0.1);
  });

  it('carries the same share of every colour: refraction sorts the colours, it does not remove them', () => {
    const [r, g, b] = profileIntegral(halo);
    expect(g).toBeGreaterThan(0.3);
    expect(g).toBeLessThan(0.5);
    expect(Math.abs(r / g - 1)).toBeLessThan(0.02);
    expect(Math.abs(b / g - 1)).toBeLessThan(0.02);
  });

  it('has converged: a finer grid of orientations changes it by under 1% of its peak', () => {
    const fine = haloProfile({ source: MOON, tilts: 240, turns: 144, wavelengths: 24 });
    let peak = 0;
    let worst = 0;
    for (let deg = 18; deg < 50; deg += 0.05) {
      const a = profileAt(halo, deg * DEG);
      const b = profileAt(fine, deg * DEG);
      for (let c = 0; c < 3; c++) {
        peak = Math.max(peak, b[c]!);
        worst = Math.max(worst, Math.abs(a[c]! - b[c]!));
      }
    }
    expect(worst / peak).toBeLessThan(0.01);
  });
});

describe('moon dogs', () => {
  const n = iceIndex(550);

  it('sit on the halo with the moon on the horizon and move out as it rises', () => {
    expect(moonDogDistance(n, 0)).toBeCloseTo(minimumDeviation(n), 9);
    expect(bravaisIndex(n, 0)).toBe(n);
    // Tabulated parhelion distances: about 22.2 at 10 degrees, 23.1 at 20, 24.8 at 30, 27.7 at 40.
    expect(moonDogDistance(n, 10 * DEG) / DEG).toBeCloseTo(22.2, 0);
    expect(moonDogDistance(n, 30 * DEG) / DEG).toBeCloseTo(24.8, 0);
    expect(moonDogDistance(n, 40 * DEG) / DEG).toBeCloseTo(27.7, 0);
    let last = 0;
    for (let h = 0; h <= 60; h += 5) {
      const d = moonDogDistance(n, h * DEG);
      expect(d).toBeGreaterThan(last);
      last = d;
    }
  });

  it('vanish above about 61 degrees', () => {
    expect(Number.isNaN(moonDogAzimuth(n, 62 * DEG))).toBe(true);
    expect(Number.isNaN(moonDogAzimuth(n, 60 * DEG))).toBe(false);
  });

  it('are traced with their red inner edge at the Bravais minimum deviation', () => {
    for (const h of [0, 20, 40]) {
      const dog = moonDogProfile({ elevation: h * DEG, source: MOON, turns: 1500 });
      const red = innerEdge(dog, 0, 15, 60);
      const blue = innerEdge(dog, 2, 15, 60);
      expect(red).toBeLessThan(blue);
      expect(Math.abs(red - moonDogAzimuth(iceIndex(640), h * DEG) / DEG), `h ${h}`).toBeLessThan(
        0.4,
      );
    }
  });
});
