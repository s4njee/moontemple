import { writeFileSync } from 'node:fs';
import { describe, it, vi } from 'vitest';
import { measureFlashes } from '../tests/flash.ts';

// Story 10.8: how fast may a bright glass solid turn in front of a light? Turning, its faces swing
// the horizon and the moon's reflections across large areas of the frame, which is exactly what the
// flash analyser counts. The showpiece and the glass solid at rising turn speeds, and with a
// brighter moon, six seconds each at the analyser's usual 480 x 270 standing for 1080p. Writes
// docs/studies/glass-flash.md.
//
//   npx vitest run --config experiments/vite.config.ts experiments/glass-flash.test.ts

vi.setConfig({ testTimeout: 1_800_000 });

const CASES: { id: string; label: string; params: Record<string, unknown> }[] = [];
for (const turnSpeed of [0.1, 0.3, 0.6]) {
  CASES.push({ id: 'prism-icosahedron', label: `turn ${turnSpeed} rad/s`, params: { turnSpeed } });
  CASES.push({ id: 'glass-solid', label: `turn ${turnSpeed} rad/s`, params: { turnSpeed } });
}
CASES.push({
  id: 'prism-icosahedron',
  label: 'turn 0.6 rad/s, moon 100',
  params: { turnSpeed: 0.6, moon: 100 },
});
CASES.push({
  id: 'glass-solid',
  label: 'turn 0.6 rad/s, moon 100',
  params: { turnSpeed: 0.6, moon: 100 },
});

describe('glass and flash', () => {
  it('measures the turn speeds', async () => {
    const rows: string[] = [];
    for (const c of CASES) {
      const report = await measureFlashes(c.id, { params: c.params, seconds: 6 });
      const row = `| ${c.id} | ${c.label} | ${report.verdict} | ${report.peakCellFlashes} | ${Math.round(report.flashingAreaPx)} px² | ${report.frameFlashes} | ${report.frameLuminanceRange.toFixed(3)} |`;
      rows.push(row);
      console.log(row);
    }
    writeFileSync(
      'docs/studies/glass-flash.md',
      [
        '# Glass and flash',
        '',
        'Story 10.8. The flash analyser (`tests/flash.ts`) over the turning glass, six seconds a case at 480 × 270 standing for 1080p. Re-run with `npx vitest run --config experiments/vite.config.ts experiments/glass-flash.test.ts`.',
        '',
        '| Effect | Case | Verdict | Most flashes in a cell in a second | Largest area flashing over 3/s | Whole-frame flashes | Frame luminance swing |',
        '| --- | --- | --- | ---: | ---: | ---: | ---: |',
        ...rows,
        '',
      ].join('\n'),
    );
  });
});
