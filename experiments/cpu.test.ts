import { it } from 'vitest';
import { mountHeadless } from '../tests/headless.ts';
// CPU time to build and encode a frame (no GPU wait), for the effects that build their points in JS.
it('cpu per frame', async () => {
  const out: string[] = [];
  for (const id of ['glitter', 'dust-in-light', 'night-street', 'fireflies', 'snow-at-night', 'bokeh-drift']) {
    const m = await mountHeadless(id, { width: 1920, height: 1080 });
    for (let i = 0; i < 30; i++) m.step();
    await m.device.queue.onSubmittedWorkDone();
    const times: number[] = [];
    for (let i = 0; i < 120; i++) {
      const enc = m.device.createCommandEncoder();
      const t0 = performance.now();
      m.encode(enc);
      times.push(performance.now() - t0);
      m.device.queue.submit([enc.finish()]);
      if (i % 20 === 0) await m.device.queue.onSubmittedWorkDone();
    }
    times.sort((a, b) => a - b);
    out.push(`${id} median ${times[60]!.toFixed(2)} ms p90 ${times[108]!.toFixed(2)} ms`);
    m.destroy();
  }
  (await import('node:fs')).writeFileSync('experiments/cpu.txt', out.join('\n'));
}, 600000);
