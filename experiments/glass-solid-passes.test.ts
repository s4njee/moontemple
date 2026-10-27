import { it } from 'vitest';
import { mountHeadless } from '../tests/headless.ts';
import type { PassProfiler } from '../src/gpu/profiler.ts';

// Per-pass GPU time of glass-solid (one frame, median of 20), to see where its time goes.
//   npx vitest run --config experiments/vite.config.ts experiments/glass-solid-passes.test.ts

it('times each pass', { timeout: 600_000 }, async () => {
  const adapter = (await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }))!;
  const device = await adapter.requestDevice({ requiredFeatures: ['timestamp-query'] });
  const querySet = device.createQuerySet({ type: 'timestamp', count: 64 });
  const resolve = device.createBuffer({
    size: 512,
    usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
  });
  const read = device.createBuffer({
    size: 512,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  let labels: string[] = [];
  const profiler: PassProfiler = {
    pass(label: string) {
      const i = labels.push(label) - 1;
      return { querySet, beginningOfPassWriteIndex: i * 2, endOfPassWriteIndex: i * 2 + 1 };
    },
  } as PassProfiler;
  for (const [width, height, params] of [
    [1920, 1080, {}],
    [1920, 1080, { size: 0.1, caustics: 'off' }],
    [1920, 1080, { sampling: 'three-channel', samples: 1 }],
    [1920, 1080, { caustics: 'traced' }],
    [1920, 1080, { resolution: 0.5 }],
    [1920, 1080, { resolution: 0.5, samples: 1 }],
    [1920, 1080, { resolution: 0.5, sampling: 'three-channel', samples: 1 }],
    [390, 844, {}],
  ] as const) {
    const mounted = await mountHeadless('glass-solid', { width, height, device, profiler, params });
    const times: Record<string, number[]> = {};
    for (let f = 0; f < 30; f++) {
      labels = [];
      const encoder = device.createCommandEncoder();
      mounted.encode(encoder);
      encoder.resolveQuerySet(querySet, 0, labels.length * 2, resolve, 0);
      encoder.copyBufferToBuffer(resolve, 0, read, 0, labels.length * 16);
      device.queue.submit([encoder.finish()]);
      await read.mapAsync(GPUMapMode.READ, 0, labels.length * 16);
      const v = new BigUint64Array(read.getMappedRange(0, labels.length * 16));
      if (f >= 10)
        labels.forEach((l, i) => (times[l] ??= []).push(Number(v[i * 2 + 1]! - v[i * 2]!) / 1e6));
      read.unmap();
    }
    mounted.destroy();
    const med = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1]!;
    console.log(
      `${width}x${height} ${JSON.stringify(params)}: ` +
        Object.entries(times)
          .map(([l, t]) => `${l} ${med(t).toFixed(2)}`)
          .join(', '),
    );
  }
});
