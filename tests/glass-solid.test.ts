import { describe, expect, it } from 'vitest';
import {
  CAUSTIC_TILE,
  createGlassBody,
  DEFAULT_KEY,
  type GlassBodyFrame,
} from '../src/gpu/glass/body.ts';
import {
  applyMat3,
  faceFrames,
  onSolid,
  solidPlanes,
  solidVertices,
  texelPoint,
  traceCaustics,
  transposeMat3,
  turn,
  upliftInverse,
  upliftWeights,
  viewRay,
  type FaceFrame,
  type GlassView,
  type Plane,
  type Vec3,
} from '../src/gpu/glass/solid.ts';
import { fresnel, packSolid, rotatePlanes, traceRays } from '../src/gpu/optics/glass.ts';
import {
  flintIndex,
  spectralRgb,
  spectralWhite,
  SPECTRUM_MAX,
  SPECTRUM_MIN,
} from '../src/gpu/optics/spectral.ts';
import { createFullscreenPipeline, renderFullscreen } from '../src/gpu/fullscreen.ts';
import fullscreen from '../src/wgsl/fullscreen.wgsl';
import glass from '../src/wgsl/glass.wgsl';
import glassBody from '../src/wgsl/glass-body.wgsl';
import spectral from '../src/wgsl/spectral.wgsl';
import thinfilm from '../src/wgsl/thinfilm.wgsl';
import { getTestDevice, readTexture } from './gpu.ts';

// Stories 9.4 to 9.6: the traced glass body, its caustics and its thin film.

type Rgb = [number, number, number];

/** IEEE half floats to numbers. */
function halfs(bytes: Uint8Array): Float32Array {
  const raw = new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  return Float32Array.from(raw, (h) => {
    const exponent = (h >> 10) & 31;
    const mantissa = h & 1023;
    const sign = h & 0x8000 ? -1 : 1;
    if (exponent === 0) return sign * mantissa * 2 ** -24;
    if (exponent === 31) return mantissa ? NaN : sign * Infinity;
    return sign * (1 + mantissa / 1024) * 2 ** (exponent - 15);
  });
}

/** The test backdrop the body shader calls 'gradient', and its CPU twin. */
const gradient = (d: readonly number[]): Rgb => {
  const sky = 0.2 + Math.max(d[1]!, 0);
  const band = 2 * Math.exp(-((d[1]! / 0.1) ** 2));
  return [sky * 1 + band * 0.3, sky * 0.6 + band * 0.6, sky * 0.3 + band * 1];
};
const GRADIENT_WGSL = `(0.2 + max(dir.y, 0.0)) * vec3f(1.0, 0.6, 0.3) + 2.0 * exp(-(dir.y / 0.1) * (dir.y / 0.1)) * vec3f(0.3, 0.6, 1.0)`;

const CHUNKS = {
  ...fullscreen.chunks,
  'fullscreen.wgsl': fullscreen.code,
  'spectral.wgsl': spectral.code,
  'glass.wgsl': glass.code,
  'thinfilm.wgsl': thinfilm.code,
  'glass-body.wgsl': glassBody.code,
};

/** Runs `body` (WGSL returning vec4f for case `i`) once per case and reads the results back. */
async function evaluate(count: number, body: string, prelude = ''): Promise<Float32Array> {
  const device = await getTestDevice();
  const pipeline = createFullscreenPipeline(device, {
    fragment: {
      label: 'glass-solid test',
      code: `#include "fullscreen.wgsl"
#include "spectral.wgsl"
#include "glass.wgsl"
#include "thinfilm.wgsl"
#include "glass-body.wgsl"
fn body_backdrop(dir: vec3f) -> vec3f { return ${GRADIENT_WGSL}; }
fn body_caustic(face: u32, p: vec3f) -> vec3f { return vec3f(0.0); }
${prelude}
@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  let i = u32(in.position.x);
  ${body}
}`,
      chunks: CHUNKS,
    },
    format: 'rgba32float',
  });
  const texture = device.createTexture({
    size: [count, 1],
    format: 'rgba32float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const encoder = device.createCommandEncoder();
  renderFullscreen(encoder, texture.createView(), pipeline, []);
  device.queue.submit([encoder.finish()]);
  const values = new Float32Array((await readTexture(device, texture, 16)).buffer);
  texture.destroy();
  return values;
}

const solidLiteral = (planes: readonly Plane[]) => {
  const p = Array.from(packSolid(planes).subarray(0, 80))
    .map((v) => v.toFixed(7))
    .join(', ');
  return `var<private> TEST_PLANES: array<f32, 80> = array<f32, 80>(${p});
fn body_plane(k: u32) -> vec4f {
  return vec4f(TEST_PLANES[k * 4u], TEST_PLANES[k * 4u + 1u], TEST_PLANES[k * 4u + 2u], TEST_PLANES[k * 4u + 3u]);
}
fn body_plane_count() -> u32 {
  return ${planes.length}u;
}`;
};

describe('spectral uplift', () => {
  const inverse = upliftInverse(20000);

  it('keeps the WGSL matrix equal to the TypeScript one', () => {
    const body = /BODY_UPLIFT: mat3x3f = mat3x3f\(([\s\S]*?)\);/.exec(glassBody.code)![1]!;
    const numbers = [...body.matchAll(/-?\d+\.\d+/g)].map((m) => Number(m[0]));
    expect(numbers).toHaveLength(9);
    for (let i = 0; i < 9; i++) expect(numbers[i]!).toBeCloseTo(inverse[i]!, 5);
  });

  it('uplifts white to a flat 1, and gives a colour back when integrated', () => {
    for (let nm = 400; nm <= 700; nm += 7) {
      const w = upliftWeights(nm, inverse);
      expect(w[0] + w[1] + w[2]).toBeCloseTo(1, 6);
    }
    const white = spectralWhite(6000);
    for (const rgb of [
      [0.3, 0.72, 1],
      [0.05, 0.13, 0.24],
      [1, 0.62, 0.32],
    ] as Rgb[]) {
      const out = [0, 0, 0];
      const steps = 6000;
      for (let s = 0; s < steps; s++) {
        const nm = SPECTRUM_MIN + ((s + 0.5) * (SPECTRUM_MAX - SPECTRUM_MIN)) / steps;
        const w = upliftWeights(nm, inverse);
        const radiance = w[0] * rgb[0] + w[1] * rgb[1] + w[2] * rgb[2];
        const c = spectralRgb(nm);
        for (let k = 0; k < 3; k++) out[k]! += (c[k]! / white[k]!) * (radiance / steps);
      }
      for (let k = 0; k < 3; k++) expect(out[k]!).toBeCloseTo(rgb[k]!, 3);
    }
  });
});

describe('body_trace', () => {
  it('matches traceRays against the same backdrop, one wavelength or one channel at a time', async () => {
    const planes = rotatePlanes(solidPlanes('icosahedron'), turn(0.7, 0.35));
    const inverse = upliftInverse(20000);
    const cases: {
      o: Vec3;
      d: Vec3;
      nm: number;
      channel: number;
      absorb: number;
      bounces: number;
    }[] = [];
    for (const [x, y] of [
      [0, 0],
      [0.31, 0.12],
      [-0.47, 0.33],
      [0.58, -0.22],
      [0.05, 0.71],
    ] as const) {
      cases.push({ o: [x, y, 4], d: [0, 0, -1], nm: 460, channel: -1, absorb: 0, bounces: 6 });
      cases.push({ o: [x, y, 4], d: [0, 0, -1], nm: 610, channel: -1, absorb: 0.4, bounces: 3 });
      cases.push({ o: [x, y, 4], d: [0, 0, -1], nm: 550, channel: 1, absorb: 0.2, bounces: 8 });
    }
    const literal = cases
      .map(
        (c) =>
          `array<f32, 9>(${[...c.o, c.nm, c.channel, c.absorb, c.bounces, 0, 0].map((v) => v.toFixed(4)).join(', ')})`,
      )
      .join(', ');
    const values = await evaluate(
      cases.length,
      `let all = array(${literal});
  let c = all[i];
  var w = body_weights(c[3]);
  if (c[4] >= 0.0) {
    w = vec3f(0.0);
    w[u32(c[4])] = 1.0;
  }
  let ray = BodyRay(w, c[3], glass_index(1u, c[3]), c[5], 0.0);
  let surface = BodySurface(i32(c[6]), 0.0, 1.33, 0.0, vec3f(0.0, 1.0, 0.0), 0.0);
  return vec4f(body_trace(vec3f(c[0], c[1], c[2]), vec3f(0.0, 0.0, -1.0), ray, surface), 0.0, 0.0, 1.0);`,
      solidLiteral(planes),
    );
    cases.forEach((c, i) => {
      const weights =
        c.channel >= 0
          ? ([0, 1, 2].map((k) => (k === c.channel ? 1 : 0)) as Rgb)
          : upliftWeights(c.nm, inverse);
      const env = (d: readonly number[]) => {
        const rgb = gradient(d);
        return Math.max(0, weights[0] * rgb[0] + weights[1] * rgb[1] + weights[2] * rgb[2]);
      };
      const rays = traceRays(planes, c.o, c.d, flintIndex(c.nm), c.bounces, c.absorb);
      const want = rays.length ? rays.reduce((s, r) => s + r.weight * env(r.dir), 0) : env(c.d);
      // Relative, but some wavelengths see none of a saturated backdrop at all.
      expect(Math.abs(values[i * 4]! - want), `case ${i}`).toBeLessThan(0.005 * want + 1e-5);
    });
  });

  it('a soap film: no thickness is bare Fresnel, and a film in air follows the Airy formula', async () => {
    const cases = [
      // cos, n1, nf, n3, thickness, nm
      [1, 1, 1.33, 1.52, 0, 550],
      [0.6, 1, 1.33, 1.52, 0, 550],
      [0.3, 1.52, 1.33, 1, 0, 500],
      [1, 1, 1.33, 1, 380, 450],
      [1, 1, 1.33, 1, 380, 550],
      [1, 1, 1.33, 1, 380, 650],
      [1, 1, 1.33, 1, 120, 600],
    ];
    const literal = cases.map((c) => `array<f32, 6>(${c.map((v) => v.toFixed(4)).join(', ')})`);
    const values = await evaluate(
      cases.length,
      `let all = array(${literal.join(', ')});
  let c = all[i];
  return vec4f(thin_film_reflectance(c[0], c[1], c[2], c[3], c[4], c[5]), 0.0, 0.0, 1.0);`,
      solidLiteral(solidPlanes('cube')),
    );
    cases.forEach(([cos, n1, nf, n3, d, nm], i) => {
      let want: number;
      if (d === 0) want = fresnel(cos!, n1!, n3!);
      else {
        // Symmetric film at normal incidence: R = F / (1 + F) with F = 4 R0 sin^2(delta / 2) / (1 - R0)^2.
        const r0 = ((nf! - 1) / (nf! + 1)) ** 2;
        const delta = (4 * Math.PI * nf! * d!) / nm!;
        const f = (4 * r0 * Math.sin(delta / 2) ** 2) / (1 - r0) ** 2;
        want = f / (1 + f);
      }
      expect(values[i * 4]!, `case ${i}`).toBeCloseTo(want, 4);
    });
  });
});

describe('the glass body', () => {
  const W = 96;
  const H = 64;
  const view: GlassView = { center: [W / 2, H / 2], size: 26, distance: 4 };
  const rotation = turn(0.9, 0.35);

  async function render(frame: Partial<GlassBodyFrame>, frames = 1) {
    const device = await getTestDevice();
    // The scene format the effect uses (blendable, unlike rgba32float).
    const body = createGlassBody(device, { format: 'rgba16float' });
    body.resize(W, H);
    const target = device.createTexture({
      size: [W, H],
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    for (let i = 0; i < frames; i++) {
      const encoder = device.createCommandEncoder();
      body.encode(encoder, target.createView(), {
        solid: 'icosahedron',
        rotation,
        view,
        frame: i,
        ...frame,
      });
      device.queue.submit([encoder.finish()]);
    }
    const pixels = halfs(await readTexture(device, target, 8));
    const caustics = await body.readCaustics();
    target.destroy();
    body.destroy();
    return { pixels, caustics };
  }

  it('a pixel through the body is the CPU trace of the same view ray', async () => {
    const { pixels } = await render({
      sampling: 'three-channel',
      samples: 1,
      bounces: 6,
      jitter: false,
      backdrop: 'gradient',
      caustics: 'off',
      glass: 'flint',
    });
    const planes = rotatePlanes(solidPlanes('icosahedron'), rotation);
    const nm = [650, 550, 450];
    let inside = 0;
    for (const [px, py] of [
      [48, 32],
      [40, 27],
      [55, 38],
      [60, 30],
      [10, 10],
    ] as const) {
      const { o, d } = viewRay(view, px + 0.5, py + 0.5);
      for (let c = 0; c < 3; c++) {
        const rays = traceRays(planes, o, d, flintIndex(nm[c]!), 6);
        if (rays.length && c === 0) inside++;
        const want = rays.length
          ? rays.reduce((s, r) => s + r.weight * gradient(r.dir)[c]!, 0)
          : gradient(d)[c]!;
        const got = pixels[(py * W + px) * 4 + c]!;
        expect(got / want, `pixel ${px},${py} channel ${c}`).toBeCloseTo(1, 2);
      }
    }
    expect(inside).toBe(4);
  });

  it('conserves light: with no absorption, white all round stays white through the glass', async () => {
    for (const sampling of ['spectral', 'three-channel'] as const) {
      const { pixels } = await render(
        {
          sampling,
          samples: 4,
          bounces: 8,
          backdrop: 'uniform',
          caustics: 'off',
          absorb: [0, 0, 0],
          glass: 'crown',
        },
        8,
      );
      let sum: Rgb = [0, 0, 0];
      let count = 0;
      for (let i = 0; i < W * H; i++) {
        if (pixels[i * 4 + 3]! < 0.999) continue;
        count++;
        sum = sum.map((v, c) => v + pixels[i * 4 + c]!) as Rgb;
      }
      expect(count).toBeGreaterThan(500);
      const mean = sum.map((v) => v / count);
      for (const v of mean) {
        // What is still inside after the eighth reflection is dropped: a few per cent at most.
        expect(v, sampling).toBeGreaterThan(0.93);
        expect(v, sampling).toBeLessThan(1.005);
      }
      expect(Math.max(...mean) - Math.min(...mean), `${sampling} stays neutral`).toBeLessThan(0.02);
    }
  });

  /** Mean distance to the nearest corner, in edge lengths, of the brightest 1% of texels and of all. */
  function hotSpots(
    grid: ArrayLike<number>,
    planes: readonly Plane[],
    frames: readonly FaceFrame[],
    vertices: readonly Vec3[],
    stride: number,
  ) {
    const edge = Math.min(
      ...vertices
        .slice(1)
        .map((v) =>
          Math.hypot(v[0] - vertices[0]![0], v[1] - vertices[0]![1], v[2] - vertices[0]![2]),
        ),
    );
    const cells: { v: number; d: number }[] = [];
    frames.forEach((frame, f) => {
      for (let y = 0; y < CAUSTIC_TILE; y++) {
        for (let x = 0; x < CAUSTIC_TILE; x++) {
          const p = texelPoint(frame, CAUSTIC_TILE, x, y);
          if (!onSolid(planes, p)) continue;
          const d = Math.min(
            ...vertices.map((v) => Math.hypot(v[0] - p[0], v[1] - p[1], v[2] - p[2])),
          );
          cells.push({
            v: grid[((f * CAUSTIC_TILE + y) * CAUSTIC_TILE + x) * stride]!,
            d: d / edge,
          });
        }
      }
    });
    cells.sort((a, b) => b.v - a.v);
    const top = cells.slice(0, Math.ceil(cells.length / 100));
    const mean = (list: typeof cells) => list.reduce((s, c) => s + c.d, 0) / list.length;
    const total = cells.reduce((s, c) => s + c.v, 0);
    return {
      top: mean(top),
      all: mean(cells),
      total,
      peak: top[0]!.v,
      average: total / cells.length,
    };
  }

  it('the caustics gather towards the corners, on the CPU and on the GPU alike', async () => {
    const planes = solidPlanes('icosahedron');
    const vertices = solidVertices(planes);
    const frames = faceFrames(planes, vertices);
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

    // Over light from many directions, the brightest texels lie nearer the corners than texels do
    // on average. Not from every direction: a flat face does not focus, so a "hot spot" is where
    // several reflected beams overlap, and that is near a corner for most directions, not all.
    const ratios: number[] = [];
    for (let k = 0; k < 12; k++) {
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
        rays: 40000,
        random,
      });
      const spots = hotSpots(grid, planes, frames, vertices, 1);
      expect(spots.peak / spots.average).toBeGreaterThan(3);
      ratios.push(spots.top / spots.all);
    }
    expect(ratios.reduce((s, r) => s + r, 0) / ratios.length).toBeLessThan(0.8);

    // The GPU's atlas is the CPU's: the same light in all, in the same places.
    const toward = [-0.42, 0.3, -1].map((v) => v / Math.hypot(0.42, 0.3, 1));
    for (const angle of [0.2, 0.9, 2.1]) {
      const turned = turn(angle, 0.35);
      const light = applyMat3(
        transposeMat3(turned),
        toward.map((v) => -v),
      );
      const cpuGrid = traceCaustics(planes, frames, {
        n: flintIndex(550),
        light,
        rays: 400000,
        random,
      });
      const { caustics } = await render(
        {
          rotation: turned,
          sampling: 'three-channel',
          caustics: 'traced',
          glass: 'flint',
          bounces: 6,
          causticRays: 262144,
          key: { ...DEFAULT_KEY, colour: [1, 1, 1] },
        },
        24,
      );
      // The green channel is traced at 550 nm, as the CPU twin was.
      const gpu = hotSpots(caustics.subarray(1), planes, frames, vertices, 4);
      const cpu = hotSpots(cpuGrid, planes, frames, vertices, 1);
      expect(gpu.total / cpu.total, `angle ${angle}`).toBeGreaterThan(0.95);
      expect(gpu.total / cpu.total, `angle ${angle}`).toBeLessThan(1.05);
      // Face by face, the light each face gathers agrees.
      for (let f = 0; f < planes.length; f++) {
        let g = 0;
        let c = 0;
        for (let t = 0; t < CAUSTIC_TILE * CAUSTIC_TILE; t++) {
          g += caustics[(f * CAUSTIC_TILE * CAUSTIC_TILE + t) * 4 + 1]!;
          c += cpuGrid[f * CAUSTIC_TILE * CAUSTIC_TILE + t]!;
        }
        expect(Math.abs(g - c), `angle ${angle}, face ${f}`).toBeLessThan(
          0.05 * c + 0.01 * cpu.total,
        );
      }
    }
  });
});
