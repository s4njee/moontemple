import { describe, expect, it } from 'vitest';
import { createFullscreenPipeline, renderFullscreen } from '../src/gpu/fullscreen.ts';
import {
  fresnel,
  interval,
  packSolid,
  platonicPlanes,
  prismPlanes,
  traceRays,
  type Plane,
  type Vec3,
} from '../src/gpu/optics/glass.ts';
import {
  bk7Index,
  heroToRgb,
  heroWavelengths,
  spectralRgb,
  spectralWhite,
} from '../src/gpu/optics/spectral.ts';
import fullscreen from '../src/wgsl/fullscreen.wgsl';
import glass from '../src/wgsl/glass.wgsl';
import spectral from '../src/wgsl/spectral.wgsl';
import { getTestDevice, readTexture } from './gpu.ts';

// Stories 9.1 and 9.2: spectral sampling, and refraction through glass with dispersion.

const DEG = Math.PI / 180;

/** Deviation of a ray straight through a 60 degree prism's two faces, at incidence `deg` on the first. */
function prismDeviation(planes: readonly Plane[], n: number, deg: number): number | undefined {
  // The left face's outward normal, and a ray coming at it from outside at `deg` from that normal.
  const nl = planes[0]!;
  const a = deg * DEG;
  // Rotate -normal by `a` about z, towards the base.
  const c = Math.cos(a);
  const s = Math.sin(a);
  const d: Vec3 = [-(nl[0] * c - nl[1] * s), -(nl[0] * s + nl[1] * c), 0];
  const o: Vec3 = [-3 * d[0], -3 * d[1], 0];
  const through = traceRays(planes, o, d, n, 0).find((r) => r.bounces === 0);
  if (!through || through.weight < 1e-6) return undefined;
  const cos = Math.min(1, Math.max(-1, d[0] * through.dir[0] + d[1] * through.dir[1]));
  return Math.acos(cos) / DEG;
}

function minimumDeviation(n: number): number {
  const planes = prismPlanes(60, 1, 2);
  let best = Infinity;
  for (let deg = 20; deg <= 85; deg += 0.005) {
    const dev = prismDeviation(planes, n, deg);
    if (dev !== undefined) best = Math.min(best, dev);
  }
  return best;
}

describe('spectral sampling', () => {
  it('a flat spectrum integrates to white', () => {
    const sum = [0, 0, 0];
    const count = 400;
    for (let i = 0; i < count; i++) {
      const rgb = heroToRgb(heroWavelengths((i + 0.5) / count), [1, 1, 1, 1]);
      for (let c = 0; c < 3; c++) sum[c]! += rgb[c]! / count;
    }
    for (const v of sum) expect(v).toBeCloseTo(1, 2);
  });

  it('keeps every wavelength inside sRGB once the tonemap clips: nothing negative', () => {
    for (let nm = 380; nm <= 720; nm += 0.5) {
      for (const v of spectralRgb(nm)) expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('the four hero wavelengths span the range a quarter apart', () => {
    const nm = heroWavelengths(0.9);
    const sorted = [...nm].sort((a, b) => a - b);
    for (let i = 1; i < 4; i++) expect(sorted[i]! - sorted[i - 1]!).toBeCloseTo(75, 6);
  });
});

describe('glass', () => {
  it('Fresnel: 4% at normal incidence on n = 1.5, total reflection past the critical angle', () => {
    expect(fresnel(1, 1, 1.5)).toBeCloseTo(0.04, 4);
    const critical = Math.asin(1 / 1.5) / DEG;
    expect(fresnel(Math.cos((critical + 0.1) * DEG), 1.5, 1)).toBe(1);
    expect(fresnel(Math.cos((critical - 0.1) * DEG), 1.5, 1)).toBeLessThan(1);
  });

  it("a BK7 prism's minimum deviation and spread match the textbook", () => {
    // D = 2 asin(n sin 30) - 60: 38.65 degrees at the sodium D line.
    const d = minimumDeviation(bk7Index(589.3));
    expect(d).toBeCloseTo((2 * Math.asin(bk7Index(589.3) * 0.5)) / DEG - 60, 2);
    expect(d).toBeCloseTo(38.65, 1);
    // From the F line (486.1 nm) to the C line (656.3 nm): about 0.72 degrees.
    const spread = minimumDeviation(bk7Index(486.1)) - minimumDeviation(bk7Index(656.3));
    expect(spread).toBeGreaterThan(0.68);
    expect(spread).toBeLessThan(0.76);
  });

  it('splitting at every surface conserves the light', () => {
    const planes = platonicPlanes('icosahedron');
    const rays = traceRays(planes, [0.13, -0.21, -4], [0, 0, 1], 1.5, 60);
    const total = rays.reduce((s, r) => s + r.weight, 0);
    expect(total).toBeGreaterThan(0.995);
    expect(total).toBeLessThan(1.0001);
  });

  it('the Platonic solids are the right size', () => {
    for (const solid of [
      'tetrahedron',
      'cube',
      'octahedron',
      'dodecahedron',
      'icosahedron',
    ] as const) {
      const planes = platonicPlanes(solid, 2);
      const counts = { tetrahedron: 4, cube: 6, octahedron: 8, dodecahedron: 12, icosahedron: 20 };
      expect(planes).toHaveLength(counts[solid]);
      // Along a face normal from the centre, the ray leaves at the inradius.
      const n = planes[0]!.slice(0, 3) as Vec3;
      const [, t1] = interval(planes, [0, 0, 0], n);
      expect(t1).toBeCloseTo(planes[0]![3], 6);
    }
  });

  it('the WGSL tracer matches its twin', async () => {
    const device = await getTestDevice();
    const planes = platonicPlanes('icosahedron', 1);
    // A simple environment: brighter above, a band at the horizon, wavelength-dependent.
    const env = (d: readonly number[], nm: number) =>
      0.2 + Math.max(d[1]!, 0) + 2 * Math.exp(-((d[1]! / 0.1) ** 2)) * (nm / 700);
    const cases: { o: Vec3; d: Vec3; nm: number }[] = [];
    for (const nm of [450, 550, 650]) {
      for (const [x, y] of [
        [0, 0],
        [0.3, 0.1],
        [-0.45, 0.35],
        [0.6, -0.2],
      ] as const) {
        cases.push({ o: [x, y, -4], d: [0, 0, 1], nm });
      }
    }
    const solid = Array.from(packSolid(planes).subarray(0, 80))
      .map((v) => v.toFixed(7))
      .join(', ');
    const lines = cases.map((c) => `vec4f(${c.o.join(', ')}, ${c.nm.toFixed(1)})`);
    const pipeline = createFullscreenPipeline(device, {
      fragment: {
        label: 'glass test',
        code: `#include "fullscreen.wgsl"
#include "spectral.wgsl"
#include "glass.wgsl"
fn glass_environment(d: vec3f, nm: f32) -> f32 {
  return 0.2 + max(d.y, 0.0) + 2.0 * exp(-(d.y / 0.1) * (d.y / 0.1)) * (nm / 700.0);
}
const PLANES = array<f32, 80>(${solid});
fn glass_plane(i: u32) -> vec4f {
  return vec4f(PLANES[i * 4u], PLANES[i * 4u + 1u], PLANES[i * 4u + 2u], PLANES[i * 4u + 3u]);
}
fn glass_plane_count() -> u32 {
  return ${planes.length}u;
}
@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  let cases = array(${lines.join(', ')});
  let c = cases[u32(in.position.x)];
  return vec4f(glass_trace(c.xyz, vec3f(0.0, 0.0, 1.0), c.w, glass_index(0u, c.w), 0.0), 0.0, 0.0, 1.0);
}`,
        chunks: {
          ...fullscreen.chunks,
          'fullscreen.wgsl': fullscreen.code,
          'spectral.wgsl': spectral.code,
          'glass.wgsl': glass.code,
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
    cases.forEach((c, i) => {
      const rays = traceRays(planes, c.o, c.d, bk7Index(c.nm), 6);
      const want = rays.length
        ? rays.reduce((s, r) => s + r.weight * env(r.dir, c.nm), 0)
        : env(c.d, c.nm);
      expect(values[i * 4]! / want, `case ${i}`).toBeCloseTo(1, 2);
    });
  });

  it('keeps the WGSL white point equal to the TypeScript one', () => {
    const white = spectralWhite(20000);
    const wgsl = /SPECTRAL_WHITE: vec3f = vec3f\(([^)]*)\)/
      .exec(spectral.code)![1]!
      .split(',')
      .map(Number);
    for (let c = 0; c < 3; c++) expect(wgsl[c]!).toBeCloseTo(white[c]!, 5);
  });
});
