import { describe, expect, it } from 'vitest';
import {
  beamAirlight,
  beamAirlightMarch,
  coneInterval,
  scatterBetween,
  type Beam,
  type Vec3,
} from '../src/gpu/optics/beam.ts';
import { airlightForward } from '../src/gpu/optics/haze.ts';
import { createFullscreenPipeline, renderFullscreen } from '../src/gpu/fullscreen.ts';
import beamWgsl from '../src/wgsl/beam.wgsl';
import fullscreen from '../src/wgsl/fullscreen.wgsl';
import { getTestDevice, readTexture } from './gpu.ts';

// Story 5.5, lamp-in-fog: the visible cone under a shaded lamp, as 2.8's closed-form substitution
// with the cone's interval for limits and a short Gauss–Legendre sum, against a direct march of the
// scattering integral along the ray; and the WGSL twin against the TypeScript.

const EYE: Vec3 = [0, 1.6, 0];
const DOWN: Vec3 = [0, -1, 0];

const normalize = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Where a ray from the eye meets the ground, or `far` if it does not. */
const groundAt = (d: Vec3, far = 200) => (d[1] < 0 ? Math.min(-EYE[1] / d[1], far) : far);

/** Rays from the eye aimed at points through and around a lamp's cone. */
function raysThrough(beam: Beam): Vec3[] {
  const [ax, ay, az] = beam.apex;
  const ground = ay * Math.tan(beam.half);
  const targets: Vec3[] = [
    [ax, ay * 0.5, az], // straight through the middle of the cone
    [ax + ground * 0.8, 0, az], // to the ground inside the pool
    [ax - ground * 0.95, 0.4, az + 1], // across its soft edge
    [ax, ay - 0.6, az + 2], // just under the lamp, beyond it
    [ax + 6, ay * 0.4, az + 4], // across the cone towards the far side
    [ax, ay * 0.7, az - 3], // through the near side of the cone
  ];
  return targets.map((t) => normalize([t[0] - EYE[0], t[1] - EYE[1], t[2] - EYE[2]]));
}

const LAMPS: Beam[] = [
  { apex: [2.6, 6, 9], axis: DOWN, half: (35 * Math.PI) / 180, soft: 0.15 },
  { apex: [1.8, 9, 22], axis: DOWN, half: (55 * Math.PI) / 180, soft: 0.25 },
  { apex: [-1, 4, 6], axis: DOWN, half: (18 * Math.PI) / 180, soft: 0.08 },
];

/** A drifting density like the effect's: smooth, patchy, ±60% about the mean. */
const patchy = (x: Vec3) =>
  1 + 0.6 * Math.sin(0.7 * x[0] + 0.3 * x[1]) * Math.cos(0.45 * x[2] - 0.2 * x[0] + 1.3);

describe('lamp-in-fog beam', () => {
  it('is 2.8 when the cone is the whole sky and nothing stops the ray', () => {
    for (const gamma of [0.05, 0.3, 1, 2]) {
      for (const tau of [0.3, 1, 3]) {
        // A light at distance 1, angle gamma off the ray (0, 0, 1).
        const apex: Vec3 = [Math.sin(gamma), 0, Math.cos(gamma)];
        const at = (nodes: 8 | 12) =>
          scatterBetween(
            [0, 0, 0],
            [0, 0, 1],
            apex,
            tau,
            0.6,
            0,
            Infinity,
            undefined,
            undefined,
            nodes,
          ) / airlightForward(gamma, tau, 0.6);
        // haze.ts in its own units (I = 1, D = 1): the same integral, so with the same 12 points
        // the same number; the shader's 8 points stay within half a percent of it.
        expect(at(12), `gamma ${gamma}, tau ${tau}`).toBeCloseTo(1, 4);
        expect(Math.abs(at(8) - 1), `8 points, gamma ${gamma}, tau ${tau}`).toBeLessThan(0.005);
      }
    }
  });

  it('finds the one interval a ray spends inside the cone', () => {
    const beam = LAMPS[0]!;
    const cos = Math.cos(beam.half);
    // Straight down through the apex's vertical: inside from the apex to the ground.
    const down = coneInterval([2.6, 8, 9], DOWN, beam.apex, DOWN, cos, 8)!;
    expect(down[0]).toBeCloseTo(2, 6);
    expect(down[1]).toBeCloseTo(8, 6);
    // Horizontal at 3 m: a chord of half-width 3 tan(35°).
    const across = coneInterval([-10, 3, 9], [1, 0, 0], beam.apex, DOWN, cos, 100)!;
    expect(across[1] - across[0]).toBeCloseTo(6 * Math.tan(beam.half), 6);
    // Above the lamp: the other nappe, never lit.
    expect(coneInterval([-10, 7, 9], [1, 0, 0], beam.apex, DOWN, cos, 100)).toBeUndefined();
    // Every ray's interval holds exactly the march's lit points.
    for (const d of raysThrough(beam)) {
      const span = coneInterval(EYE, d, beam.apex, DOWN, cos, groundAt(d));
      for (let t = 0.05; t < groundAt(d); t += 0.05) {
        const u = normalize([
          EYE[0] + t * d[0] - beam.apex[0],
          EYE[1] + t * d[1] - beam.apex[1],
          EYE[2] + t * d[2] - beam.apex[2],
        ]);
        const inside = -u[1] > cos;
        const inSpan = span !== undefined && t > span[0] && t < span[1];
        if (Math.abs(-u[1] - cos) > 1e-3) expect(inSpan, `t ${t}`).toBe(inside);
      }
    }
  });

  it('matches a march of the scattering integral: 0.5% with 12 points, 3% with 8', () => {
    for (const beam of LAMPS) {
      for (const beta of [0.02, 0.08, 0.25]) {
        for (const g of [0, 0.5, 0.8]) {
          for (const [i, d] of raysThrough(beam).entries()) {
            const tMax = groundAt(d);
            const reference = beamAirlightMarch(EYE, d, beam, beta, g, tMax);
            if (reference < 1e-9) continue;
            const name = `apex ${beam.apex}, beta ${beta}, g ${g}, ray ${i}`;
            const at = (nodes: 8 | 12) =>
              Math.abs(beamAirlight(EYE, d, beam, beta, g, tMax, undefined, nodes) / reference - 1);
            expect(at(12), name).toBeLessThan(0.005);
            expect(at(8), name).toBeLessThan(0.03);
          }
        }
      }
    }
  });

  it('carries a drifting density through the same nodes, within 3% of the march (8 points)', () => {
    for (const beam of LAMPS) {
      for (const [i, d] of raysThrough(beam).entries()) {
        const tMax = groundAt(d);
        const reference = beamAirlightMarch(EYE, d, beam, 0.08, 0.6, tMax, patchy);
        if (reference < 1e-9) continue;
        expect(
          Math.abs(beamAirlight(EYE, d, beam, 0.08, 0.6, tMax, patchy) / reference - 1),
          `apex ${beam.apex}, ray ${i}`,
        ).toBeLessThan(0.03);
      }
    }
  });

  it('is dark outside the cone and brightest looking through it towards the lamp', () => {
    const beam = LAMPS[0]!;
    const miss = normalize([-8, 5, 9]);
    expect(beamAirlight(EYE, miss, beam, 0.08, 0.6, groundAt(miss))).toBe(0);
    // Forward scattering: the same cone looks brighter from beneath, looking up into it.
    const under = normalize([2.6 - EYE[0], 6 - 0.5 - EYE[1], 9 - EYE[2]]);
    const side = normalize([2.6 + 3 - EYE[0], 2 - EYE[1], 9 - EYE[2]]);
    expect(beamAirlight(EYE, under, beam, 0.08, 0.7, 50)).toBeGreaterThan(
      beamAirlight(EYE, side, beam, 0.08, 0.7, 50),
    );
  });

  it('agrees between WGSL and TypeScript', async () => {
    const device = await getTestDevice();
    const cases = LAMPS.flatMap((beam) =>
      raysThrough(beam).map((d) => ({ beam, d, tMax: groundAt(d) })),
    );
    const width = cases.length;
    const texture = device.createTexture({
      size: [width, 1],
      format: 'rgba32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const v3 = (v: Vec3) => `vec3f(${v.map((x) => x.toFixed(7)).join(', ')})`;
    const pipeline = createFullscreenPipeline(device, {
      fragment: {
        label: 'beam test',
        code: `#include "fullscreen.wgsl"
#include "beam.wgsl"
fn beam_density(p: vec3f) -> f32 {
  return 1.0 + 0.6 * sin(0.7 * p.x + 0.3 * p.y) * cos(0.45 * p.z - 0.2 * p.x + 1.3);
}
@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  let dirs = array(${cases.map((c) => v3(c.d)).join(', ')});
  let apexes = array(${cases.map((c) => v3(c.beam.apex)).join(', ')});
  let halves = array(${cases.map((c) => c.beam.half.toFixed(6)).join(', ')});
  let softs = array(${cases.map((c) => c.beam.soft.toFixed(6)).join(', ')});
  let reach = array(${cases.map((c) => c.tMax.toFixed(5)).join(', ')});
  let i = i32(in.position.x);
  let edges = beam_edges(halves[i], softs[i]);
  let eye = ${v3(EYE)};
  let lit = beam_airlight(eye, dirs[i], apexes[i], vec3f(0.0, -1.0, 0.0), edges, 0.08, 0.6, reach[i]);
  let bare = scatter_between(eye, dirs[i], apexes[i], 0.08, 0.6, 0.0, reach[i]);
  return vec4f(lit, bare, 0.0, 1.0);
}`,
        chunks: {
          ...fullscreen.chunks,
          ...beamWgsl.chunks,
          'fullscreen.wgsl': fullscreen.code,
          'beam.wgsl': beamWgsl.code,
        },
      },
      format: 'rgba32float',
    });
    const encoder = device.createCommandEncoder();
    renderFullscreen(encoder, texture.createView(), pipeline, []);
    device.queue.submit([encoder.finish()]);
    const values = new Float32Array((await readTexture(device, texture, 16)).buffer);
    texture.destroy();
    for (const [i, { beam, d, tMax }] of cases.entries()) {
      const ts = beamAirlight(EYE, d, beam, 0.08, 0.6, tMax, patchy);
      const gpu = values[i * 4]!;
      if (ts < 1e-7) expect(gpu, `ray ${i}`).toBeLessThan(1e-6);
      else expect(gpu / ts, `ray ${i}`).toBeCloseTo(1, 3);
      const bare = scatterBetween(EYE, d, beam.apex, 0.08, 0.6, 0, tMax, undefined, () => 1);
      expect(values[i * 4 + 1]! / bare, `bare ${i}`).toBeCloseTo(1, 3);
    }
  });
});
