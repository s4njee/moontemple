import { it } from 'vitest';
import {
  faceFrames,
  onSolid,
  solidPlanes,
  solidVertices,
  texelPoint,
  traceCaustics,
  type Vec3,
} from '../src/gpu/glass/solid.ts';
import { flintIndex } from '../src/gpu/optics/spectral.ts';

// Story 9.5: do the caustics of a glass icosahedron gather at its corners? Light from 30 random
// directions traced into the CPU caustic atlas; for each, the mean distance from the nearest corner
// of the brightest 1% of texels, over that of all texels (below 1: nearer the corners).
//
//   npx vitest run --config experiments/vite.config.ts experiments/glass-caustics-survey.test.ts

it('surveys where the caustics gather', { timeout: 600_000 }, () => {
  const planes = solidPlanes('icosahedron');
  const vertices = solidVertices(planes);
  const frames = faceFrames(planes, vertices);
  const tile = 32;
  const edge = Math.min(
    ...vertices.slice(1).map((v) => Math.hypot(...v.map((x, i) => x - vertices[0]![i]!))),
  );
  const cells: { index: number; d: number }[] = [];
  frames.forEach((frame, f) => {
    for (let y = 0; y < tile; y++) {
      for (let x = 0; x < tile; x++) {
        const p = texelPoint(frame, tile, x, y);
        if (!onSolid(planes, p)) continue;
        const d = Math.min(...vertices.map((v) => Math.hypot(...v.map((c, i) => c - p[i]!))));
        cells.push({ index: (f * tile + y) * tile + x, d: d / edge });
      }
    }
  });
  const all = cells.reduce((s, c) => s + c.d, 0) / cells.length;
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (const minBounce of [0, 1, 2]) {
    const ratios: number[] = [];
    const peaks: number[] = [];
    for (let k = 0; k < 30; k++) {
      const z = 2 * random() - 1;
      const a = 2 * Math.PI * random();
      const light: Vec3 = [
        Math.sqrt(1 - z * z) * Math.cos(a),
        Math.sqrt(1 - z * z) * Math.sin(a),
        z,
      ];
      const grid = traceCaustics(planes, frames, {
        n: flintIndex(550),
        light,
        rays: 100000,
        tile,
        minBounce,
        random,
      });
      const ranked = cells.map((c) => ({ v: grid[c.index]!, d: c.d })).sort((p, q) => q.v - p.v);
      const top = ranked.slice(0, Math.ceil(ranked.length / 100));
      ratios.push(top.reduce((s, c) => s + c.d, 0) / top.length / all);
      peaks.push(top[0]!.v / (ranked.reduce((s, c) => s + c.v, 0) / ranked.length));
    }
    ratios.sort((p, q) => p - q);
    peaks.sort((p, q) => p - q);
    console.log(
      `light after >= ${minBounce} reflections: corner-distance ratio median ${ratios[15]!.toFixed(2)} ` +
        `(min ${ratios[0]!.toFixed(2)}, max ${ratios[29]!.toFixed(2)}, ${ratios.filter((r) => r < 0.8).length}/30 under 0.8); ` +
        `peak / mean median ${peaks[15]!.toFixed(1)}`,
    );
  }
});
