/*
 * An HDR wireframe (story 10.1): a solid's edges as thick, joined lines of light through the shared
 * stroke renderer (`src/gpu/strokes.ts`), composited into an HDR scene.
 *
 *   const wire = createWireLayer(device, { label, format: tail.scene.format });
 *   resize(w, h)  { wire.resize(w, h); }
 *   frame() {
 *     const seen = projectSolid(solid, rotation, view);        // solids.ts
 *     wire.setSolid(seen, { hiddenFade: 0.25 });
 *     wire.encode(encoder, tail.scene.view, { width: 1.5 * dpr, glowRadius: 4 * dpr,
 *                 core: [3, 3, 3], glow: [0.4, 0.6, 1], clear: [0, 0, 0, 1] }, profiler);
 *   }
 *
 * The four things the plan asks of it, and where each comes from:
 *
 *   - Constant width in pixels: the shade (wire-shade.wgsl) draws every edge `width` device pixels
 *     wide, whatever its depth.
 *   - Energy per length: the core's profile across the line integrates to `width` times the level,
 *     so an edge's light is proportional to its length on screen and its pixels are as bright as
 *     any other edge's. A foreshortened edge is short, not hot.
 *   - Joints that do not double: the stroke layer blends with `max`, so where three to five edges
 *     meet the pixel keeps the brightest edge's value, not their sum.
 *   - Hidden edges faded: an edge whose two faces both turn away from the camera is drawn at
 *     `hiddenFade` of its level. For a convex solid that classification is exact (no edge is half
 *     hidden), and it crosses over smoothly, `softness` wide in the faces' cosine, so an edge
 *     rounding the outline dims rather than pops. With max blending, a hidden edge that crosses
 *     a front one never brightens it.
 *
 * And the perspective comes from the projection (solids.ts) plus `depthCue`: the far side of the
 * solid is dimmer, linearly in depth, so the front edges lead and the turn reads one way round.
 */
import type { PassProfiler } from '../profiler.ts';
import { createFullscreenPipeline, renderFullscreen } from '../fullscreen.ts';
import { withChunks } from '../shader.ts';
import { createStrokeLayer, STROKE_FLOATS, type StrokeLayer } from '../strokes.ts';
import { createUniformBuffer, defineUniformStruct } from '../uniforms.ts';
import type { ProjectedSolid } from './solids.ts';
import compositeShader from './wire-composite.wgsl';
import shade from './wire-shade.wgsl';

/** Floats per edge in the stroke layer's `segments` records. */
export const WIRE_FLOATS = STROKE_FLOATS.segments;

/** The anti-aliasing filter across a line, device pixels (a Gaussian's sigma). */
export const WIRE_SIGMA = 0.45;

export interface WireStyle {
  /**
   * Level of an edge hidden behind the solid, relative to a front edge: 0 removes hidden edges,
   * 1 draws them like the rest. Default 0.25.
   */
  hiddenFade?: number;
  /**
   * How wide the crossover from front to hidden is, in the cosine of the nearer face's angle to
   * the camera. Default 0.12: an edge fades over about 14 degrees of turn.
   */
  softness?: number;
  /** How much dimmer the far side of the solid is than the near side, 0..1. Default 0.3. */
  depthCue?: number;
  /** Multiplies every level. Default 1. */
  level?: number;
}

export const WIRE_STYLE_DEFAULT: Required<WireStyle> = {
  hiddenFade: 0.25,
  softness: 0.12,
  depthCue: 0.3,
  level: 1,
};

const smoothstep = (lo: number, hi: number, x: number) => {
  const t = Math.min(Math.max((x - lo) / (hi - lo), 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * How much of an edge is in front, 0 (hidden) to 1 (front), from its `facing` (the larger cosine
 * of its two faces towards the camera; see `ProjectedEdge`).
 */
export function edgeFront(facing: number, softness = WIRE_STYLE_DEFAULT.softness): number {
  const s = Math.max(softness, 1e-4);
  return smoothstep(-s / 2, s / 2, facing);
}

/** An edge's level at each end: front-or-hidden fade times the depth cue at that vertex. */
export function edgeLevels(
  seen: ProjectedSolid,
  edge: number,
  style: WireStyle = {},
): [number, number] {
  const s = { ...WIRE_STYLE_DEFAULT, ...style };
  const e = seen.edges[edge]!;
  const fade = s.level * (s.hiddenFade + (1 - s.hiddenFade) * edgeFront(e.facing, s.softness));
  // z runs from -1 (far side) to 1 (near side) for unit circumradius.
  const cue = (v: number) => 1 - (s.depthCue * (1 - seen.vertices[v]!.position[2])) / 2;
  return [fade * cue(e.a), fade * cue(e.b)];
}

/**
 * Stroke records for every edge, in device pixels: `(x0, y0, x1, y1)`, then the levels at each
 * end, then zeros (WIRE_FLOATS floats per edge). Writes into `out` when it is large enough.
 */
export function packWire(
  seen: ProjectedSolid,
  style: WireStyle = {},
  out?: Float32Array<ArrayBuffer>,
): { data: Float32Array<ArrayBuffer>; count: number } {
  const count = seen.edges.length;
  const data =
    out && out.length >= count * WIRE_FLOATS ? out : new Float32Array(count * WIRE_FLOATS);
  seen.edges.forEach((edge, i) => {
    const a = seen.vertices[edge.a]!;
    const b = seen.vertices[edge.b]!;
    const [l0, l1] = edgeLevels(seen, i, style);
    data.set([a.x, a.y, b.x, b.y, l0, l1, 0, 0, 0, 0, 0, 0], i * WIRE_FLOATS);
  });
  return { data, count };
}

const WireShade = defineUniformStruct('WireShade', {
  width: 'f32',
  sigma: 'f32',
  glow_radius: 'f32',
  glow_on: 'f32',
});
const WireComposite = defineUniformStruct('WireComposite', {
  core: 'vec3f',
  glow: 'vec3f',
  base: 'vec4f',
});

export interface WireFrame {
  /** Line width, device pixels. Below about one pixel the line gets dimmer, not thinner. */
  width: number;
  /** Radius of the tight glow round the line, device pixels; 0 for none. */
  glowRadius: number;
  /** Linear light of the core at level 1 (1 is SDR white; HDR wire is 2 to 5). */
  core: readonly [number, number, number];
  /** Linear light of the glow at its peak, at level 1. */
  glow: readonly [number, number, number];
  /**
   * Make this the scene's first pass: write the scene as this background plus the wire. Without
   * it the wire is added over whatever the scene holds.
   */
  clear?: readonly [number, number, number, number];
}

export interface WireLayer {
  /** The wire's light before compositing: red the core, green the glow, at level 1 per unit. */
  readonly view: GPUTextureView;
  resize(width: number, height: number): void;
  /** Packs and uploads a projected solid's edges. */
  setSolid(seen: ProjectedSolid, style?: WireStyle): void;
  /** Uploads ready-made records (`packWire`, or any WIRE_FLOATS-float segments in pixels). */
  setSegments(data: Float32Array, count: number): void;
  /** Draws the edges and composites them into `scene`. */
  encode(
    encoder: GPUCommandEncoder,
    scene: GPUTextureView,
    frame: WireFrame,
    profiler?: PassProfiler,
  ): void;
  destroy(): void;
}

export function createWireLayer(
  device: GPUDevice,
  options: { label: string; format?: GPUTextureFormat },
): WireLayer {
  const { label } = options;
  const format = options.format ?? 'rgba16float';
  const shadeUniforms = createUniformBuffer(device, WireShade, `${label} wire shade`);
  const compositeUniforms = createUniformBuffer(device, WireComposite, `${label} wire composite`);
  const strokes: StrokeLayer = createStrokeLayer(device, {
    label: `${label} wire`,
    blend: 'max',
    shade,
    uniforms: shadeUniforms,
    passes: { strokes: 'wire' },
  });
  const fragment = withChunks(compositeShader, {
    'wire-composite-params.wgsl': WireComposite.wgsl,
  });
  const add: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one', operation: 'add' };
  const keep: GPUBlendComponent = { srcFactor: 'zero', dstFactor: 'one', operation: 'add' };
  const addPipeline = createFullscreenPipeline(device, {
    fragment,
    format,
    blend: { color: add, alpha: keep },
    label: `${label} wire add`,
  });
  const clearPipeline = createFullscreenPipeline(device, {
    fragment,
    format,
    label: `${label} wire clear`,
  });
  let data = new Float32Array(64 * WIRE_FLOATS);

  return {
    get view() {
      return strokes.view;
    },
    resize(width, height) {
      strokes.resize(width, height);
    },
    setSolid(seen, style) {
      const packed = packWire(seen, style, data);
      data = packed.data;
      strokes.setStrokes(data, packed.count);
    },
    setSegments(records, count) {
      strokes.setStrokes(records, count);
    },
    encode(encoder, scene, frame, profiler) {
      shadeUniforms.set({
        width: Math.max(frame.width, 0.05),
        sigma: WIRE_SIGMA,
        glow_radius: Math.max(frame.glowRadius, 1e-3),
        glow_on: frame.glowRadius > 0 ? 1 : 0,
      });
      shadeUniforms.upload();
      compositeUniforms.set({
        core: [...frame.core],
        glow: [...frame.glow],
        base: frame.clear ? [...frame.clear] : [0, 0, 0, 0],
      });
      compositeUniforms.upload();
      // Positions are already device pixels.
      strokes.encode(encoder, { scale: [1, 1] }, profiler);
      const pipeline = frame.clear ? clearPipeline : addPipeline;
      renderFullscreen(
        encoder,
        scene,
        pipeline,
        [
          device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: strokes.view },
              { binding: 1, resource: { buffer: compositeUniforms.buffer } },
            ],
          }),
        ],
        { load: !frame.clear, timestampWrites: profiler?.pass('wire composite') },
      );
    },
    destroy() {
      strokes.destroy();
      shadeUniforms.destroy();
      compositeUniforms.destroy();
    },
  };
}
