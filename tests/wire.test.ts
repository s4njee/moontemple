import { describe, expect, it } from 'vitest';
import { createFullscreenPipeline, renderFullscreen } from '../src/gpu/fullscreen.ts';
import { countFlashes, flickerIsSafe, FLICKER_FLASH_LIMIT } from '../src/gpu/optics/flicker.ts';
import {
  applyMat3,
  dot,
  mat3FromQuat,
  multiplyMat3,
  platonicSolid,
  projectSolid,
  quatFromAxisAngle,
  rotationAxisAngle,
  rotationBetween,
  SOLID_NAMES,
  sub,
  turntable,
  type Mat3,
  type ProjectedSolid,
  type WireView,
} from '../src/gpu/wire/solids.ts';
import {
  FLARE_SAFE_MAX_TURN,
  FLARE_TWINKLE_DEFAULT,
  flareLight,
  vertexFlares,
} from '../src/gpu/wire/vertex-flares.ts';
import {
  createWireLayer,
  edgeFront,
  edgeLevels,
  packWire,
  WIRE_FLOATS,
  WIRE_STYLE_DEFAULT,
  type WireLayer,
  type WireStyle,
} from '../src/gpu/wire/wireframe.ts';
import fullscreen from '../src/wgsl/fullscreen.wgsl';
import { expectValid, getTestDevice, readTexture } from './gpu.ts';

// Stories 10.1 and 10.3: the solids, the HDR wireframe on the GPU, and the corner flares.

const SIZE = 256;

interface Light {
  core: Float32Array;
  glow: Float32Array;
}

/** The wire layer's two channels (core in red, glow in green), read back as floats. */
async function readWire(device: GPUDevice, layer: WireLayer): Promise<Light> {
  const texture = device.createTexture({
    size: [SIZE, SIZE],
    format: 'rgba32float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const pipeline = createFullscreenPipeline(device, {
    fragment: {
      label: 'copy wire',
      code: `#include "fullscreen.wgsl"
@group(0) @binding(0) var light: texture_2d<f32>;
@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  return textureLoad(light, vec2i(in.position.xy), 0);
}`,
      chunks: { ...fullscreen.chunks, 'fullscreen.wgsl': fullscreen.code },
    },
    format: 'rgba32float',
  });
  const encoder = device.createCommandEncoder();
  renderFullscreen(encoder, texture.createView(), pipeline, [
    device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: layer.view }],
    }),
  ]);
  device.queue.submit([encoder.finish()]);
  const rgba = new Float32Array((await readTexture(device, texture, 16)).buffer);
  texture.destroy();
  const core = new Float32Array(SIZE * SIZE);
  const glow = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    core[i] = rgba[i * 4]!;
    glow[i] = rgba[i * 4 + 1]!;
  }
  return { core, glow };
}

/** Draws the layer as it stands into a scratch scene and returns its light. */
async function render(
  device: GPUDevice,
  layer: WireLayer,
  width: number,
  glowRadius = 0,
): Promise<Light> {
  const scene = device.createTexture({
    size: [SIZE, SIZE],
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const encoder = device.createCommandEncoder();
  await expectValid(device, () =>
    layer.encode(encoder, scene.createView(), {
      width,
      glowRadius,
      core: [1, 1, 1],
      glow: [1, 1, 1],
      clear: [0, 0, 0, 1],
    }),
  );
  device.queue.submit([encoder.finish()]);
  const light = await readWire(device, layer);
  scene.destroy();
  return light;
}

async function wireLayer(device: GPUDevice) {
  const layer = await expectValid(device, () =>
    createWireLayer(device, { label: 'wire test', format: 'rgba16float' }),
  );
  layer.resize(SIZE, SIZE);
  return layer;
}

/** The brightest value within `r` pixels of (x, y). */
function peakNear(values: Float32Array, x: number, y: number, r = 1): number {
  let peak = 0;
  for (let j = Math.floor(y) - r; j <= Math.floor(y) + r; j++) {
    for (let i = Math.floor(x) - r; i <= Math.floor(x) + r; i++) {
      if (i >= 0 && j >= 0 && i < SIZE && j < SIZE) peak = Math.max(peak, values[j * SIZE + i]!);
    }
  }
  return peak;
}

const total = (values: Float32Array) => values.reduce((sum, v) => sum + v, 0);

function segment(x0: number, y0: number, x1: number, y1: number, level = 1): number[] {
  return [x0, y0, x1, y1, level, level, 0, 0, 0, 0, 0, 0];
}

/** Distance from (x, y) to the segment a-b. */
function distanceToSegment(
  x: number,
  y: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.min(Math.max(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy), 0), 1);
  return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
}

const VIEW: WireView = { center: [SIZE / 2, SIZE / 2], size: 90, distance: 4 };

describe('solids', () => {
  const expected = {
    tetrahedron: [4, 6, 4],
    cube: [8, 12, 6],
    octahedron: [6, 12, 8],
    dodecahedron: [20, 30, 12],
    icosahedron: [12, 30, 20],
  } as const;

  it.each(SOLID_NAMES.map((name) => [name]))(
    '%s has the right counts, Euler characteristic 2 and outward faces',
    (name) => {
      const solid = platonicSolid(name);
      const [v, e, f] = expected[name];
      expect([solid.vertices.length, solid.edges.length, solid.faces.length]).toEqual([v, e, f]);
      expect(solid.vertices.length - solid.edges.length + solid.faces.length).toBe(2);
      for (const p of solid.vertices) expect(Math.hypot(...p)).toBeCloseTo(1, 9);
      // Every edge the same length; every face regular in size, outward and counter-clockwise.
      const lengths = solid.edges.map((edge) =>
        Math.hypot(...sub(solid.vertices[edge.a]!, solid.vertices[edge.b]!)),
      );
      for (const l of lengths) expect(l).toBeCloseTo(lengths[0]!, 9);
      for (const face of solid.faces) {
        expect(dot(face.normal, face.centroid)).toBeGreaterThan(0);
        const [a, b, c] = face.vertices.map((i) => solid.vertices[i]!);
        const turn = dot(
          face.normal,
          (([x, y, z], [p, q, r]) => [y * r - z * q, z * p - x * r, x * q - y * p] as const)(
            sub(b!, a!),
            sub(c!, b!),
          ),
        );
        expect(turn).toBeGreaterThan(0);
      }
      // Each vertex's normal points the way the vertex does (all five are centred).
      solid.vertexNormals.forEach((n, i) => expect(dot(n, solid.vertices[i]!)).toBeCloseTo(1, 9));
    },
  );

  it('rotates the same way as a matrix and a quaternion, and keeps the size at the centre depth', () => {
    const axis = [0.3, 1, -0.2] as const;
    const m = rotationAxisAngle(axis, 1.1);
    const q = mat3FromQuat(quatFromAxisAngle(axis, 1.1));
    m.forEach((value, i) => expect(q[i]).toBeCloseTo(value, 12));
    const r = rotationBetween([0, 0, 1], [1, 1, 0]);
    applyMat3(r, [0, 0, 1]).forEach((value, i) =>
      expect(value).toBeCloseTo([Math.SQRT1_2, Math.SQRT1_2, 0][i]!, 12),
    );
    // A vertex at the centre's depth lands `size` pixels from the centre, whatever the distance.
    const solid = platonicSolid('octahedron');
    for (const distance of [2.5, 4, 10, Infinity]) {
      const seen = projectSolid(solid, IDENTITY_TURN, { ...VIEW, distance });
      const side = seen.vertices.find((v) => Math.abs(v.position[2]) < 1e-9)!;
      expect(Math.hypot(side.x - VIEW.center[0], side.y - VIEW.center[1])).toBeCloseTo(90, 6);
    }
  });

  it('sees about half of a convex solid: front faces face the camera and have an outline', () => {
    const solid = platonicSolid('icosahedron');
    const seen = projectSolid(solid, turntable(0.7), VIEW);
    const front = seen.faces.filter((f) => f.facing > 0).length;
    // In perspective a little under half the surface faces the camera.
    expect(front).toBeGreaterThanOrEqual(8);
    expect(front).toBeLessThanOrEqual(12);
    const outline = seen.edges.filter((_edge, i) => {
      const [f0, f1] = solid.edges[i]!.faces;
      return Math.sign(seen.faces[f0]!.facing) !== Math.sign(seen.faces[f1]!.facing);
    });
    expect(outline.length).toBeGreaterThanOrEqual(6);
    for (const edge of outline) expect(edge.facing).toBeGreaterThan(0);
  });
});

const IDENTITY_TURN: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

describe('HDR wireframe (10.1)', () => {
  it('carries light in proportion to length, so long and short edges are equally bright', async () => {
    const device = await getTestDevice();
    const layer = await wireLayer(device);
    const width = 2;
    // Three horizontal edges, 24, 48 and 96 px, and one at 30 degrees, each alone in the layer.
    const runs: { length: number; light: Light; mid: [number, number] }[] = [];
    for (const [length, angle] of [
      [24, 0],
      [48, 0],
      [96, 0],
      [96, Math.PI / 6],
    ] as const) {
      const x0 = 80;
      const y0 = 100.5;
      const x1 = x0 + length * Math.cos(angle);
      const y1 = y0 + length * Math.sin(angle);
      layer.setSegments(new Float32Array(segment(x0, y0, x1, y1)), 1);
      runs.push({
        length,
        light: await render(device, layer, width),
        mid: [(x0 + x1) / 2, (y0 + y1) / 2],
      });
    }
    const [short, medium, long, slanted] = runs.map((run) => total(run.light.core));
    // Light = width * length + the same round ends on each: the steps in length give `width`.
    expect((long! - medium!) / 48).toBeCloseTo(width, 1);
    expect((medium! - short!) / 24).toBeCloseTo(width, 1);
    expect((long! - medium!) / 48 / ((medium! - short!) / 24)).toBeCloseTo(1, 2);
    // Light per length does not depend on the edge's direction.
    expect(slanted! / long!).toBeCloseTo(1, 2);
    // And a pixel in the middle of each horizontal edge is as bright as on any other.
    const mids = runs.slice(0, 3).map((run) => peakNear(run.light.core, run.mid[0], run.mid[1]));
    for (const m of mids) expect(Math.abs(m / mids[2]! - 1)).toBeLessThan(0.01);
    layer.destroy();
  });

  it.each([
    ['cube', 3],
    ['octahedron', 4],
    ['icosahedron', 5],
  ] as const)('does not double at a %s corner where %d edges meet', async (name, meeting) => {
    const device = await getTestDevice();
    const layer = await wireLayer(device);
    const solid = platonicSolid(name);
    // A corner straight at the camera, with its edges spread round it.
    const rotation = multiplyMat3(
      rotationAxisAngle([0, 0, 1], 0.2),
      rotationBetween(solid.vertices[0]!, [0, 0, 1]),
    );
    const seen = projectSolid(solid, rotation, VIEW);
    const style: WireStyle = { hiddenFade: 0, depthCue: 0 };
    layer.setSolid(seen, style);
    const light = await render(device, layer, 3, 4);
    const corner = seen.vertices[0]!;
    const edges = solid.edges.filter((e) => e.a === 0 || e.b === 0);
    expect(edges).toHaveLength(meeting);
    for (const channel of ['core', 'glow'] as const) {
      const atCorner = peakNear(light[channel], corner.x, corner.y);
      for (const edge of edges) {
        const other = seen.vertices[edge.a === 0 ? edge.b : edge.a]!;
        const mid = peakNear(light[channel], (corner.x + other.x) / 2, (corner.y + other.y) / 2);
        expect(atCorner / mid, `${name} ${channel}`).toBeLessThanOrEqual(1.2);
        expect(atCorner / mid, `${name} ${channel}`).toBeGreaterThan(0.95);
      }
    }
    layer.destroy();
  });

  it('draws hidden edges at the fade level, not removed and not full', async () => {
    const device = await getTestDevice();
    const layer = await wireLayer(device);
    const solid = platonicSolid('icosahedron');
    const fade = 0.25;
    const style: WireStyle = { hiddenFade: fade, depthCue: 0 };
    let checked = 0;
    for (const angle of [0.3, 1.1, 2.2]) {
      const seen: ProjectedSolid = projectSolid(solid, turntable(angle), VIEW);
      layer.setSolid(seen, style);
      const light = await render(device, layer, 3);
      const fronts = seen.edges.filter((e) => e.facing > 0);
      const level = (e: { a: number; b: number }) => {
        const a = seen.vertices[e.a]!;
        const b = seen.vertices[e.b]!;
        return peakNear(light.core, (a.x + b.x) / 2, (a.y + b.y) / 2);
      };
      const front = Math.max(...fronts.map(level));
      for (const edge of seen.edges) {
        if (edge.facing > -WIRE_STYLE_DEFAULT.softness) continue;
        const a = seen.vertices[edge.a]!;
        const b = seen.vertices[edge.b]!;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        // Only where no front edge passes near, so it is the hidden edge's own light.
        const clear = fronts.every(
          (f) => distanceToSegment(mx, my, seen.vertices[f.a]!, seen.vertices[f.b]!) > 5,
        );
        if (!clear) continue;
        expect(level(edge) / front).toBeCloseTo(fade, 1);
        expect(Math.abs(level(edge) / front - fade)).toBeLessThan(0.02);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(3);
    // The crossover is smooth: halfway at an edge on the outline, nothing jumps.
    expect(edgeFront(0)).toBeCloseTo(0.5, 6);
    expect(edgeFront(-1)).toBe(0);
    expect(edgeFront(1)).toBe(1);
    layer.destroy();
  });

  it('packs one record per edge, its ends in pixels and its levels faded and depth-cued', () => {
    const seen = projectSolid(platonicSolid('dodecahedron'), turntable(0.4), VIEW);
    const { data, count } = packWire(seen, { hiddenFade: 0.2, depthCue: 0.4 });
    expect(count).toBe(30);
    seen.edges.forEach((edge, i) => {
      const record = data.subarray(i * WIRE_FLOATS, (i + 1) * WIRE_FLOATS);
      expect(record[0]).toBeCloseTo(seen.vertices[edge.a]!.x, 3);
      expect(record[3]).toBeCloseTo(seen.vertices[edge.b]!.y, 3);
      const [l0, l1] = edgeLevels(seen, i, { hiddenFade: 0.2, depthCue: 0.4 });
      expect(record[4]).toBeCloseTo(l0, 6);
      expect(record[5]).toBeCloseTo(l1, 6);
      // Nearer ends are brighter; no level exceeds 1 or falls below the fade at the far side.
      const za = seen.vertices[edge.a]!.position[2];
      const zb = seen.vertices[edge.b]!.position[2];
      if (za > zb + 1e-6) expect(l0).toBeGreaterThan(l1);
      for (const l of [l0, l1]) {
        expect(l).toBeLessThanOrEqual(1);
        expect(l).toBeGreaterThanOrEqual(0.2 * 0.6 - 1e-9);
      }
    });
  });
});

describe('vertex flares (10.3)', () => {
  it('is brightest at the corners that face the light', () => {
    const solid = platonicSolid('icosahedron');
    const seen = projectSolid(solid, turntable(0.9), VIEW);
    const light = [-0.5, 0.65, 0.6] as const;
    const levels = seen.vertices.map((_, i) => flareLight(seen, i, { light }));
    const best = levels.indexOf(Math.max(...levels));
    const facing = seen.vertices.map((v) => dot(v.normal, light) / Math.hypot(...light));
    expect(facing[best]).toBe(Math.max(...facing));
    // Corners the solid hides have no flare.
    seen.vertices.forEach((v, i) => {
      if (v.faceFacing < -0.1) expect(levels[i]).toBe(0);
    });
  });

  it('twinkles on the capped flicker', () => {
    expect(flickerIsSafe(FLARE_TWINKLE_DEFAULT)).toBe(true);
  });

  it.each(SOLID_NAMES.map((name) => [name]))(
    'never strobes on a turning %s, even at the fastest safe turn with a deep twinkle',
    (name) => {
      const solid = platonicSolid(name);
      const fps = 60;
      const seconds = 12;
      const twinkle = { ...FLARE_TWINKLE_DEFAULT, depth: 0.5 };
      const body = rotationBetween(solid.vertices[0]!, [0, 1, 0]);
      const series = solid.vertices.map(() => new Float64Array(seconds * fps));
      for (let frame = 0; frame < seconds * fps; frame++) {
        const t = frame / fps;
        const rotation = turntable(0.42 + 2 * Math.PI * FLARE_SAFE_MAX_TURN * t, {
          tilt: 0.38,
          roll: -0.14,
          body,
        });
        const seen = projectSolid(solid, rotation, { ...VIEW, distance: 3.6 });
        for (const flare of vertexFlares(seen, { twinkle }, t, 0)) {
          series[flare.vertex]![frame] = flare.level;
        }
      }
      let lit = 0;
      for (const levels of series) {
        const peak = Math.max(...levels);
        if (peak <= 0) continue;
        lit++;
        // Each flare's level as a share of its own peak: as if it were a large area at full white.
        const flashes = countFlashes(
          levels.map((l) => l / peak),
          fps,
        );
        expect(flashes.maxFlashes).toBeLessThanOrEqual(FLICKER_FLASH_LIMIT);
      }
      expect(lit).toBeGreaterThan(0);
    },
  );
});
