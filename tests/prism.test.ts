import { describe, expect, it, vi } from 'vitest';
import { createFullscreenPipeline, renderFullscreen } from '../src/gpu/fullscreen.ts';
import { traceRays, type Vec3 } from '../src/gpu/optics/glass.ts';
import { GLASSES } from '../src/gpu/optics/spectral.ts';
import prismTrace from '../src/effects/prism/prism-trace.wgsl';
import fullscreen from '../src/wgsl/fullscreen.wgsl';
import glass from '../src/wgsl/glass.wgsl';
import spectral from '../src/wgsl/spectral.wgsl';
import {
  camera,
  landing,
  layout,
  minimumDeviation,
  project,
  SCENE,
  SOURCES,
  TABLE_SIZE,
  TABLE_X0,
  TABLE_X1,
  tracePrism,
  unprojectToWall,
  worldPlanes,
  type PrismSettings,
} from '../src/effects/prism/scene.ts';
import { getTestDevice, readTexture } from './gpu.ts';
import { mountHeadless } from './headless.ts';

vi.setConfig({ testTimeout: 300_000 });

// Story 9.3: the prism. The scene is traced through 9.2's tracer; these check that the scene
// stands at minimum deviation, that the light on the wall is the beam's, that the shader's copy of
// the glass tracer gives what glass.wgsl gives, and that the picture puts each wavelength where the
// tracer says it lands.

const DEG = Math.PI / 180;
const WIDTH = 960;
const HEIGHT = 540;

const settings = (glass: PrismSettings['glass'], extra: Partial<PrismSettings> = {}) =>
  ({
    glass,
    apex: glass === 'diamond' ? 40 : 60,
    turn: 0,
    slit: 0.05,
    source: 'white',
    haze: 0,
    ...extra,
  }) satisfies PrismSettings;

/** The direction the centre of the beam leaves the prism at `nm`, straight through. */
function exitRay(s: PrismSettings, nm: number) {
  const lay = layout(s.glass, s.apex);
  const back: Vec3 = [
    lay.entry[0] - 3 * lay.beamDir[0],
    lay.entry[1],
    lay.entry[2] - 3 * lay.beamDir[2],
  ];
  return traceRays(
    worldPlanes(s.glass, s.apex, s.turn),
    back,
    lay.beamDir,
    GLASSES[s.glass](nm),
  ).find((r) => r.bounces === 0)!;
}

function deviation(s: PrismSettings, nm: number): number {
  const lay = layout(s.glass, s.apex);
  const out = exitRay(s, nm).dir;
  return Math.acos(Math.min(1, out[0] * lay.beamDir[0] + out[2] * lay.beamDir[2]));
}

/** Where every ray of `nm` that reaches the wall with more than 1% of the light lands, in pixels. */
function wallImages(s: PrismSettings, nm: number): number[] {
  const lay = layout(s.glass, s.apex);
  const back: Vec3 = [
    lay.entry[0] - 3 * lay.beamDir[0],
    lay.entry[1],
    lay.entry[2] - 3 * lay.beamDir[2],
  ];
  const cam = camera(WIDTH, HEIGHT);
  return traceRays(worldPlanes(s.glass, s.apex, s.turn), back, lay.beamDir, GLASSES[s.glass](nm))
    .filter((r) => r.weight > 0.01 && r.dir[2] < -1e-6)
    .map((r) => {
      const t = (SCENE.wallZ - r.from[2]) / r.dir[2];
      return project(cam, [r.from[0] + t * r.dir[0], lay.entry[1], SCENE.wallZ], WIDTH, HEIGHT)[0];
    });
}

const srgbToLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

describe('the prism scene', () => {
  it('stands at minimum deviation for the sodium line, and turning it either way bends more', () => {
    for (const glass of ['crown', 'flint', 'diamond'] as const) {
      const s = settings(glass);
      const at = deviation(s, SCENE.referenceNm);
      const textbook = minimumDeviation(GLASSES[glass](SCENE.referenceNm), s.apex * DEG)!;
      expect(at / DEG, glass).toBeCloseTo(textbook / DEG, 3);
      for (const turn of [-6, -2, -0.5, 0.5, 2, 6]) {
        expect(deviation({ ...s, turn }, SCENE.referenceNm), `${glass} ${turn}`).toBeGreaterThan(
          at,
        );
      }
    }
    // The BK7 figure from tests/glass.test.ts, through the scene's own geometry.
    expect(deviation(settings('crown'), 589.3) / DEG).toBeCloseTo(38.65, 1);
  });

  it('puts white light on the wall: every wavelength in, the faces taking only their reflections', () => {
    for (const glass of ['crown', 'flint', 'diamond'] as const) {
      const state = tracePrism(settings(glass));
      const dx = (TABLE_X1 - TABLE_X0) / TABLE_SIZE;
      const sum = [0, 0, 0];
      for (let i = 0; i < TABLE_SIZE; i++) {
        for (let c = 0; c < 3; c++) sum[c]! += state.table[i * 4 + c]! * dx;
      }
      // The table is what the tracer says reaches the wall: equal to the power it reports.
      for (let c = 0; c < 3; c++) expect(sum[c]! / state.wallPower[c]!).toBeCloseTo(1, 4);
      // White: the channels agree to 1% (Fresnel barely changes across the spectrum).
      const mean = (sum[0]! + sum[1]! + sum[2]!) / 3;
      for (const v of sum) expect(Math.abs(v / mean - 1), glass).toBeLessThan(0.01);
      // Two faces' reflections lost: (1 - R)^2 at minimum deviation, plus a little that reaches
      // the wall after reflecting inside.
      const n = GLASSES[glass](550);
      const lay = layout(glass, glass === 'diamond' ? 40 : 60);
      const incidence = (lay.deviation + (glass === 'diamond' ? 40 : 60) * DEG) / 2;
      const cos = Math.cos(incidence);
      const sin = Math.sin(incidence) / n;
      const cosT = Math.sqrt(1 - sin * sin);
      const rs = ((cos - n * cosT) / (cos + n * cosT)) ** 2;
      const rp = ((cosT - n * cos) / (cosT + n * cos)) ** 2;
      const through = (1 - (rs + rp) / 2) ** 2;
      expect(mean / SCENE.power, glass).toBeGreaterThan(through * 0.98);
      expect(mean / SCENE.power, glass).toBeLessThan(1);
    }
  });

  it('spreads the band as wide as the glass disperses it: diamond > flint > crown', () => {
    const spread = (glass: 'crown' | 'flint' | 'diamond') =>
      deviation(settings(glass), 410.2) - deviation(settings(glass), 656.3);
    // Crown: the textbook's 0.71 degrees from 486 to 656 nm is 1.2 from 410 to 656.
    expect(spread('crown') / DEG).toBeGreaterThan(1.1);
    expect(spread('crown') / DEG).toBeLessThan(1.35);
    expect(spread('flint')).toBeGreaterThan(1.8 * spread('crown'));
    expect(spread('diamond')).toBeGreaterThan(spread('flint'));
  });
});

describe("the shader's prism tracer", () => {
  it("gives the same light as glass.wgsl's glass_trace, and as the TypeScript tracer", async () => {
    const device = await getTestDevice();
    const planes = worldPlanes('flint', 60, 7);
    // Rays through the prism from the beam's side, the camera's side and above, and one that misses.
    const cases: { o: Vec3; d: Vec3; nm: number }[] = [];
    const starts: Vec3[] = [
      [-3, 0.55, 0.4],
      [1.6, 2.3, 4.8],
      [0.3, 4, 0.2],
      [3, 0.3, -2],
      [-3, 3, 3],
    ];
    for (const nm of [450, 550, 650]) {
      for (const [i, o] of starts.entries()) {
        const aim: Vec3 = [0.1 * i - 0.2, 0.5 + 0.05 * i, 0.1 - 0.05 * i];
        const v: Vec3 = [aim[0] - o[0], aim[1] - o[1], aim[2] - o[2]];
        const l = Math.hypot(...v);
        cases.push({ o, d: [v[0] / l, v[1] / l, v[2] / l], nm });
      }
    }
    cases.push({ o: [0, 3, 3], d: [0, 0, -1], nm: 550 });
    const env = (d: readonly number[], nm: number) =>
      0.2 + Math.max(d[1]!, 0) + 2 * Math.exp(-((d[0]! / 0.3) ** 2)) * (nm / 700);
    const vec4 = (p: readonly number[]) => `vec4f(${p.map((v) => v.toFixed(7)).join(', ')})`;
    const pipeline = createFullscreenPipeline(device, {
      fragment: {
        label: 'prism trace test',
        code: `#include "fullscreen.wgsl"
#include "spectral.wgsl"
#include "glass.wgsl"
#include "prism-trace.wgsl"
var<private> PLANES: array<vec4f, ${planes.length}> = array(${planes.map(vec4).join(', ')});
fn prism_plane(i: u32) -> vec4f { return PLANES[i]; }
fn prism_plane_count() -> u32 { return ${planes.length}u; }
fn glass_environment(d: vec3f, nm: f32) -> f32 {
  return 0.2 + max(d.y, 0.0) + 2.0 * exp(-(d.x / 0.3) * (d.x / 0.3)) * (nm / 700.0);
}
@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  let origins = array(${cases.map((c) => vec4([...c.o, c.nm])).join(', ')});
  let dirs = array(${cases.map((c) => vec4([...c.d, 0])).join(', ')});
  let c = origins[u32(in.position.x)];
  let d = dirs[u32(in.position.x)].xyz;
  let n = glass_index(1u, c.w);
  return vec4f(glass_trace(c.xyz, d, c.w, n, 0.0), prism_trace(c.xyz, d, c.w, n), 0.0, 1.0);
}`,
        chunks: {
          ...fullscreen.chunks,
          'fullscreen.wgsl': fullscreen.code,
          'spectral.wgsl': spectral.code,
          'glass.wgsl': glass.code,
          'prism-trace.wgsl': prismTrace.code,
        },
      },
      format: 'rgba32float',
    });
    const texture = device.createTexture({
      size: [cases.length, 1],
      format: 'rgba32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const encoder = device.createCommandEncoder();
    renderFullscreen(encoder, texture.createView(), pipeline, []);
    device.queue.submit([encoder.finish()]);
    const values = new Float32Array((await readTexture(device, texture, 16)).buffer);
    texture.destroy();
    let hits = 0;
    cases.forEach((c, i) => {
      const reference = values[i * 4]!;
      const ours = values[i * 4 + 1]!;
      expect(ours / reference, `case ${i}`).toBeCloseTo(1, 5);
      const rays = traceRays(planes, c.o, c.d, GLASSES.flint(c.nm), 6);
      if (rays.length) hits++;
      const want = rays.length
        ? rays.reduce((sum, r) => sum + r.weight * env(r.dir, c.nm), 0)
        : env(c.d, c.nm);
      expect(ours / want, `case ${i} against TypeScript`).toBeCloseTo(1, 2);
    });
    expect(hits).toBeGreaterThan(cases.length / 2);
  });
});

describe('the rendered spectrum', () => {
  it.each(['crown', 'flint', 'diamond'] as const)(
    "%s: each hydrogen line lands within a pixel of the tracer's prediction",
    async (glass) => {
      const s = settings(glass, { source: 'hydrogen', slit: 0.01 });
      const mounted = await mountHeadless('prism', {
        width: WIDTH,
        height: HEIGHT,
        params: {
          glass,
          apex: s.apex,
          source: 'hydrogen',
          slit: s.slit,
          sweep: 0,
          haze: 0,
          bloom: 0,
          exposure: 1,
        },
      });
      mounted.step();
      const rgba = await mounted.read();
      mounted.destroy();

      const cam = camera(WIDTH, HEIGHT);
      const lines = SOURCES.hydrogen.map(([nm]) => nm);
      const predicted = lines.map((nm) => project(cam, landing(s, nm)!, WIDTH, HEIGHT));
      const row = Math.round(predicted[0]![1] - 0.5);
      const light = Array.from({ length: WIDTH }, (_, x) => {
        const i = (row * WIDTH + x) * 4;
        return srgbToLinear(rgba[i]!) + srgbToLinear(rgba[i + 1]!) + srgbToLinear(rgba[i + 2]!);
      });
      const sorted = [...light].sort((a, b) => a - b);
      const floor = sorted[Math.floor(WIDTH / 2)]!;
      // Every other image on the wall carrying more than 1% of the beam: the other lines, and the
      // faint, nearly undispersed copies that leave after reflecting inside. Each window reaches
      // half way to the nearest, so it sees one line.
      const xs = predicted.map((p) => p[0]);
      const images = lines.flatMap((nm) => wallImages(s, nm));
      const measured = xs.map((x, i) => {
        const gap = Math.min(
          ...images
            .filter((other) => Math.abs(other - x) > 1e-3)
            .map((other) => Math.abs(other - x)),
        );
        const reach = Math.max(1.5, Math.min(8, gap / 2));
        let sum = 0;
        let moment = 0;
        for (let px = Math.floor(x - reach); px <= Math.ceil(x + reach); px++) {
          const v = Math.max(light[px]! - floor, 0);
          sum += v;
          moment += v * (px + 0.5);
        }
        expect(sum, `${glass} ${lines[i]} nm: nothing there`).toBeGreaterThan(0.02);
        return moment / sum;
      });
      measured.forEach((x, i) => {
        const off = Math.abs(x - xs[i]!);
        expect(off, `${glass} ${lines[i]} nm at ${x}, predicted ${xs[i]}`).toBeLessThan(1);
      });

      // The angle between H-alpha and H-delta as they leave the prism, from where the picture shows
      // them on the wall, against the tracer's deviations.
      const angleTo = (nm: number, px: number) => {
        const exit = exitRay(s, nm).from;
        const wall = unprojectToWall(cam, px, predicted[0]![1], WIDTH, HEIGHT);
        return Math.atan2(wall[0] - exit[0], -(wall[2] - exit[2]));
      };
      const seen = angleTo(656.3, measured[0]!) - angleTo(410.2, measured[3]!);
      const traced = deviation(s, 410.2) - deviation(s, 656.3);
      // Measured: 1.348° against 1.349° (crown), 3.415 against 3.405 (flint), 3.587 against 3.583.
      expect(seen / traced, glass).toBeCloseTo(1, 2);
    },
  );
});
