import { describe, expect, it } from 'vitest';
import { buildLanterns } from '../src/effects/focus-cursor/index.ts';
import { mountHeadless, sendPointer } from './headless.ts';

// Story 6.3: the focus racks to the lantern under the pointer, and wanders on its own without one.
// Synthetic pointer events, not a real hand.

describe('focus cursor', () => {
  it('focuses on a lantern under the pointer, and on another when it moves', async () => {
    const mounted = await mountHeadless('focus-cursor', { width: 320, height: 180 });
    const depths = buildLanterns(Number(mounted.params.lanterns)).map((l) => l.z);
    const focus = () => Number(mounted.instance.stats!()['focus (m)']);
    const onALantern = (value: number) => depths.some((z) => Math.abs(value / z - 1) < 0.01);

    sendPointer(mounted.canvas, 'pointerenter', 0.5, 0.5);
    const seen = new Set<string>();
    let at = 0;
    for (const [x, y] of [
      [0.2, 0.3],
      [0.8, 0.7],
      [0.5, 0.5],
      [0.35, 0.65],
      [0.65, 0.35],
    ] as const) {
      sendPointer(mounted.canvas, 'pointermove', x, y);
      at += 2;
      await mounted.runTo(at);
      expect(onALantern(focus()), `focus ${focus()} at ${x}, ${y}`).toBe(true);
      seen.add(focus().toFixed(2));
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
    mounted.destroy();
  });

  it('wanders between lanterns with no pointer', async () => {
    const mounted = await mountHeadless('focus-cursor', { width: 320, height: 180 });
    const seen = new Set<string>();
    for (let t = 3; t <= 15; t += 3.5) {
      await mounted.runTo(t);
      seen.add(Number(mounted.instance.stats!()['focus (m)']).toFixed(1));
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
    mounted.destroy();
  });
});
