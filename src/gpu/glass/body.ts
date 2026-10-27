/*
 * The traced glass body (stories 9.4 to 9.6) as a reusable layer: a glass Platonic solid turned in
 * front of a night backdrop, refracting and dispersing it, glowing inside, with caustics at its
 * corners. `glass-solid` is a thin wrapper round it; the showpiece (10.5) lays the wireframe
 * (src/gpu/wire) and the spectral bloom over it.
 *
 *   const body = createGlassBody(device, { format: tail.scene.format });
 *   resize(w, h) { body.resize(w, h); }
 *   frame(...) {
 *     body.encode(encoder, tail.scene.view, {
 *       solid: 'icosahedron', rotation: turn(angle), view: { center: [w / 2, h / 2], size: 0.3 * h, distance: 4 },
 *       frame: time.frame,
 *     }, profiler);
 *   }
 *
 * It draws the whole frame, backdrop and all (the glass has to see what is behind it), in linear
 * HDR radiance, with the solid's coverage in alpha (1 inside its outline, 0 outside), so a layer
 * over it can tell body from backdrop. The view and rotation follow the wireframe's conventions:
 * see solid.ts.
 *
 * Passes: the light-traced caustics (two compute passes, only when `caustics` is 'traced') and one
 * fullscreen fragment pass that writes the target and the next frame's history together.
 */
import { createShader, withChunks } from '../shader.ts';
import { createFullscreenPipeline, renderFullscreen } from '../fullscreen.ts';
import type { PassProfiler } from '../profiler.ts';
import { createPingPongTarget, createRenderTarget } from '../targets.ts';
import { createUniformBuffer, defineUniformStruct, uniformArray } from '../uniforms.ts';
import { packSolid, rotatePlanes, type Plane, type PlatonicSolid } from '../optics/glass.ts';
import bodyShader from './body.wgsl';
import causticShader from './caustics.wgsl';
import {
  applyMat3,
  faceFrames,
  mat3Columns,
  normalize,
  packFaceFrames,
  projectView,
  solidPlanes,
  solidVertices,
  transposeMat3,
  vertexFaces,
  type GlassView,
  type Mat3,
  type Vec3,
} from './solid.ts';

type Rgb = readonly [number, number, number];

export const GLASS_NAMES = ['crown', 'flint', 'diamond', 'air'] as const;
export type GlassName = (typeof GLASS_NAMES)[number];
export const SAMPLING_MODES = ['spectral', 'three-channel'] as const;
export type SamplingMode = (typeof SAMPLING_MODES)[number];
export const CAUSTIC_MODES = ['traced', 'stand-in', 'off'] as const;
export type CausticMode = (typeof CAUSTIC_MODES)[number];
export const BACKDROPS = ['night', 'uniform', 'gradient'] as const;
export type Backdrop = (typeof BACKDROPS)[number];

/** The most internal reflections a frame may ask for. */
export const MAX_BOUNCES = 8;
/** Texels along each side of a face's tile in the caustic atlas. */
export const CAUSTIC_TILE = 32;

export interface GlassKeyLight {
  /** Unit direction towards the light (the moon), in the view frame. */
  direction: Vec3;
  colour: Rgb;
  /** The moon's radiance as seen, relative to SDR white. */
  moon: number;
  /** Its angular radius, radians. */
  moonRadius: number;
}

export const DEFAULT_KEY: GlassKeyLight = {
  direction: normalize([-0.42, 0.3, -1]),
  colour: [1, 0.96, 0.9],
  moon: 30,
  moonRadius: 0.025,
};

export interface GlassBodyFrame {
  /** A Platonic solid of unit circumradius, or the planes of any convex solid (at most 20). */
  solid: PlatonicSolid | readonly Plane[];
  /** The solid's frame into the view frame (row-major). */
  rotation: Mat3;
  view: GlassView;
  /** `time.frame`: steps the sample sequence. */
  frame: number;
  glass?: GlassName;
  /** Hero wavelengths, or three channels at three indices. Default spectral. */
  sampling?: SamplingMode;
  /** Hero samples (four wavelengths each) or three-channel rays per pixel per frame. Default 2. */
  samples?: number;
  /** Reflections inside before the rest is dropped, 0 to MAX_BOUNCES. Default 5. */
  bounces?: number;
  /** Beer-Lambert absorption per circumradius of path, per channel (uplifted when spectral). */
  absorb?: Rgb;
  /** Light the glass gives off per circumradius of path, linear RGB. */
  emission?: Rgb;
  /** Thin-film thickness on the faces, nm; 0 for none. */
  film?: number;
  filmIor?: number;
  /** How much thinner the film is at the top of the solid than at its centre (0 to 0.9). */
  filmDrain?: number;
  caustics?: CausticMode;
  /** The traced caustics: the share of the light on a face it scatters towards the eye. */
  causticGain?: number;
  /** Light rays traced per frame for the caustics. Default 65 536. */
  causticRays?: number;
  /** The stand-in's brightness, and the radius of its glows in device pixels. */
  standInGain?: number;
  standInRadius?: number;
  key?: GlassKeyLight;
  backdrop?: Backdrop;
  horizon?: number;
  lights?: number;
  stars?: number;
  /** The share of the new frame in the history while the solid turns (1 keeps none). */
  history?: number;
  /** Start the history (and caustic average) again from this frame. */
  reset?: boolean;
  /** Jitter the ray inside the pixel (antialiasing). Default true. */
  jitter?: boolean;
  /**
   * Resolution of the trace against the target's, 0.25 to 1. Default 1. The trace is the cost, so
   * half resolution costs about a quarter; the body comes out softer, which a layer that will be
   * defocused anyway (10.4) does not mind.
   */
  scale?: number;
  /** Draw the backdrop into the target first. Default true. */
  drawBackdrop?: boolean;
  /** Composite the body over the target. Default true; false leaves it in `layer` only. */
  composite?: boolean;
}

export interface GlassBody {
  /** The size of the target `encode` draws into; call before the first encode. */
  resize(width: number, height: number): void;
  /**
   * The body alone as of the last encode, at `scale` of the target's size: premultiplied linear
   * RGB (the solid's own light, nothing of the backdrop round it) with its coverage in alpha. For
   * a layer that treats the body on its own, e.g. blurs it (10.4). Changes on resize.
   */
  readonly layer: GPUTextureView;
  encode(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    frame: GlassBodyFrame,
    profiler?: PassProfiler,
  ): void;
  /**
   * The traced caustic atlas as it stands (irradiance relative to the key light's, RGBA per texel,
   * `CAUSTIC_TILE` squared texels a face in face order), for tests and tools.
   */
  readCaustics(): Promise<Float32Array>;
  /** What the last frame did: samples, caustic rays, frames averaged. */
  stats(): Readonly<Record<string, string | number>>;
  destroy(): void;
}

export interface GlassBodyOptions {
  /** Format of the target `encode` draws into (an HDR scene, e.g. the tail's rgba16float). */
  format: GPUTextureFormat;
  label?: string;
}

const MAX_VERTICES = 20;

export const BodyParams = defineUniformStruct('BodyParams', {
  rotation: 'mat3x3f',
  center: 'vec2f',
  size: 'f32',
  distance: 'f32',
  absorb: 'vec3f',
  glass: 'u32',
  emission: 'vec3f',
  mode: 'u32',
  key_dir: 'vec3f',
  samples: 'u32',
  key_rgb: 'vec3f',
  bounces: 'u32',
  standin_rgb: 'vec3f',
  vertex_count: 'u32',
  film: 'f32',
  film_ior: 'f32',
  caustics: 'f32',
  standin: 'f32',
  standin_radius: 'f32',
  blend: 'f32',
  frame: 'u32',
  backdrop: 'u32',
  px_per_rad: 'f32',
  moon_radius: 'f32',
  moon: 'f32',
  horizon: 'f32',
  lights: 'f32',
  stars: 'f32',
  tile: 'u32',
  jitter: 'f32',
  layer_scale: 'f32',
  film_drain: 'f32',
  vertices: uniformArray('vec4f', MAX_VERTICES),
});

export const CausticParams = defineUniformStruct('CausticParams', {
  light: 'vec3f',
  beam: 'f32',
  light_rgb: 'vec3f',
  rays: 'u32',
  absorb: 'vec3f',
  glass: 'u32',
  u: 'vec3f',
  frame: 'u32',
  w: 'vec3f',
  bounces: 'u32',
  film: 'f32',
  film_ior: 'f32',
  mode: 'u32',
  tile: 'u32',
  faces: 'u32',
  blend: 'f32',
  flux: 'f32',
  min_bounce: 'u32',
  film_drain: 'f32',
});

const SOLID_BYTES = 84 * 4;

interface SolidData {
  key: string;
  planes: Plane[];
  vertices: Vec3[];
  vertexFaces: number[][];
  tileArea: number;
}

function describeSolid(solid: PlatonicSolid | readonly Plane[]): SolidData {
  const planes = solidPlanes(solid);
  const vertices = solidVertices(planes);
  const frames = faceFrames(planes, vertices);
  return {
    key: typeof solid === 'string' ? solid : JSON.stringify(solid),
    planes,
    vertices,
    vertexFaces: vertexFaces(planes, vertices),
    tileArea: ((2 * frames[0]!.radius) / CAUSTIC_TILE) ** 2,
  };
}

/**
 * The pixels the solid can reach whatever its turn: the box round its circumsphere's outline, a
 * few pixels wider for the stand-in's glows at the edge. Undefined when it is off screen.
 */
export function sphereBox(
  view: GlassView,
  width: number,
  height: number,
): [number, number, number, number] | undefined {
  const d = view.distance;
  const radius =
    (Number.isFinite(d) ? (view.size * d) / Math.sqrt(Math.max(d * d - 1, 1e-6)) : view.size) + 3;
  const x0 = Math.max(0, Math.floor(view.center[0] - radius));
  const y0 = Math.max(0, Math.floor(view.center[1] - radius));
  const x1 = Math.min(width, Math.ceil(view.center[0] + radius));
  const y1 = Math.min(height, Math.ceil(view.center[1] + radius));
  return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : undefined;
}

/** A view seen at `scale` of its resolution. */
const scaleView = (view: GlassView, scale: number): GlassView => ({
  center: [view.center[0] * scale, view.center[1] * scale],
  size: view.size * scale,
  distance: view.distance,
});

export function createGlassBody(device: GPUDevice, options: GlassBodyOptions): GlassBody {
  const label = options.label ?? 'glass body';
  const uniforms = createUniformBuffer(device, BodyParams, label);
  const causticUniforms = createUniformBuffer(device, CausticParams, `${label} caustics`);
  const solidBuffer = device.createBuffer({
    label: `${label} solid`,
    size: SOLID_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const localSolidBuffer = device.createBuffer({
    label: `${label} solid (own frame)`,
    size: SOLID_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const facesBuffer = device.createBuffer({
    label: `${label} face frames`,
    size: 20 * 12 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const texels = 20 * CAUSTIC_TILE * CAUSTIC_TILE;
  const accum = device.createBuffer({
    label: `${label} caustic counts`,
    size: texels * 3 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const atlas = device.createBuffer({
    label: `${label} caustic atlas`,
    size: texels * 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });

  const history = createPingPongTarget(device, {
    label: `${label} history`,
    format: 'rgba16float',
    width: 1,
    height: 1,
  });
  const layer = createRenderTarget(device, {
    label: `${label} layer`,
    format: 'rgba16float',
    width: 1,
    height: 1,
  });
  const pipeline = createFullscreenPipeline(device, {
    fragment: withChunks(bodyShader, { 'body-params.wgsl': BodyParams.wgsl }),
    entryPoint: 'body',
    format: [layer.format, history.read.format],
    label,
  });
  // The body over whatever is in the target, premultiplied.
  const compositePipeline = createFullscreenPipeline(device, {
    fragment: withChunks(bodyShader, { 'body-params.wgsl': BodyParams.wgsl }),
    entryPoint: 'composite',
    format: options.format,
    blend: {
      color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
    },
    label: `${label} composite`,
  });
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  // Everything outside the solid's reach is backdrop alone: a light pass of its own, so the heavy
  // one only runs over the box round the solid's bounding sphere.
  const backdropPipeline = createFullscreenPipeline(device, {
    fragment: withChunks(bodyShader, { 'body-params.wgsl': BodyParams.wgsl }),
    entryPoint: 'backdrop',
    format: options.format,
    label: `${label} backdrop`,
  });
  const backdropGroup = device.createBindGroup({
    layout: backdropPipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniforms.buffer } }],
  });
  const causticModule = createShader(
    device,
    withChunks(causticShader, { 'caustic-params.wgsl': CausticParams.wgsl }),
  );
  const splat = device.createComputePipeline({
    label: `${label} caustic splat`,
    layout: 'auto',
    compute: { module: causticModule, entryPoint: 'splat' },
  });
  const resolve = device.createComputePipeline({
    label: `${label} caustic resolve`,
    layout: 'auto',
    compute: { module: causticModule, entryPoint: 'resolve' },
  });
  const splatGroup = device.createBindGroup({
    layout: splat.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: causticUniforms.buffer } },
      { binding: 1, resource: { buffer: localSolidBuffer } },
      { binding: 2, resource: { buffer: facesBuffer } },
      { binding: 3, resource: { buffer: accum } },
    ],
  });
  const resolveGroup = device.createBindGroup({
    layout: resolve.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: causticUniforms.buffer } },
      { binding: 3, resource: { buffer: accum } },
      { binding: 4, resource: { buffer: atlas } },
    ],
  });

  let solid: SolidData | undefined;
  let width = 1;
  let height = 1;
  let groups: GPUBindGroup[] = [];
  let compositeGroup: GPUBindGroup;
  let lastKey = '';
  let lastRotation = '';
  let averaged = 0;
  let causticAveraged = 0;
  let lastStats: Record<string, string | number> = {};

  const bindGroups = () => {
    groups = [history.read, history.write].map((source) =>
      device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniforms.buffer } },
          { binding: 1, resource: { buffer: solidBuffer } },
          { binding: 2, resource: source.view },
          { binding: 3, resource: { buffer: atlas } },
          { binding: 4, resource: { buffer: facesBuffer } },
        ],
      }),
    );
    compositeGroup = device.createBindGroup({
      layout: compositePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 5, resource: layer.view },
        { binding: 6, resource: sampler },
      ],
    });
  };
  bindGroups();
  let readIndex = 0;

  return {
    get layer() {
      return layer.view;
    },

    resize(w, h) {
      width = Math.max(1, Math.round(w));
      height = Math.max(1, Math.round(h));
    },

    encode(encoder, target, f, profiler) {
      const glass = f.glass ?? 'crown';
      const sampling = f.sampling ?? 'spectral';
      const samples = Math.max(1, Math.round(f.samples ?? 2));
      const bounces = Math.min(MAX_BOUNCES, Math.max(0, Math.round(f.bounces ?? 5)));
      const absorb = f.absorb ?? [0, 0, 0];
      const emission = f.emission ?? [0, 0, 0];
      const caustics = f.caustics ?? 'traced';
      const key = f.key ?? DEFAULT_KEY;
      const causticRays = Math.max(64, Math.round(f.causticRays ?? 65536));
      const scale = Math.min(1, Math.max(0.25, f.scale ?? 1));
      const layerWidth = Math.max(1, Math.round(width * scale));
      const layerHeight = Math.max(1, Math.round(height * scale));
      const resized = history.resize(layerWidth, layerHeight);
      if (layer.resize(layerWidth, layerHeight) || resized) {
        // Rebuild against the new textures; the pair is in its original order again.
        bindGroups();
        readIndex = 0;
        lastKey = '';
      }

      const solidKey = typeof f.solid === 'string' ? f.solid : JSON.stringify(f.solid);
      if (solid?.key !== solidKey) {
        solid = describeSolid(f.solid);
        if (solid.planes.length > 20) throw new Error('glass body: at most 20 faces');
        device.queue.writeBuffer(localSolidBuffer, 0, packSolid(solid.planes));
        const frames = faceFrames(solid.planes, solid.vertices);
        device.queue.writeBuffer(facesBuffer, 0, packFaceFrames(frames));
      }
      device.queue.writeBuffer(solidBuffer, 0, packSolid(rotatePlanes(solid.planes, f.rotation)));

      // Restart the averages when anything but the turn changes; keep averaging while it holds still.
      const settingsKey = JSON.stringify({ ...f, rotation: 0, frame: 0, reset: 0, history: 0 });
      const rotationKey = f.rotation.join(',');
      const moving = rotationKey !== lastRotation;
      const restart = f.reset === true || settingsKey !== lastKey;
      const share = Math.min(1, Math.max(0.01, f.history ?? 0.25));
      if (restart) averaged = 1;
      else if (moving) averaged = Math.max(1, Math.round(1 / share));
      else averaged = Math.min(averaged + 1, 512);
      const blend = restart ? 1 : moving ? share : 1 / averaged;
      if (restart) causticAveraged = 1;
      else if (moving) causticAveraged = 5;
      else causticAveraged = Math.min(causticAveraged + 1, 256);
      const causticBlend = restart ? 1 : moving ? 0.2 : 1 / causticAveraged;
      lastKey = settingsKey;
      lastRotation = rotationKey;

      const inverse = transposeMat3(f.rotation);
      const towardLight = normalize(key.direction);
      const n = solid.planes.length;

      // The stand-in: each corner glows by how squarely the faces round it meet the light, the light
      // that comes in through them and is reflected together towards the corner.
      const vertexData = new Float32Array(MAX_VERTICES * 4);
      const seenVertices = solid.vertices.slice(0, MAX_VERTICES);
      seenVertices.forEach((v, i) => {
        const [x, y] = projectView(f.view, applyMat3(f.rotation, v));
        const around = solid!.vertexFaces[i]!;
        let lit = 0;
        for (const face of around) {
          const normal = applyMat3(f.rotation, solid!.planes[face]!);
          lit += Math.max(
            0,
            normal[0] * towardLight[0] + normal[1] * towardLight[1] + normal[2] * towardLight[2],
          );
        }
        lit /= Math.max(1, around.length);
        vertexData.set([x, y, Math.min(1, 2.5 * lit * lit), 0], i * 4);
      });
      // Light that crossed the glass is tinted by it: about one circumradius of path.
      const tint = [0, 1, 2].map((c) => key.colour[c]! * Math.exp(-absorb[c]!)) as unknown as Rgb;

      uniforms.set({
        rotation: mat3Columns(f.rotation),
        center: f.view.center,
        size: f.view.size,
        distance: Number.isFinite(f.view.distance) ? f.view.distance : 1e6,
        absorb,
        glass: GLASS_NAMES.indexOf(glass),
        emission,
        mode: sampling === 'spectral' ? 0 : 1,
        key_dir: towardLight,
        samples,
        key_rgb: key.colour,
        bounces,
        standin_rgb: tint,
        vertex_count: seenVertices.length,
        film: Math.max(0, f.film ?? 0),
        film_ior: f.filmIor ?? 1.33,
        caustics: caustics === 'traced' ? (f.causticGain ?? 0.15) : 0,
        standin: caustics === 'stand-in' ? (f.standInGain ?? 1) : 0,
        standin_radius: f.standInRadius ?? 0.07 * f.view.size,
        blend,
        frame: f.frame % 4096,
        backdrop: Math.max(0, BACKDROPS.indexOf(f.backdrop ?? 'night')),
        px_per_rad: f.view.size * (Number.isFinite(f.view.distance) ? f.view.distance : 4),
        moon_radius: key.moonRadius,
        moon: key.moon,
        horizon: f.horizon ?? 1,
        lights: f.lights ?? 1,
        stars: f.stars ?? 1,
        tile: CAUSTIC_TILE,
        jitter: f.jitter === false ? 0 : 1,
        layer_scale: layerWidth / width,
        film_drain: f.filmDrain ?? 0,
        vertices: vertexData,
      });
      uniforms.upload();

      if (caustics === 'traced') {
        // The light travels away from the moon: into the solid, in the solid's own frame.
        const light = normalize(
          applyMat3(
            inverse,
            towardLight.map((v) => -v),
          ),
        );
        const u = normalize(
          Math.abs(light[1]) < 0.9 ? [light[2], 0, -light[0]] : [0, -light[2], light[1]],
        );
        const w: Vec3 = [
          light[1] * u[2] - light[2] * u[1],
          light[2] * u[0] - light[0] * u[2],
          light[0] * u[1] - light[1] * u[0],
        ];
        const beam = 1.02;
        causticUniforms.set({
          light,
          beam,
          light_rgb: key.colour,
          rays: causticRays,
          absorb,
          glass: GLASS_NAMES.indexOf(glass),
          u,
          frame: f.frame,
          w,
          bounces,
          film: Math.max(0, f.film ?? 0),
          film_ior: f.filmIor ?? 1.33,
          mode: sampling === 'spectral' ? 0 : 1,
          tile: CAUSTIC_TILE,
          faces: n,
          blend: causticBlend,
          flux: (Math.PI * beam * beam) / causticRays / solid.tileArea,
          min_bounce: 1,
          film_drain: f.filmDrain ?? 0,
        });
        causticUniforms.upload();
        encoder.clearBuffer(accum);
        const pass = encoder.beginComputePass({
          label: `${label} caustics`,
          timestampWrites: profiler?.pass('caustics'),
        });
        pass.setPipeline(splat);
        pass.setBindGroup(0, splatGroup);
        pass.dispatchWorkgroups(Math.ceil(causticRays / 64));
        pass.setPipeline(resolve);
        pass.setBindGroup(0, resolveGroup);
        pass.dispatchWorkgroups(Math.ceil((n * CAUSTIC_TILE * CAUSTIC_TILE) / 64));
        pass.end();
      }

      if (f.drawBackdrop !== false) {
        renderFullscreen(encoder, target, backdropPipeline, [backdropGroup], {
          label: `${label} backdrop`,
          timestampWrites: profiler?.pass('backdrop'),
        });
      }
      const box = sphereBox(f.view, width, height);
      const layerBox =
        box && sphereBox(scaleView(f.view, layerWidth / width), layerWidth, layerHeight);
      const write = readIndex === 0 ? history.write : history.read;
      const pass = encoder.beginRenderPass({
        label,
        colorAttachments: [
          { view: layer.view, loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' },
          { view: write.view, loadOp: 'load', storeOp: 'store' },
        ],
        timestampWrites: profiler?.pass('glass body'),
      });
      if (layerBox) {
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, groups[readIndex]!);
        pass.setScissorRect(...layerBox);
        pass.draw(3);
      }
      pass.end();
      readIndex = 1 - readIndex;
      if (box && f.composite !== false) {
        const over = encoder.beginRenderPass({
          label: `${label} composite`,
          colorAttachments: [{ view: target, loadOp: 'load', storeOp: 'store' }],
          timestampWrites: profiler?.pass('glass composite'),
        });
        over.setPipeline(compositePipeline);
        over.setBindGroup(0, compositeGroup);
        over.setScissorRect(...box);
        over.draw(3);
        over.end();
      }
      lastStats = {
        samples: sampling === 'spectral' ? `${samples} x 4 wavelengths` : `${samples} x 3 channels`,
        averaged,
        causticRays: caustics === 'traced' ? causticRays : 0,
      };
    },

    stats: () => lastStats,

    async readCaustics() {
      const copy = device.createBuffer({
        size: atlas.size,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      const encoder = device.createCommandEncoder();
      encoder.copyBufferToBuffer(atlas, 0, copy, 0, atlas.size);
      device.queue.submit([encoder.finish()]);
      await copy.mapAsync(GPUMapMode.READ);
      const data = new Float32Array(copy.getMappedRange().slice(0));
      copy.unmap();
      copy.destroy();
      return data;
    },

    destroy() {
      uniforms.destroy();
      causticUniforms.destroy();
      solidBuffer.destroy();
      localSolidBuffer.destroy();
      facesBuffer.destroy();
      accum.destroy();
      atlas.destroy();
      history.destroy();
      layer.destroy();
    },
  };
}
