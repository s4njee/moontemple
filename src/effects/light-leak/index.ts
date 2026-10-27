import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { addFlareGhosts } from '../../gpu/glare/flare.ts';
import { createGlareLayer, GLARE_FLOATS, spikesFor } from '../../gpu/glare/glare.ts';
import type { ApertureSettings } from '../../gpu/optics/aperture.ts';
import { flickerIntensity, flickerOffset } from '../../gpu/optics/flicker.ts';
import { generateMipmaps, mipLevelCount } from '../../gpu/mipmap.ts';
import { createPointLayer, PointList } from '../../gpu/points.ts';
import { createHalation } from '../../gpu/post/halation.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { withChunks } from '../../gpu/shader.ts';
import { createRenderTarget } from '../../gpu/targets.ts';
import { createUniformBuffer, defineUniformStruct, uniformArray } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import developShader from './develop.wgsl';
import leakShader from './leak.wgsl';
import { meta } from './meta.ts';

type Rgb = readonly [number, number, number];

const LeakParams = defineUniformStruct('LeakParams', {
  out_size: 'vec2f',
  time: 'f32',
  ceiling: 'f32',
  image_gain: 'f32',
  veil_at: 'vec4f',
  veil_colour: 'vec4f',
  /** Per leak: (centre, radii), (colour, angle), (hot core colour, unused). */
  leaks: uniformArray('vec4f', 12),
});

/** The sample image is made at this size; a dropped one is kept to at most this long side. */
const SAMPLE_WIDTH = 1600;
const SAMPLE_HEIGHT = 1000;
const MAX_SIDE = 4096;
/** The leaks are drawn at this fraction of the canvas's size: they have no fine detail. */
const FIELD_SCALE = 4;
/** The brightest display value the image is opened back up from (4.5 times white in the scene). */
const CEILING = 0.98;
const PHOTO_FORMAT: GPUTextureFormat = 'rgba8unorm-srgb';
const PHOTO_USAGE =
  GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST;

/** Each palette's three tones: deep, mid, and the hot core every leak shares. */
const PALETTES: Record<string, readonly [Rgb, Rgb, Rgb]> = {
  ember: [
    [1, 0.16, 0.04],
    [1, 0.4, 0.09],
    [1, 0.66, 0.3],
  ],
  gold: [
    [1, 0.42, 0.08],
    [1, 0.62, 0.2],
    [1, 0.82, 0.5],
  ],
  rose: [
    [1, 0.12, 0.16],
    [1, 0.32, 0.26],
    [1, 0.6, 0.45],
  ],
};

type Edge = 'left' | 'right' | 'top' | 'bottom';
interface Leak {
  edge: Edge;
  /** Where along the edge, -0.5..0.5 of its length. */
  at: number;
  /** How far past the edge the centre sits, height units. */
  out: number;
  /** Radii along the edge and across it, height units. */
  along: number;
  across: number;
  /** Tilt, radians. */
  angle: number;
  /** Palette tone, and the leak's share of `amount`. */
  tone: 0 | 1;
  weight: number;
}

/** Four leaks, as a film camera's back lets them in: the big one at the left, others smaller. */
const LEAKS: readonly Leak[] = [
  { edge: 'left', at: 0.1, out: 0.12, along: 0.7, across: 0.32, angle: 0.15, tone: 0, weight: 1 },
  {
    edge: 'top',
    at: 0.28,
    out: 0.12,
    along: 0.55,
    across: 0.26,
    angle: -0.2,
    tone: 1,
    weight: 0.7,
  },
  { edge: 'right', at: 0.25, out: 0.1, along: 0.45, across: 0.2, angle: 0.1, tone: 0, weight: 0.6 },
  {
    edge: 'bottom',
    at: -0.2,
    out: 0.08,
    along: 0.45,
    across: 0.14,
    angle: 0,
    tone: 1,
    weight: 0.45,
  },
];
/** Light added at a leak's centre at `amount` 1, before its breathing; the core adds a share more. */
const LEAK_GAIN = 1.6;
const CORE_SHARE = 0.5;
/** How far a leak wanders along its edge (height units) and in and out of it. */
const WANDER_ALONG = 0.22;
const WANDER_OUT = 0.06;
/** A held frame shows the leaks at this share of their mean, and no flare. */
const STILL_SHARE = 0.75;

/** The first sweep starts this long after the effect does. */
const SWEEP_START = 1.5;
const FLARE_TINT: Rgb = [1, 0.8, 0.55];

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    amount: { type: 'number', default: 1, min: 0, max: 3, step: 0.05, label: 'leak strength' },
    palette: { type: 'select', default: 'ember', options: Object.keys(PALETTES) },
    drift: {
      type: 'number',
      default: 0.3,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'drift (changes / s)',
    },
    sweep: { type: 'number', default: 1, min: 0, max: 3, step: 0.05, label: 'flare strength' },
    sweepEvery: {
      type: 'number',
      default: 10,
      min: 4,
      max: 40,
      step: 0.5,
      label: 'flare every (s)',
    },
    sweepTime: {
      type: 'number',
      default: 5,
      min: 2,
      max: 12,
      step: 0.5,
      label: 'flare crossing (s)',
    },
    veil: { type: 'number', default: 0.25, min: 0, max: 1, step: 0.01, label: 'flare veil' },
    ghosts: { type: 'number', default: 1.5, min: 0, max: 4, step: 0.05, label: 'flare ghosts' },
    streak: {
      type: 'number',
      default: 0.12,
      min: 0,
      max: 0.3,
      step: 0.005,
      label: 'anamorphic streak',
    },
    blades: { type: 'number', default: 6, min: 0, max: 9, step: 1, label: 'blades (0 round)' },
    halation: { type: 'number', default: 0.15, min: 0, max: 0.8, step: 0.01 },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.2 },
    bloomThreshold: { ...TAIL_PARAMS.bloomThreshold, default: 3 },
  },
  presets: {
    'film leaks': {},
    'golden hour': { palette: 'gold', amount: 0.8, sweep: 1.2, streak: 0.18, veil: 0.2 },
    'red burn': { amount: 1.8, palette: 'ember', halation: 0.35, sweep: 0.6, veil: 0.2 },
    'rose leaks': { palette: 'rose', amount: 1.2, sweep: 0 },
    'flare only': { amount: 0, sweep: 1.5, ghosts: 2.5 },
  },

  async create({ device, format, hdr, canvas, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'light leak' });
    const points = createPointLayer(device, { label: 'light leak', format: tail.scene.format });
    const glare = createGlareLayer(device, { label: 'light leak', format: tail.scene.format });
    const halation = createHalation(device, { format: tail.scene.format });
    const uniforms = createUniformBuffer(device, LeakParams, 'light leak');
    const source = withChunks(leakShader, { 'leak-params.wgsl': LeakParams.wgsl });
    const fieldPipeline = createFullscreenPipeline(device, {
      fragment: source,
      entryPoint: 'field',
      format: 'rgba16float',
    });
    const compose = createFullscreenPipeline(device, {
      fragment: source,
      entryPoint: 'compose',
      format: tail.scene.format,
    });
    const field = createRenderTarget(device, {
      label: 'light leak field',
      format: 'rgba16float',
      width: 1,
      height: 1,
    });
    const sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
    });
    const list = new PointList();
    const glareLight = new Float32Array(GLARE_FLOATS);
    const leakData = new Float32Array(12 * 4);

    // The sample: a dusk lake drawn on the GPU into the same kind of texture a dropped photo gets.
    let photo = device.createTexture({
      label: 'light leak sample',
      size: [SAMPLE_WIDTH, SAMPLE_HEIGHT],
      format: PHOTO_FORMAT,
      usage: PHOTO_USAGE,
      mipLevelCount: mipLevelCount(SAMPLE_WIDTH, SAMPLE_HEIGHT),
    });
    let imageName = 'sample';
    {
      const develop = createFullscreenPipeline(device, {
        fragment: developShader,
        entryPoint: 'develop',
        format: PHOTO_FORMAT,
      });
      const encoder = device.createCommandEncoder();
      renderFullscreen(encoder, photo.createView({ baseMipLevel: 0, mipLevelCount: 1 }), develop);
      generateMipmaps(device, photo, encoder);
      device.queue.submit([encoder.finish()]);
    }

    // The stable way to take an image from the page (Fire Temple's backdrop finding): a WebGPU
    // canvas cannot read the page's pixels, so the image is handed over, decoded to an ImageBitmap
    // and copied into a texture. Dropping a file on the canvas is the gallery's way of handing one.
    let destroyed = false;
    const onDragOver = (event: DragEvent) => event.preventDefault();
    const onDrop = async (event: DragEvent) => {
      event.preventDefault();
      const file = [...(event.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (!file) return;
      let bitmap: ImageBitmap;
      try {
        bitmap = await decode(file, Math.min(MAX_SIDE, device.limits.maxTextureDimension2D));
      } catch (error) {
        console.warn('light-leak: could not decode the dropped image', error);
        return;
      }
      if (destroyed) {
        bitmap.close();
        return;
      }
      photo.destroy();
      photo = upload(device, bitmap, file.name);
      imageName = `${photo.width} × ${photo.height}`;
    };
    canvas.addEventListener('dragover', onDragOver);
    canvas.addEventListener('drop', onDrop);

    let width = 1;
    let height = 1;
    let clock = 0;
    let flare = 0;

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
        halation.resize(w, h);
        field.resize(Math.ceil(w / FIELD_SCALE), Math.ceil(h / FIELD_SCALE));
      },
      frame(time, encoder, target) {
        clock += time.delta;
        const aspect = width / height;
        const palette = PALETTES[params.palette] ?? PALETTES.ember!;
        const hot = palette[2];

        // The leaks breathe and wander on the flicker module's slow signal: its rate is capped at
        // four changes a second and here runs at `drift`, so a leak can never pulse fast enough to
        // flash, however strong it is.
        const slow = { rate: params.drift, depth: 0.7, shimmer: 0, shimmerRate: 0 };
        const wander = { ...slow, rate: params.drift * 0.6 };
        leakData.fill(0);
        LEAKS.forEach((leak, i) => {
          const breath = time.still
            ? STILL_SHARE * (1 - slow.depth / 2)
            : flickerIntensity(clock, 11 + i, slow);
          const [da, dout] = flickerOffset(clock, 23 + i, wander);
          const at =
            leak.at +
            (da * WANDER_ALONG) / (leak.edge === 'top' || leak.edge === 'bottom' ? aspect : 1);
          const out = leak.out + dout * WANDER_OUT;
          const [cx, cy, rx, ry] =
            leak.edge === 'left'
              ? [-aspect / 2 - out, at, leak.across, leak.along]
              : leak.edge === 'right'
                ? [aspect / 2 + out, at, leak.across, leak.along]
                : leak.edge === 'top'
                  ? [at * aspect, -0.5 - out, leak.along, leak.across]
                  : [at * aspect, 0.5 + out, leak.along, leak.across];
          const gain = LEAK_GAIN * params.amount * leak.weight * breath;
          const tone = palette[leak.tone];
          leakData.set(
            [
              cx,
              cy,
              rx,
              ry,
              tone[0] * gain,
              tone[1] * gain,
              tone[2] * gain,
              leak.angle,
              hot[0] * gain * CORE_SHARE,
              hot[1] * gain * CORE_SHARE,
              hot[2] * gain * CORE_SHARE,
              0,
            ],
            i * 12,
          );
        });

        // The sweep: a bright light crossing the frame every `sweepEvery` seconds, as a lens pans
        // past the sun, rising and falling over the whole crossing (sin squared), never at once.
        const every = Math.max(params.sweepEvery, params.sweepTime + 1);
        const since = clock - SWEEP_START;
        const index = Math.floor(since / every);
        const phase = since >= 0 ? (since - index * every) / params.sweepTime : -1;
        flare = !time.still && phase >= 0 && phase <= 1 ? Math.sin(Math.PI * phase) ** 2 : 0;
        // Alternate crossings run the other way, each a little higher or lower.
        const forward = index % 2 === 0;
        const s = forward ? phase : 1 - phase;
        const lane = 0.16 + 0.1 * ((index * 0.618) % 1);
        const fx = (-0.12 + 1.24 * s) * width;
        const fy = (lane + 0.12 * s) * height;
        const strength = flare * params.sweep;

        uniforms.set({
          out_size: [width, height],
          time: clock * params.drift * 0.15,
          ceiling: CEILING,
          image_gain: 1,
          veil_at: [fx / height - aspect / 2, fy / height - 0.5, 0.75, 0.45],
          veil_colour: [
            FLARE_TINT[0] * 0.6 * params.veil * strength,
            FLARE_TINT[1] * 0.6 * params.veil * strength,
            FLARE_TINT[2] * 0.6 * params.veil * strength,
            0,
          ],
          leaks: leakData,
        });
        uniforms.upload();
        renderFullscreen(
          encoder,
          field.view,
          fieldPipeline,
          [
            device.createBindGroup({
              layout: fieldPipeline.getBindGroupLayout(0),
              entries: [{ binding: 0, resource: { buffer: uniforms.buffer } }],
            }),
          ],
          { timestampWrites: profiler.pass('leak field') },
        );
        renderFullscreen(
          encoder,
          tail.scene.view,
          compose,
          [
            device.createBindGroup({
              layout: compose.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: { buffer: uniforms.buffer } },
                { binding: 1, resource: photo.createView() },
                { binding: 2, resource: sampler },
                { binding: 3, resource: field.view },
              ],
            }),
          ],
          { timestampWrites: profiler.pass('compose') },
        );

        if (strength > 0) {
          const total = 30 * Math.PI * (0.012 * height) ** 2 * strength;
          const light: Rgb = [FLARE_TINT[0] * total, FLARE_TINT[1] * total, FLARE_TINT[2] * total];
          list.clear();
          list.push(fx, fy, 0.008 * height, light[0], light[1], light[2]);
          if (params.ghosts > 0) addFlareGhosts(list, fx, fy, light, width, height, params.ghosts);
          list.upload(points);
          const blades = Math.round(params.blades);
          const aperture: ApertureSettings = {
            blades,
            rotation: 15,
            curvature: 0.1,
            rim: 0,
            rings: 0,
            ringCount: 1,
            vignette: 0,
          };
          points.encode(encoder, tail.scene.view, { width, height, aperture }, profiler);
          glareLight.set([fx, fy, 0, 0, light[0], light[1], light[2], 0]);
          glare.setLights(glareLight, 1);
          glare.encode(
            encoder,
            tail.scene.view,
            {
              width,
              height,
              spikes: spikesFor(blades),
              rotation: (15 * Math.PI) / 180 + Math.PI / 2,
              length: 0.05 * height,
              thickness: 0.7,
              spikeShare: 0.03,
              streakShare: params.streak,
              streakLength: 0.35 * height,
            },
            profiler,
          );
        }
        if (params.halation > 0) {
          halation.encode(
            encoder,
            tail.scene,
            { strength: params.halation, radius: 0.012 * height },
            profiler,
          );
        }
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({ image: imageName, flare: flare.toFixed(2) }),
      destroy() {
        destroyed = true;
        canvas.removeEventListener('dragover', onDragOver);
        canvas.removeEventListener('drop', onDrop);
        photo.destroy();
        points.destroy();
        glare.destroy();
        halation.destroy();
        uniforms.destroy();
        field.destroy();
        tail.destroy();
      },
    };
  },
});

/** Decodes an image file, scaled down when its long side is over `max` pixels. */
async function decode(file: Blob, max: number): Promise<ImageBitmap> {
  const bitmap = await createImageBitmap(file);
  const long = Math.max(bitmap.width, bitmap.height);
  if (long <= max) return bitmap;
  const scale = max / long;
  const resized = await createImageBitmap(bitmap, {
    resizeWidth: Math.max(1, Math.round(bitmap.width * scale)),
    resizeHeight: Math.max(1, Math.round(bitmap.height * scale)),
    resizeQuality: 'high',
  });
  bitmap.close();
  return resized;
}

/**
 * An ImageBitmap into an sRGB texture with a full mip chain. ImageBitmap, not HTMLImageElement:
 * `copyExternalImageToTexture` takes an image element only in Chrome.
 */
function upload(device: GPUDevice, image: ImageBitmap, label: string): GPUTexture {
  const texture = device.createTexture({
    label,
    size: [image.width, image.height],
    format: PHOTO_FORMAT,
    usage: PHOTO_USAGE,
    mipLevelCount: mipLevelCount(image.width, image.height),
  });
  device.queue.copyExternalImageToTexture({ source: image }, { texture }, [
    image.width,
    image.height,
  ]);
  image.close();
  generateMipmaps(device, texture);
  return texture;
}
