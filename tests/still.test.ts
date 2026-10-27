import { describe, expect, it, vi } from 'vitest';
import { listEffects, loadEffect } from '../src/effects/registry.ts';
import { sampleCells } from './flash.ts';
import { mountHeadless } from './headless.ts';

vi.setConfig({ testTimeout: 600_000 });

// The reduced-motion audit (Storm Temple's story 6.2). A paused host draws one frame and holds it
// (`FrameTime.still`): for a visitor who asked for less motion, that frame is the effect. It has
// to show the effect's subject, an orb, a glint, a halo, and must not be a flare frozen in
// place. Each effect and preset is held twice: at its first frame, and paused after it has run.

const WIDTH = 240;
const HEIGHT = 135;

interface Held {
  /** Mean relative luminance of the frame. */
  mean: number;
  /** Brightest pixel's relative luminance. */
  peak: number;
}

const measure = (rgba: Uint8Array): Held => ({
  mean: sampleCells(rgba, WIDTH, HEIGHT, 1, 1)[0]!.luminance,
  peak: Math.max(...sampleCells(rgba, WIDTH, HEIGHT, WIDTH, HEIGHT).map((c) => c.luminance)),
});

async function audit(id: string, preset: string | undefined) {
  const mounted = await mountHeadless(id, { width: WIDTH, height: HEIGHT, preset });
  mounted.hold();
  const first = measure(await mounted.read());
  let brightest = 0;
  for (let frame = 0; frame < 60 * 3; frame++) {
    mounted.step();
    brightest = Math.max(brightest, measure(await mounted.read()).mean);
  }
  mounted.hold();
  const later = measure(await mounted.read());
  mounted.destroy();
  return { first, later, brightest };
}

describe.skipIf(process.env.FLASH_SWEEP === '0')('held frames (reduced motion)', () => {
  it.each(listEffects().map((meta) => [meta.id]))(
    '%s holds its subject, never a frozen flash',
    async (id) => {
      const effect = await loadEffect(id);
      for (const preset of [undefined, ...Object.keys(effect.presets ?? {})]) {
        const { first, later, brightest } = await audit(id, preset);
        const name = `${id} (${preset ?? 'defaults'})`;
        for (const [when, held] of [
          ['first frame', first],
          ['paused later', later],
        ] as const) {
          // Something stands out: an orb, a glint, a lit halo, not an empty plate.
          expect(held.peak, `${name}, ${when}: nothing to see`).toBeGreaterThan(0.15);
        }
        // The first held frame is the moment the first played frame shows, so it can be compared
        // with the run: no brighter than the effect ever is while playing. (A later frame has
        // moved on, so it cannot.)
        expect(first.mean, `${name}: brighter held than it plays`).toBeLessThanOrEqual(
          brightest * 1.02 + 0.002,
        );
      }
    },
  );
});
