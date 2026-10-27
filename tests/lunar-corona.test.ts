import { describe, expect, it } from 'vitest';
import { createFullscreenPipeline, renderFullscreen } from '../src/gpu/fullscreen.ts';
import {
  airy,
  besselJ1,
  coronaProfile,
  diffractionPhase,
  dropletSizes,
} from '../src/gpu/optics/corona.ts';
import {
  createProfile,
  profileAngle,
  profileAt,
  profileIntegral,
  type AngularProfile,
} from '../src/gpu/optics/profile.ts';
import { luminance, spectralSamples } from '../src/gpu/optics/spectral.ts';
import { createProfileTexture } from '../src/gpu/profile-texture.ts';
import fullscreen from '../src/wgsl/fullscreen.wgsl';
import profileChunk from '../src/wgsl/profile.wgsl';
import { getTestDevice, readTexture } from './gpu.ts';

// Story 5.2: the corona as the Airy pattern of cloud droplets, summed over the spectrum and a
// spread of droplet sizes, and the table it is looked up from on the GPU.

const DEG = Math.PI / 180;

/** Angles (degrees) where the profile is reddest, outwards from the moon: the red rings. */
function redRings(profile: AngularProfile, threshold = 0.38): number[] {
  const red = Array.from({ length: profile.size }, (_, i) => {
    const [r, g, b] = [0, 1, 2].map((c) => profile.data[i * 4 + c]!);
    return r! / (r! + g! + b!);
  });
  const rings: number[] = [];
  for (let i = 2; i < profile.size - 2; i++) {
    if (red[i]! > red[i - 1]! && red[i]! >= red[i + 1]! && red[i]! > threshold) {
      rings.push(profileAngle(profile, i) / DEG);
    }
  }
  return rings;
}

/** Luminance dips between rings deeper than `depth` of their neighbouring peaks, 1.2 to 8 degrees. */
function ringDips(profile: AngularProfile, depth = 0.15): number {
  const lum = (deg: number) => luminance(profileAt(profile, deg * DEG));
  const samples = Array.from({ length: 341 }, (_, i) => lum(1.2 + i * 0.02));
  let dips = 0;
  for (let i = 1; i < samples.length - 1; i++) {
    if (!(samples[i]! < samples[i - 1]! && samples[i]! <= samples[i + 1]!)) continue;
    const before = Math.max(...samples.slice(0, i));
    const after = Math.max(...samples.slice(i));
    if (samples[i]! < (1 - depth) * Math.min(before, after)) dips++;
  }
  return dips;
}

describe('spectral colour', () => {
  it('sums a flat spectrum to white', () => {
    for (const count of [8, 16, 32]) {
      const sum = [0, 0, 0];
      for (const { rgb } of spectralSamples(count)) for (let c = 0; c < 3; c++) sum[c]! += rgb[c]!;
      for (const channel of sum) expect(channel).toBeCloseTo(1, 6);
    }
  });

  it('runs from blue through green to red', () => {
    const [blue, green, red] = [450, 540, 640].map(
      (nm) => spectralSamples(300).find((s) => Math.abs(s.nm - nm) < 0.6)!.rgb,
    );
    expect(blue![2]).toBeGreaterThan(Math.max(blue![0], blue![1]));
    expect(green![1]).toBeGreaterThan(Math.max(green![0], green![2]));
    expect(red![0]).toBeGreaterThan(Math.max(red![1], red![2]));
  });
});

describe('the Airy pattern', () => {
  it('uses an accurate J1', () => {
    expect(besselJ1(1)).toBeCloseTo(0.4400505857, 7);
    expect(besselJ1(5)).toBeCloseTo(-0.3275791376, 7);
    expect(besselJ1(10)).toBeCloseTo(0.0434727462, 7);
    expect(besselJ1(-2)).toBeCloseTo(-0.5767248078, 7);
    // The first three zeros, and the dark rings of the pattern with them.
    for (const zero of [3.8317, 7.0156, 10.1735])
      expect(Math.abs(besselJ1(zero))).toBeLessThan(1e-4);
  });

  it('has its first bright ring 1.75% of the centre at x = 5.14', () => {
    expect(airy(0)).toBe(1);
    expect(airy(5.1356)).toBeCloseTo(0.0175, 4);
  });

  it('is a phase function: a droplet diffracts all of its share into the sphere', () => {
    // Integral of (k a)^2 / 4 pi [2 J1 / x]^2 over the sphere; out to 60 degrees, where the tail
    // past it holds under 1%.
    let sum = 0;
    const steps = 60_000;
    const top = 60 * DEG;
    for (let i = 0; i < steps; i++) {
      const theta = ((i + 0.5) / steps) * top;
      sum += diffractionPhase(theta, 10, 550) * 2 * Math.PI * Math.sin(theta) * (top / steps);
    }
    expect(sum).toBeGreaterThan(0.99);
    expect(sum).toBeLessThan(1.001);
  });
});

describe('the corona', () => {
  const sharp = coronaProfile({ radius: 10, spread: 0.06, source: 0.00452 });

  it('puts the first red ring where the textbook does for 10 µm droplets', () => {
    const [aureole, first] = redRings(sharp);
    // The aureole's red-brown edge: where blue and green have reached their first dark ring,
    // sin(theta) = 0.61 lambda / a, and red has not: between 1.57 (450 nm) and 2.27 (650 nm) degrees.
    expect(aureole).toBeGreaterThan(Math.asin((0.61 * 0.45) / 10) / DEG);
    expect(aureole).toBeLessThan(Math.asin((0.61 * 0.65) / 10) / DEG);
    // The first full ring's red, past red's own first dark ring and before blue's second
    // (x = 7.02: sin(theta) = 1.117 lambda / a): about 3 degrees.
    expect(first).toBeGreaterThan(Math.asin((0.61 * 0.65) / 10) / DEG);
    expect(first).toBeLessThan(Math.asin((1.117 * 0.65) / 10) / DEG);
    expect(aureole).toBeCloseTo(1.7, 1);
    expect(first).toBeCloseTo(3.2, 1);
  });

  it('draws smaller rings for bigger droplets, in proportion', () => {
    const [small] = redRings(coronaProfile({ radius: 5, spread: 0.06, source: 0.00452 }));
    const [big] = redRings(coronaProfile({ radius: 20, spread: 0.06, source: 0.00452 }));
    const [mid] = redRings(sharp);
    expect(small! / mid!).toBeCloseTo(2, 0);
    expect(Math.abs(small! / mid! - 2)).toBeLessThan(0.15);
    expect(Math.abs(mid! / big! - 2)).toBeLessThan(0.25);
  });

  it('keeps rings for a narrow spread of sizes and loses them for a wide one', () => {
    const wide = coronaProfile({ radius: 10, spread: 0.35, source: 0.00452 });
    // The rings are colour more than light: count the red bands within 8 degrees.
    const within = (rings: number[]) => rings.filter((deg) => deg < 8).length;
    expect(within(redRings(sharp, 0.4))).toBeGreaterThanOrEqual(3);
    expect(within(redRings(wide, 0.4))).toBe(0);
    // And the dark gap outside the aureole is there with clear rings, gone in a plain aureole.
    expect(ringDips(sharp)).toBeGreaterThanOrEqual(1);
    expect(ringDips(wide)).toBe(0);
  });

  it('is a phase function, per steradian, about one over the sphere', () => {
    const profile = coronaProfile({ radius: 10, spread: 0.1, maxAngle: 40 * DEG, size: 2048 });
    for (const channel of profileIntegral(profile)) expect(channel).toBeCloseTo(1, 1);
  });

  it('samples droplet sizes finely enough not to leave false rings', () => {
    const sizes = dropletSizes(10, 0.3, 24 * DEG);
    const step = sizes[1]!.radius - sizes[0]!.radius;
    // Neighbours a quarter-wave apart at 400 nm and 24 degrees.
    expect(((2 * Math.PI) / 0.4) * step * 24 * DEG).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
    expect(sizes.reduce((sum, s) => sum + s.weight, 0)).toBeCloseTo(1, 9);
  });

  it('looks a profile up the same on the GPU as on the CPU', async () => {
    const device = await getTestDevice();
    const profile = createProfile(0, 24 * DEG, 1024);
    profile.data.set(sharp.data);
    const angles = [0, 0.3, 1, 1.71, 2.5, 3.2, 7.77, 23.9, 25].map((d) => d * DEG);
    const table = createProfileTexture(device, { width: 1024, rows: 2 });
    table.write(1, profile);
    const target = device.createTexture({
      size: [angles.length, 1],
      format: 'rgba32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const pipeline = createFullscreenPipeline(device, {
      fragment: {
        label: 'profile test',
        code: `#include "fullscreen.wgsl"
#include "profile.wgsl"
@group(0) @binding(0) var table: texture_2d<f32>;
@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  let angles = array(${angles.map((a) => a.toFixed(7)).join(', ')});
  return vec4f(profile_at(table, 1, angles[i32(in.position.x)], vec2f(0.0, ${(24 * DEG).toFixed(7)})), 1.0);
}`,
        chunks: {
          ...fullscreen.chunks,
          ...profileChunk.chunks,
          'fullscreen.wgsl': fullscreen.code,
          'profile.wgsl': profileChunk.code,
        },
      },
      format: 'rgba32float',
    });
    const group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: table.view }],
    });
    const encoder = device.createCommandEncoder();
    renderFullscreen(encoder, target.createView(), pipeline, [group]);
    device.queue.submit([encoder.finish()]);
    const values = new Float32Array((await readTexture(device, target, 16)).buffer);
    target.destroy();
    table.destroy();
    for (const [x, angle] of angles.entries()) {
      const cpu = profileAt(profile, angle);
      for (let c = 0; c < 3; c++) {
        const gpu = values[x * 4 + c]!;
        expect(Math.abs(gpu - cpu[c]!), `angle ${angle / DEG}`).toBeLessThanOrEqual(
          1e-4 * Math.max(1, Math.abs(cpu[c]!)),
        );
      }
    }
  });
});
