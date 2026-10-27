import { it } from 'vitest';
import { createBenchDevice } from '../tests/bench.ts';
import { mountHeadless } from '../tests/headless.ts';

// Stories 9.4 and 9.5: what the traced glass body costs, spectral against three channels, and the
// two kinds of caustics. Dawn on the local adapter, the bench harness's marginal frame time.
//
//   npx vitest run --config experiments/vite.config.ts experiments/glass-solid-cost.test.ts

const CONFIGS: { name: string; params: Record<string, unknown> }[] = [
  { name: 'default (half res, spectral 2 heroes, stand-in)', params: {} },
  { name: 'half res, spectral 1 hero', params: { samples: 1 } },
  { name: 'half res, three channels 1 sample', params: { sampling: 'three-channel', samples: 1 } },
  { name: 'half res, three channels 2 samples', params: { sampling: 'three-channel', samples: 2 } },
  { name: 'half res, caustics off', params: { caustics: 'off' } },
  { name: 'half res, traced caustics', params: { caustics: 'traced' } },
  { name: 'half res, 2 bounces', params: { bounces: 2 } },
  { name: 'half res, 8 bounces', params: { bounces: 8 } },
  { name: 'half res, thin film', params: { film: true } },
  { name: 'full res, spectral 2 heroes', params: { resolution: 1 } },
  {
    name: 'full res, three channels 1 sample',
    params: { resolution: 1, sampling: 'three-channel', samples: 1 },
  },
  { name: 'backdrop and tail (no solid in view)', params: { size: 0.1, caustics: 'off' } },
];

it('measures the glass body', { timeout: 600_000 }, async () => {
  const bench = await createBenchDevice();
  const lines: string[] = [];
  for (const [width, height] of [
    [1920, 1080],
    [390, 844],
  ] as const) {
    for (const config of CONFIGS) {
      const mounted = await mountHeadless('glass-solid', {
        width,
        height,
        device: bench.device,
        profiler: bench.profiler,
        params: config.params,
      });
      const m = await bench.measure((encoder) => mounted.encode(encoder));
      mounted.destroy();
      lines.push(
        `${width}x${height}  ${config.name.padEnd(48)} ${m.slopeMs.toFixed(2)} ms (span ${m.spanMs.toFixed(2)}, ${m.metric})`,
      );
    }
  }
  console.log(
    `\n${bench.adapter.info?.description ?? ''} ${bench.adapter.info?.architecture ?? ''}\n${lines.join('\n')}`,
  );
  bench.destroy();
});
