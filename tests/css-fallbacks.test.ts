// Story 7.4: every Tier A effect has a CSS fallback entry, and every CSS version is flash-safe by
// construction. Pure: the plan is data, so no DOM is needed.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CSS_FALLBACKS,
  FLASH_LIMITS,
  NO_CSS_FALLBACK,
  flashProblems,
  planCssFallback,
  type CssFallbackConfig,
} from '../src/fallbacks/css-fallbacks.ts';

const EFFECTS = join(import.meta.dirname, '../src/effects');

/** Tier A effect ids, read from the meta files so a new effect is caught without the registry. */
const tierA = readdirSync(EFFECTS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(EFFECTS, entry.name, 'meta.ts')))
  .map((entry) => readFileSync(join(EFFECTS, entry.name, 'meta.ts'), 'utf8'))
  .filter((source) => /tier:\s*'A'/.test(source))
  .map((source) => /id:\s*'([^']+)'/.exec(source)?.[1] ?? '');

const configs = Object.entries(CSS_FALLBACKS).filter(
  (entry): entry is [string, CssFallbackConfig] => entry[1] !== null,
);

describe('CSS fallback table', () => {
  it('finds the Tier A effects', () => {
    expect(tierA.length).toBeGreaterThan(10);
    expect(tierA).not.toContain('');
  });

  it.each(tierA)('%s has an entry', (id) => {
    expect(CSS_FALLBACKS).toHaveProperty([id]);
  });

  it('lists only Tier A effects', () => {
    for (const id of Object.keys(CSS_FALLBACKS)) expect(tierA).toContain(id);
  });

  it('gives a reason for every effect without a CSS version', () => {
    for (const [id, config] of Object.entries(CSS_FALLBACKS)) {
      if (config === null) expect(NO_CSS_FALLBACK[id]?.reason.length).toBeGreaterThan(40);
      else expect(NO_CSS_FALLBACK[id]).toBeUndefined();
    }
  });

  it.each(configs)('%s says what CSS cannot do', (_id, config) => {
    expect(config.cannot.length).toBeGreaterThan(40);
  });
});

describe('flash safety by construction', () => {
  it.each(configs)('%s is inside the flash limits', (_id, config) => {
    expect(flashProblems(config)).toEqual([]);
  });

  it.each(configs)('%s plans only slow, small, partial twinkles', (_id, config) => {
    const plan = planCssFallback(config);
    for (const a of plan.animations) {
      if (a.kind === 'twinkle') {
        // At most one dip per period: well under three flashes a second.
        expect(1 / a.duration).toBeLessThan(3);
        expect(a.duration).toBeGreaterThanOrEqual(FLASH_LIMITS.minTwinklePeriod);
        expect(a.amplitude).toBeLessThanOrEqual(FLASH_LIMITS.maxTwinkleAmplitude);
        expect(a.size).toBeLessThanOrEqual(FLASH_LIMITS.maxTwinkleSize);
      } else {
        expect(a.duration).toBeGreaterThanOrEqual(FLASH_LIMITS.minMotionDuration);
      }
    }
  });

  it.each(configs)('%s never dips a twinkle below the floor in its keyframes', (_id, config) => {
    const { css } = planCssFallback(config);
    const keyframes = css.split('\n').filter((line) => line.startsWith('@keyframes'));
    for (const match of keyframes.join('\n').matchAll(/opacity:\s*([\d.]+)/g)) {
      expect(Number(match[1])).toBeGreaterThanOrEqual(1 - FLASH_LIMITS.maxTwinkleAmplitude - 1e-9);
    }
  });

  it.each(configs)('%s holds still under reduced motion', (_id, config) => {
    const { css } = planCssFallback(config, 'x');
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{ \.x \*, \.x \{ animation-play-state: paused !important; \} \}/,
    );
  });

  it('refuses a config over the limits', () => {
    const fast: CssFallbackConfig = {
      seed: 1,
      background: '#000',
      layers: [
        {
          count: 3,
          placement: { kind: 'scatter' },
          size: [20, 30],
          profile: 'disc',
          palette: ['#ffffff'],
          alpha: [1, 1],
          twinkle: { period: [0.2, 0.4], amplitude: 1 },
        },
      ],
      cannot: 'A test config.',
      verdict: 'leave it out',
    };
    expect(flashProblems(fast)).toHaveLength(3);
    expect(() => planCssFallback(fast)).toThrow(/flash limits/);
  });
});

describe('plan', () => {
  it('is the same for the same seed', () => {
    const config = CSS_FALLBACKS['bokeh-drift'];
    expect(config).toBeTruthy();
    expect(planCssFallback(config!, 'a')).toEqual(planCssFallback(config!, 'a'));
  });

  it.each(configs)('%s keeps its animations on the compositor', (_id, config) => {
    // Only transform and opacity are animated, and no keyframe reads a custom property.
    const { css } = planCssFallback(config);
    for (const block of css.matchAll(/@keyframes [^{]+\{(.*)\}/g)) {
      expect(block[1]).not.toMatch(/var\(/);
      for (const property of block[1]!.matchAll(/([a-z-]+):/g)) {
        expect(['transform', 'opacity']).toContain(property[1]);
      }
    }
  });
});
