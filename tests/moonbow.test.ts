import { describe, expect, it } from 'vitest';
import { profileAt, profileIntegral } from '../src/gpu/optics/profile.ts';
import {
  bowRadius,
  deviation,
  fromAntisolar,
  pathShare,
  rainbowProfile,
} from '../src/gpu/optics/rainbow.ts';
import { luminance, waterIndex } from '../src/gpu/optics/spectral.ts';

// Story 5.7: the moonbow from the Descartes ray through water drops, and the phase function the
// effect looks it up in.

const DEG = Math.PI / 180;
const MOON = 0.00452;

describe('water drops', () => {
  it('have the measured index of water', () => {
    expect(waterIndex(589)).toBeCloseTo(1.333, 3);
    expect(waterIndex(405)).toBeCloseTo(1.343, 3);
  });

  it('put the primary bow 42 degrees from the antilunar point, red outside', () => {
    expect(bowRadius(2, waterIndex(589)) / DEG).toBeCloseTo(42.1, 1);
    expect(bowRadius(2, waterIndex(656))).toBeGreaterThan(bowRadius(2, waterIndex(450)));
    expect((bowRadius(2, waterIndex(656)) - bowRadius(2, waterIndex(450))) / DEG).toBeCloseTo(
      1.2,
      1,
    );
  });

  it('put the secondary at 51 degrees, colours the other way round', () => {
    expect(bowRadius(3, waterIndex(589)) / DEG).toBeCloseTo(50.9, 1);
    expect(bowRadius(3, waterIndex(656))).toBeLessThan(bowRadius(3, waterIndex(450)));
  });

  it('find the bow at the turning point of the deviation (Descartes)', () => {
    const n = waterIndex(550);
    for (const p of [2, 3] as const) {
      let extreme = p === 2 ? 0 : Math.PI;
      for (let k = 0; k <= 200_000; k++) {
        const angle = fromAntisolar(deviation(p, (k / 200_000) * (Math.PI / 2), n));
        // The primary is the largest angle from the antilunar point any ray reaches; the
        // secondary the smallest.
        extreme = p === 2 ? Math.max(extreme, angle) : Math.min(extreme, angle);
      }
      expect(extreme).toBeCloseTo(bowRadius(p, n), 6);
    }
  });

  it('conserve light: the paths up to two reflections inside carry nearly all of it', () => {
    const n = waterIndex(550);
    let sum = 0;
    const rays = 20_000;
    for (let k = 0; k < rays; k++) {
      const i = Math.asin(Math.sqrt((k + 0.5) / rays));
      for (let p = 0; p <= 3; p++) sum += pathShare(p, i, n) / rays;
    }
    expect(sum).toBeLessThan(1);
    expect(sum).toBeGreaterThan(0.97);
  });
});

describe('the bow', () => {
  const bow = rainbowProfile({ source: MOON });
  const lum = (deg: number) => luminance(profileAt(bow, deg * DEG));

  it('is brightest at its edge, with the sky inside it lit and Alexander’s dark band outside', () => {
    let peak = 0;
    let at = 0;
    for (let deg = 35; deg < 45; deg += 0.01) {
      if (lum(deg) > peak) {
        peak = lum(deg);
        at = deg;
      }
    }
    expect(at).toBeGreaterThan(41.3);
    expect(at).toBeLessThan(42.4);
    const band = lum(46.5);
    expect(lum(38) / band).toBeGreaterThan(10);
    expect(lum(56) / band).toBeGreaterThan(2);
    expect(peak / lum(51.2)).toBeGreaterThan(3);
  });

  it('is red on the outside of the primary and the inside of the secondary', () => {
    const [r1, , b1] = profileAt(bow, 42.4 * DEG);
    expect(r1).toBeGreaterThan(2 * b1!);
    const [r2, , b2] = profileAt(bow, 50.6 * DEG);
    expect(r2).toBeGreaterThan(2 * b2!);
    const [r3, , b3] = profileAt(bow, 53 * DEG);
    expect(b3).toBeGreaterThan(r3!);
  });

  it('is a per-steradian phase function: the back half of the sky holds a share of the light', () => {
    // Out to 90 degrees from the antilunar point: reflection off the drops and the two bows'
    // paths; what goes forwards (straight through) is not in the table.
    const [, g] = profileIntegral(bow);
    expect(g).toBeGreaterThan(0.05);
    expect(g).toBeLessThan(0.2);
  });
});
