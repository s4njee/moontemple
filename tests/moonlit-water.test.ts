import { describe, expect, it } from 'vitest';
import { countFlashes, flickerIntensity } from '../src/gpu/optics/flicker.ts';
import {
  buildCells,
  emitGlints,
  TWINKLE_MEAN,
  TWINKLE_SETTINGS,
  twinkle,
  twinkleShape,
  type SeaView,
} from '../src/effects/moonlit-water/glints.ts';
import { SWELL_TERMS, swellAt } from '../src/effects/moonlit-water/swell.ts';

// Story 5.4: the glitter path of moonlight as points of light (src/effects/moonlit-water).

const VIEW: SeaView = {
  eye: 2.5,
  moonElevation: (3.5 * Math.PI) / 180,
  waves: 0.6,
  wind: 4,
  cap: 6000,
  aspect: 16 / 9,
  viewScale: 24 / 85,
  horizon: 0.4,
};

const frame = (t: number, still = false) => ({
  waveTime: t,
  twinkleTime: t,
  twinkleRate: 3,
  still,
  waves: VIEW.waves,
  gain: 1,
});

describe('the swell', () => {
  it('has the gradient of its height', () => {
    const full = SWELL_TERMS.map(() => 1);
    const a = new Float64Array(3);
    const b = new Float64Array(3);
    const e = 1e-4;
    for (const [x, z, t] of [
      [0.3, 12, 0.5],
      [-7, 40, 3.2],
      [21, 5, 9],
    ] as const) {
      swellAt(x, z, t, 1, full, a);
      swellAt(x + e, z, t, 1, full, b);
      const gx = (b[0]! - a[0]!) / e;
      swellAt(x, z + e, t, 1, full, b);
      const gz = (b[0]! - a[0]!) / e;
      expect(a[1]).toBeCloseTo(gx, 3);
      expect(a[2]).toBeCloseTo(gz, 3);
    }
  });
});

describe('the twinkle', () => {
  it('has mean 1 over time and cells', () => {
    let sum = 0;
    let n = 0;
    for (let seed = 0; seed < 200; seed++) {
      for (let t = 0; t < 120; t += 0.1) {
        sum += twinkleShape(flickerIntensity(t, seed * 7919, TWINKLE_SETTINGS));
        n++;
      }
    }
    expect(sum / n / TWINKLE_MEAN).toBeCloseTo(1, 1);
  });

  it('never makes one glint flash more than three times a second, at any rate asked for', () => {
    // A glint's light relative to its own brightest, as though it filled the view.
    let worst = 0;
    for (const rate of [1, 3, 4, 12]) {
      const settings = { ...TWINKLE_SETTINGS, rate };
      for (let seed = 0; seed < 300; seed++) {
        const signal = Array.from({ length: 60 * 20 }, (_, i) =>
          Math.min(1, twinkle(i / 60, seed, settings) * TWINKLE_MEAN),
        );
        worst = Math.max(worst, countFlashes(signal, 60).maxFlashes);
      }
    }
    expect(worst).toBeLessThanOrEqual(3);
  });
});

describe('the glitter path', () => {
  // Each glint's expected light, with no twinkle.
  const total = (view: SeaView, t: number) => {
    const cells = buildCells(view);
    let light = 0;
    let moment = 0;
    emitGlints(cells, { ...frame(t), expected: true, waves: view.waves }, (x, _h, _z, l) => {
      light += l;
      moment += l * x;
    });
    return { light, moment, cells: cells.count };
  };

  it('keeps about the cell budget', () => {
    for (const cap of [1000, 6000, 15000]) {
      const { cells } = total({ ...VIEW, cap }, 0);
      expect(cells / cap).toBeGreaterThan(0.7);
      expect(cells / cap).toBeLessThan(1.3);
    }
  });

  it('carries the same light whatever the number of cells', () => {
    // The path's light is the glitter formula's, not the budget's: few big cells or many small
    // ones, the sum agrees.
    const few = total({ ...VIEW, cap: 1500 }, 2).light;
    const many = total({ ...VIEW, cap: 15000 }, 2).light;
    expect(many / few).toBeGreaterThan(0.85);
    expect(many / few).toBeLessThan(1.15);
  });

  it('runs straight down from the moon', () => {
    const { light, moment } = total({ ...VIEW, waves: 0 }, 0);
    // Light-weighted mean across, metres, against the light: centred within a few cm per unit.
    expect(Math.abs(moment / light)).toBeLessThan(1);
  });

  it('holds a calmer, dimmer path than it plays', () => {
    const cells = buildCells(VIEW);
    const light = (t: number, still = false) => {
      let sum = 0;
      emitGlints(cells, frame(t, still), (_x, _h, _z, l) => (sum += l));
      return sum;
    };
    // Held frames clip the twinkle, so they carry less light than played ones, never more.
    let played = 0;
    let held = 0;
    const frames = 120;
    for (let i = 0; i < frames; i++) {
      played += light(5 + i / 30);
      held += light(5 + i / 30, true);
    }
    expect(held / played).toBeLessThan(1);
    expect(held / played).toBeGreaterThan(0.5);
  });

  it('changes its total light only slowly from frame to frame', () => {
    const cells = buildCells(VIEW);
    let previous = 0;
    let worst = 0;
    for (let i = 0; i < 240; i++) {
      let light = 0;
      emitGlints(cells, frame(i / 60), (_x, _h, _z, l) => (light += l));
      if (i > 0) worst = Math.max(worst, Math.abs(light - previous) / previous);
      previous = light;
    }
    expect(worst).toBeLessThan(0.05);
  });
});
