import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { createGlassBody, DEFAULT_KEY } from '../../gpu/glass/body.ts';
import type { Plane } from '../../gpu/optics/glass.ts';
import { multiplyMat3, rotationAxisAngle, turn, type Mat3 } from '../../gpu/glass/solid.ts';
import { createBlur } from '../../gpu/passes/blur.ts';
import { trackPointer } from '../../gpu/pointer.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { createSpectralBloom } from '../../gpu/post/spectral-bloom.ts';
import { createRenderTarget } from '../../gpu/targets.ts';
import { projectSolid, solidNamed } from '../../gpu/wire/solids.ts';
import {
  createFlareLayer,
  FLARE_SAFE_MAX_TURN,
  vertexFlares,
} from '../../gpu/wire/vertex-flares.ts';
import { createWireLayer } from '../../gpu/wire/wireframe.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';
import shader from './soft.wgsl';

/*
 * The showpiece (story 10.5), and the composition of story 10.4: a sharp wire over a soft body.
 *
 * Each frame, back to front:
 *   1. The backdrop and the traced glass body (src/gpu/glass/body.ts, 9.4 to 9.6): night sky, a
 *      bright horizon straight across the middle, lights and the moon; the solid refracting and
 *      dispersing them, absorbing red so it glows cyan inside, with the stand-in caustic glows at
 *      its corners (9.5's choice). The body goes to its own layer, not the scene.
 *   2. The body out of focus (10.4): its layer blurred as an image and laid over the backdrop. The
 *      wire is the subject in focus in front; the body sits behind and through it, soft. Blurring
 *      the layer is right here because the body is one object at one depth: a depth-of-field method
 *      with one circle of confusion everywhere is a blur. Generated already soft it could not show
 *      the horizon bent through it.
 *   3. The wire (10.1), sharp, and the corner starbursts (10.3) over it.
 *   4. The halo (10.2): spectral bloom over everything, red spreading widest, so the whole thing
 *      wears a rim that turns gold, orange and red outwards. 9.7 found the reference's red rim is
 *      halation rather than the lens's colour error, so this, not spectral depth of field, makes it.
 *
 * The wire and the body share one rotation and one view, in the conventions of
 * src/gpu/wire/solids.ts, so the edges sit on the glass.
 */

/** The angle a held frame shows: a corner up and a face towards us, the reference's pose. */
const REST_ANGLE = 0.45;
const BODY = rotationAxisAngle([0.3, 0.1, 1], 0.32);
/** How far a drag can turn it, radians a second: the corner flares' flash limit (10.3). */
const MAX_TURN_RATE = 2 * Math.PI * FLARE_SAFE_MAX_TURN * 0.5;
/**
 * One icosahedron for both: the glass body's planes are built from the wire's own faces. The two
 * modules each have an icosahedron of unit circumradius, but not in the same orientation, and the
 * edges must sit exactly on the glass.
 */
const SOLID = solidNamed('icosahedron');
const PLANES: Plane[] = SOLID.faces.map((face) => {
  const n = face.normal;
  return [
    n[0],
    n[1],
    n[2],
    n[0] * face.centroid[0] + n[1] * face.centroid[1] + n[2] * face.centroid[2],
  ];
});
const PLATE = undefined;

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    size: { type: 'number', default: 0.3, min: 0.12, max: 0.45, step: 0.01 },
    turnSpeed: {
      type: 'number',
      default: 0.1,
      min: 0,
      max: 0.6,
      step: 0.01,
      label: 'turn (rad/s)',
    },
    tilt: { type: 'number', default: 0.35, min: -1, max: 1, step: 0.01 },
    glass: { type: 'select', default: 'flint', options: ['crown', 'flint', 'diamond'] },
    focus: {
      type: 'number',
      default: 0.035,
      min: 0,
      max: 0.12,
      step: 0.005,
      label: 'body out of focus (share of size)',
    },
    transmission: { type: 'color', default: [0.3, 0.72, 1], label: 'glass colour' },
    absorption: { type: 'number', default: 0.7, min: 0, max: 3, step: 0.01 },
    glow: { type: 'number', default: 0.16, min: 0, max: 0.3, step: 0.001 },
    corners: { type: 'number', default: 0.5, min: 0, max: 2, step: 0.01, label: 'corner light' },
    wire: { type: 'number', default: 4.5, min: 0, max: 8, step: 0.1, label: 'wire brightness' },
    edgeWidth: {
      type: 'number',
      default: 1.4,
      min: 0.5,
      max: 4,
      step: 0.1,
      label: 'edge width (CSS px)',
    },
    hiddenFade: {
      type: 'number',
      default: 0.12,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'hidden-edge fade',
    },
    flares: { type: 'number', default: 0.9, min: 0, max: 3, step: 0.05, label: 'corner flares' },
    halo: { type: 'number', default: 0.45, min: 0, max: 0.6, step: 0.01, label: 'halo strength' },
    haloRadius: {
      type: 'number',
      default: 0.3,
      min: 0.02,
      max: 0.5,
      step: 0.01,
      label: 'halo reach (share of size)',
    },
    haloSpread: {
      type: 'number',
      default: 4,
      min: 1,
      max: 6,
      step: 0.1,
      label: 'red spreads wider by',
    },
    moon: { type: 'number', default: 12, min: 0, max: 100, step: 1 },
    horizon: { type: 'number', default: 1.5, min: 0, max: 6, step: 0.05 },
    stars: { type: 'number', default: 1, min: 0, max: 3, step: 0.05 },
    resolution: {
      type: 'number',
      default: 0.5,
      min: 0.25,
      max: 1,
      step: 0.05,
      label: 'glass resolution',
    },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.15 },
    bloomThreshold: { ...TAIL_PARAMS.bloomThreshold, default: 2 },
  },
  presets: {
    showpiece: {},
    'body in focus': { focus: 0 },
    'diamond fire': { glass: 'diamond', absorption: 0.3, halo: 0.35 },
    'clear crown': { glass: 'crown', absorption: 0.15, glow: 0.03 },
    'wire and halo only': { absorption: 3, glow: 0, corners: 0, moon: 0, horizon: 0.4 },
    'wide halo': { halo: 0.55, haloRadius: 0.42, haloSpread: 5 },
  },

  async create({ device, format, hdr, canvas, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'prism icosahedron' });
    const sceneFormat = tail.scene.format;
    const body = createGlassBody(device, { format: sceneFormat, label: 'prism icosahedron' });
    const wire = createWireLayer(device, { label: 'prism icosahedron', format: sceneFormat });
    const flares = createFlareLayer(device, { label: 'prism icosahedron', format: sceneFormat });
    const bloom = createSpectralBloom(device, { label: 'prism icosahedron', format: sceneFormat });
    const pointer = trackPointer(canvas, { capture: true });
    const blurFormat: GPUTextureFormat = 'rgba16float';
    const softA = createRenderTarget(device, {
      label: 'soft body',
      format: blurFormat,
      width: 1,
      height: 1,
    });
    const softB = createRenderTarget(device, {
      label: 'soft body 2',
      format: blurFormat,
      width: 1,
      height: 1,
    });
    const blur = createBlur(device, {
      label: 'soft body',
      format: blurFormat,
      width: 1,
      height: 1,
    });
    const soft = createFullscreenPipeline(device, {
      fragment: shader,
      entryPoint: 'soft',
      format: sceneFormat,
      // Premultiplied over: the blurred body, and the backdrop through what it does not cover.
      blend: {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      },
    });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    let width = 1;
    let height = 1;
    let dpr = 1;
    let clock = 0;
    let layerWidth = 0;
    let layerHeight = 0;
    /** The drag's own turn, added to the turntable's, eased so it never outruns the flares' limit. */
    let yaw = 0;
    let pitch = 0;
    let aimYaw = 0;
    let aimPitch = 0;

    function resizeSoft(scale: number) {
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      if (w === layerWidth && h === layerHeight) return;
      layerWidth = w;
      layerHeight = h;
      softA.resize(w, h);
      softB.resize(w, h);
      blur.resize(w, h);
    }

    return {
      resize(w, h, ratio) {
        width = w;
        height = h;
        dpr = ratio;
        tail.resize(w, h);
        body.resize(w, h);
        wire.resize(w, h);
        bloom.resize(w, h);
        layerWidth = 0;
      },
      frame(time, encoder, target) {
        const still = time.still === true;
        if (!still) clock += time.delta;
        // Drag to turn: the pointer's movement sets where the solid is heading.
        const { dx, dy } = pointer.takeDelta();
        if (pointer.state.down && !still) {
          aimYaw += dx * Math.PI;
          aimPitch = Math.max(-0.6, Math.min(0.6, aimPitch + dy * Math.PI));
        }
        const step = MAX_TURN_RATE * Math.max(time.delta, 0);
        yaw += Math.max(-step, Math.min(step, aimYaw - yaw));
        pitch += Math.max(-step, Math.min(step, aimPitch - pitch));
        const spin = Math.min(params.turnSpeed, MAX_TURN_RATE);
        const angle = still ? REST_ANGLE : REST_ANGLE + clock * spin + yaw;
        const rotation: Mat3 = multiplyMat3(
          rotationAxisAngle([1, 0, 0], still ? 0 : pitch),
          turn(angle, params.tilt, BODY),
        );
        const size = params.size * height;
        const view = { center: [width / 2, height / 2] as const, size, distance: 4 };
        const scale = params.resolution;
        resizeSoft(scale);

        // 1. Backdrop into the scene, the body into its own layer.
        const absorb = params.transmission.map(
          (c) => -Math.log(Math.max(c, 1e-3)) * params.absorption,
        ) as [number, number, number];
        const glow = [0.15, 0.55, 1].map((c) => c * params.glow) as [number, number, number];
        body.encode(
          encoder,
          tail.scene.view,
          {
            solid: PLANES,
            rotation,
            view,
            frame: time.frame,
            glass: params.glass as 'crown' | 'flint' | 'diamond',
            sampling: 'spectral',
            samples: still ? 8 : 1,
            bounces: 5,
            absorb,
            emission: glow,
            caustics: params.corners > 0 ? 'stand-in' : 'off',
            standInGain: params.corners * 1.4,
            key: { ...DEFAULT_KEY, moon: params.moon },
            horizon: params.horizon,
            stars: params.stars,
            reset: still,
            history: Math.min(0.5, 0.1 + 0.5 * (spin + Math.abs(aimYaw - yaw))),
            scale,
            drawBackdrop: true,
            composite: false,
          },
          profiler,
        );

        // 2. The body out of focus: its layer blurred and laid over the backdrop.
        const sigma = params.focus * size * scale;
        let softView = body.layer;
        if (sigma >= 0.5) {
          const radius = Math.min(64, Math.ceil(sigma * 3));
          blur.encode(encoder, body.layer, softA.view, {
            radius,
            sigma: Math.min(sigma, radius / 3),
          });
          softView = softA.view;
        }
        renderFullscreen(
          encoder,
          tail.scene.view,
          soft,
          [
            device.createBindGroup({
              layout: soft.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: softView },
                { binding: 1, resource: sampler },
              ],
            }),
          ],
          { load: true, timestampWrites: profiler.pass('soft body') },
        );

        // 3. The wire, sharp, and the starbursts on the corners facing the light.
        const seen = projectSolid(SOLID, rotation, view);
        wire.setSolid(seen, { hiddenFade: params.hiddenFade, depthCue: 0.25 });
        const w = params.wire;
        wire.encode(
          encoder,
          tail.scene.view,
          {
            width: params.edgeWidth * dpr,
            glowRadius: 3 * params.edgeWidth * dpr,
            core: [w, w, w],
            glow: [0.2 * w * 0.55, 0.2 * w * 0.78, 0.2 * w],
            clear: PLATE,
          },
          profiler,
        );
        const list = vertexFlares(
          seen,
          {
            strength: params.flares * (still ? 0.55 : 1),
            twinkle: {
              rate: 1.5,
              depth: still ? 0 : 0.18,
              shimmer: still ? 0 : 0.02,
              shimmerRate: 8,
            },
            seed: 1013,
          },
          clock,
        );
        const light = 0.014 * size * size * (w / 2.5);
        flares.encode(
          encoder,
          tail.scene.view,
          list,
          {
            width,
            height,
            light: [light, light, light],
            spikes: 4,
            rotation: Math.PI / 4,
            length: 0.1 * size,
            thickness: 0.6 * dpr,
          },
          profiler,
        );

        // 4. The halo, red widest, then the tail.
        bloom.encode(
          encoder,
          tail.scene,
          { strength: params.halo, radius: params.haloRadius * size, spread: params.haloSpread },
          profiler,
        );
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => body.stats(),
      destroy() {
        pointer.destroy();
        body.destroy();
        wire.destroy();
        flares.destroy();
        bloom.destroy();
        blur.destroy();
        softA.destroy();
        softB.destroy();
        tail.destroy();
      },
    };
  },
});
