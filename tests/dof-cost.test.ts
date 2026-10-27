import { describe, it, vi } from 'vitest';
import { DOF_METHODS } from '../src/gpu/dof/index.ts';
import { createDofScene } from '../src/gpu/dof/scene.ts';
import { lensFromCamera } from '../src/gpu/optics/lens.ts';
import { createRenderTarget } from '../src/gpu/targets.ts';
import { createBenchDevice } from './bench.ts';
import { ROUND } from './dof-score.ts';

// Story 3.9: the cost of each depth-of-field method alone, on the night shot's sharp image, without
// the traced scene or the tail that dof-lab's rows in the study include. Run on demand, with nothing
// else on the GPU: DOF_COST=<file> npx vitest run tests/dof-cost.test.ts

vi.setConfig({ testTimeout: 600_000 });
const OUT = process.env.DOF_COST;

describe.skipIf(!OUT)('depth-of-field method cost', () => {
  it('times every method', async () => {
    const bench = await createBenchDevice();
    const { device } = bench;
    const rows: string[] = [];
    for (const [width, height] of [
      [1920, 1080],
      [1266, 585],
    ] as const) {
      for (const focus of [2.5, 40]) {
        const lens = lensFromCamera({
          focalLength: 85,
          fNumber: 1.8,
          focusDistance: focus,
          imageHeight: height,
        });
        const scene = createDofScene(device);
        scene.resize(width, height);
        scene.set({ lens, aperture: ROUND, shot: 'night' });
        const encoder = device.createCommandEncoder();
        scene.renderPinhole(encoder);
        device.queue.submit([encoder.finish()]);
        const output = createRenderTarget(device, {
          label: 'cost output',
          format: 'rgba16float',
          width,
          height,
        });
        for (const [name, factory] of Object.entries(DOF_METHODS)) {
          const method = factory(device);
          method.resize(width, height);
          const input = { colour: scene.colour.view, depth: scene.depth.view, width, height };
          const m = await bench.measure((e) =>
            method.encode(e, input, output.view, { lens, aperture: ROUND }, bench.profiler),
          );
          rows.push(
            `| ${width} × ${height} | ${focus} m | ${name} | ${m.passes} | ${m.slopeMs.toFixed(2)} | ${m.slopeMinMs.toFixed(2)} to ${m.slopeMaxMs.toFixed(2)} |`,
          );
          method.destroy();
        }
        output.destroy();
        scene.destroy();
      }
    }
    (await import('node:fs')).writeFileSync(OUT!, rows.join('\n') + '\n');
    bench.destroy();
  });
});
