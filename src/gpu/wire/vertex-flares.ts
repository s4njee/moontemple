/*
 * Vertex flares (story 10.3): a small starburst at each corner of a wireframe solid, brightest at
 * the corners that face the light, twinkling on the capped flicker (2.9) and drawn as a sharp
 * point plus diffraction spikes (2.6).
 *
 *   const flares = createFlareLayer(device, { label, format: tail.scene.format });
 *   frame() {
 *     const seen = projectSolid(solid, rotation, view);
 *     const list = vertexFlares(seen, { strength: 1 }, clock);
 *     flares.encode(encoder, tail.scene.view, list, { width, height, light: [l, l, l],
 *                   spikes: 4, length: 0.02 * height }, profiler);
 *   }
 *
 * A corner's level is
 *
 *   strength * max(n . L, 0)^focus * seen * twinkle
 *
 * for its outward normal n and the direction to the light L, where `seen` fades a corner out as
 * every face round it turns away from the camera (the solid hides it) and `twinkle` is
 * `flickerIntensity` with clamped settings.
 *
 * Why a turning solid cannot strobe: on a turntable (solids.ts `turntable`) each normal goes round
 * one circle per turn, so n . L and the faces' facing are sinusoids of the turn angle and the
 * corner's level rises and falls about once per turn, twice at most where the light and the
 * camera are far apart. Below FLARE_SAFE_MAX_TURN turns a second that is at most two swings a
 * second, the same bound the flicker caps put on a twinkle (FLICKER_SAFE_MAX_RATE knots a second),
 * and the twinkle itself is clamped to the safe range. tests/wire.test.ts counts WCAG 2.3.1
 * flashes in every corner's level, over every solid, at that turn rate with the deepest twinkle.
 */
import { flickerClamp, flickerIntensity, type FlickerSettings } from '../optics/flicker.ts';
import { createGlareLayer, GLARE_FLOATS, type GlareLayer } from '../glare/glare.ts';
import { createPointLayer, POINT_FLOATS, type PointLayer } from '../points.ts';
import type { PassProfiler } from '../profiler.ts';
import { dot, normalize, type ProjectedSolid, type Vec3 } from './solids.ts';

/** Turns a second below which a turntable's flares stay inside the flicker caps. */
export const FLARE_SAFE_MAX_TURN = 1;

/** Upper left and in front of the solid, as a key light is. View frame, unit length. */
export const FLARE_LIGHT_DEFAULT: Vec3 = normalize([-0.5, 0.65, 0.6]);

/** A slow, shallow twinkle, well inside the caps. */
export const FLARE_TWINKLE_DEFAULT: Readonly<FlickerSettings> = {
  rate: 1.5,
  depth: 0.2,
  shimmer: 0.02,
  shimmerRate: 8,
};

export interface FlareStyle {
  /** Multiplies every level. Default 1. */
  strength?: number;
  /** Direction towards the light, view frame. Default FLARE_LIGHT_DEFAULT. */
  light?: Vec3;
  /** How tightly the flares gather on the corners facing the light. Default 4. */
  focus?: number;
  /** Twinkle on Fire Temple's flicker; always clamped to the safe range. Default a slow one. */
  twinkle?: Readonly<FlickerSettings>;
  /** How wide the fade is as a corner goes behind the solid, in its faces' cosine. Default 0.15. */
  softness?: number;
  /** Seed of the first corner's twinkle; each corner gets its own. Default 0. */
  seed?: number;
}

export interface VertexFlare {
  vertex: number;
  /** Device pixels. */
  x: number;
  y: number;
  /** 0 to `strength`. */
  level: number;
}

const smoothstep = (lo: number, hi: number, x: number) => {
  const t = Math.min(Math.max((x - lo) / (hi - lo), 0), 1);
  return t * t * (3 - 2 * t);
};

/** A corner's level before the twinkle: how squarely it faces the light, if it can be seen. */
export function flareLight(seen: ProjectedSolid, vertex: number, style: FlareStyle = {}): number {
  const v = seen.vertices[vertex]!;
  const light = style.light ?? FLARE_LIGHT_DEFAULT;
  const facing = Math.max(dot(v.normal, light), 0) ** (style.focus ?? 4);
  const soft = Math.max(style.softness ?? 0.15, 1e-4);
  return (style.strength ?? 1) * facing * smoothstep(-soft / 2, soft / 2, v.faceFacing);
}

/**
 * Every corner's flare at `time` seconds, dimmest left out (below `minLevel`, default 0.002 of
 * the strength).
 */
export function vertexFlares(
  seen: ProjectedSolid,
  style: FlareStyle = {},
  time = 0,
  minLevel = 0.002,
): VertexFlare[] {
  const twinkle = flickerClamp(style.twinkle ?? FLARE_TWINKLE_DEFAULT);
  const seed = style.seed ?? 0;
  const floor = minLevel * (style.strength ?? 1);
  const out: VertexFlare[] = [];
  seen.vertices.forEach((v, i) => {
    const lit = flareLight(seen, i, style);
    if (lit <= floor) return;
    const level = lit * flickerIntensity(time, seed + i, twinkle);
    if (level > floor) out.push({ vertex: i, x: v.x, y: v.y, level });
  });
  return out;
}

export interface FlareFrame {
  /** Target size, device pixels. */
  width: number;
  height: number;
  /** Total linear light of a flare at level 1, per channel (pixel-area units: a sum). */
  light: readonly [number, number, number];
  /** Number of rays. Default 4. */
  spikes?: number;
  /** Radians. Default pi / 4: a diagonal cross, so it does not lie along the vertical edges. */
  rotation?: number;
  /** Decay length of a ray, device pixels. */
  length: number;
  /** Half-width of a ray, device pixels. Default 0.7. */
  thickness?: number;
  /** Share of the light in the rays; the rest is a sharp point. Default 0.7. */
  spikeShare?: number;
}

export interface FlareLayer {
  /** Adds the flares to `target` (the HDR scene). */
  encode(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    flares: readonly VertexFlare[],
    frame: FlareFrame,
    profiler?: PassProfiler,
  ): void;
  destroy(): void;
}

const SHARP = {
  blades: 0,
  rotation: 0,
  curvature: 0,
  rim: 0,
  rings: 0,
  ringCount: 1,
  vignette: 0,
};

/** The starbursts: a point layer for the core and a glare layer for the rays. */
export function createFlareLayer(
  device: GPUDevice,
  options: { label: string; format?: GPUTextureFormat },
): FlareLayer {
  const format = options.format ?? 'rgba16float';
  const points: PointLayer = createPointLayer(device, { label: options.label, format });
  const glare: GlareLayer = createGlareLayer(device, { label: options.label, format });
  let pointData = new Float32Array(32 * POINT_FLOATS);
  let glareData = new Float32Array(32 * GLARE_FLOATS);

  return {
    encode(encoder, target, flares, frame, profiler) {
      const n = flares.length;
      if (pointData.length < n * POINT_FLOATS) {
        pointData = new Float32Array(n * POINT_FLOATS);
        glareData = new Float32Array(n * GLARE_FLOATS);
      }
      const share = frame.spikeShare ?? 0.7;
      const [r, g, b] = frame.light;
      flares.forEach((flare, i) => {
        const l = flare.level;
        const core = (1 - share) * l;
        pointData.set([flare.x, flare.y, 0, 0, r * core, g * core, b * core, 0], i * POINT_FLOATS);
        glareData.set([flare.x, flare.y, 0, 0, r * l, g * l, b * l, 0], i * GLARE_FLOATS);
      });
      points.setPoints(pointData, n);
      points.encode(
        encoder,
        target,
        { width: frame.width, height: frame.height, aperture: SHARP },
        profiler,
      );
      glare.setLights(glareData, n);
      glare.encode(
        encoder,
        target,
        {
          width: frame.width,
          height: frame.height,
          spikes: frame.spikes ?? 4,
          rotation: frame.rotation ?? Math.PI / 4,
          length: frame.length,
          thickness: frame.thickness ?? 0.7,
          spikeShare: share,
        },
        profiler,
      );
    },
    destroy() {
      points.destroy();
      glare.destroy();
    },
  };
}
