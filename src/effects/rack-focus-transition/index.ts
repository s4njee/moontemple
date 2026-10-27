import { DOF_METHODS, type DofMethod } from '../../gpu/dof/index.ts';
import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { withChunks } from '../../gpu/shader.ts';
import { createRenderTarget } from '../../gpu/targets.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import composeShader from './compose.wgsl';
import { meta } from './meta.ts';
import viewsShader from './views.wgsl';

const ViewParams = defineUniformStruct('ViewParams', {
  out_size: 'vec2f',
});

const ComposeParams = defineUniformStruct('ComposeParams', {
  /** The full-resolution frame, whatever size the pass draws at. */
  out_size: 'vec2f',
  /** 1, or 2 when the pass draws at half resolution. */
  subsample: 'f32',
  fade: 'f32',
  threshold: 'f32',
  gain: 'f32',
  depth: 'f32',
});

/** The methods offered: the light tier's separable hexagon, and gather's round discs. */
const METHODS = ['hexagon', 'gather'] as const;
type Method = (typeof METHODS)[number] | 'sharp';
/**
 * The whole frame sits on one plane, twice as far as the focus: its circle of confusion is then
 * half the lens's blur at infinity, so the blur radius in pixels is set by `blurAtInfinity` alone.
 */
const FOCUS = 1;
const PLANE = 2;
/**
 * From this blur radius (full-resolution pixels) the rack is blurred at half resolution: a quarter
 * of the pixels at half the radius. Below it the extra softness of the upsample would show.
 */
const HALF_RES_FROM = 8;
const USAGE =
  GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT;

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * The rack through the cut, for progress `p` from 0 (the outgoing view, sharp) to 1 (the incoming
 * view, sharp): the blur as a share of its peak, rising over the first half and falling over the
 * second, and the crossfade, centred on the cut, `width` of the progress wide.
 */
export function rackFocus(p: number, width: number): { blur: number; fade: number } {
  const blur = p < 0.5 ? smoothstep(0, 0.5, p) : smoothstep(1, 0.5, p);
  const fade = smoothstep(0.5 - 0.5 * width, 0.5 + 0.5 * width, p);
  return { blur, fade };
}

/**
 * Where the demo loop is after `clock` seconds: hold the first view, rack to the second, hold it,
 * rack back. `settled` is the view a cut would land on: the one being held, or the one the rack
 * is heading to. That is the frame to hold under reduced motion.
 */
export function loopProgress(
  clock: number,
  hold: number,
  duration: number,
): { progress: number; settled: 0 | 1 } {
  const leg = hold + duration;
  const s = clock % (2 * leg);
  if (s < hold) return { progress: 0, settled: 0 };
  if (s < leg) return { progress: (s - hold) / duration, settled: 1 };
  if (s < leg + hold) return { progress: 1, settled: 1 };
  return { progress: 1 - (s - leg - hold) / duration, settled: 0 };
}

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    auto: { type: 'boolean', default: true, label: 'loop the transition' },
    progress: {
      type: 'number',
      default: 0,
      min: 0,
      max: 1,
      step: 0.001,
      label: 'progress (loop off)',
    },
    duration: { type: 'number', default: 1.2, min: 0.3, max: 4, step: 0.05, label: 'rack (s)' },
    hold: { type: 'number', default: 2, min: 0, max: 8, step: 0.1, label: 'hold each view (s)' },
    blur: {
      type: 'number',
      default: 4,
      min: 0,
      max: 8,
      step: 0.1,
      label: 'peak blur (% of height)',
    },
    crossfade: { type: 'number', default: 0.4, min: 0.02, max: 1, step: 0.01, label: 'crossfade' },
    method: { type: 'select', default: 'hexagon', options: METHODS },
    highlights: {
      type: 'number',
      default: 10,
      min: 1,
      max: 40,
      step: 0.5,
      label: 'highlight gain',
    },
    threshold: { type: 'number', default: 0.85, min: 0.5, max: 0.99, step: 0.01 },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.2 },
  },
  presets: {
    'rack focus': {},
    'round discs (gather)': { method: 'gather' },
    'clipped highlights': { highlights: 1 },
    'quick cut': { duration: 0.6, blur: 3 },
    'slow rack': { duration: 2.5, hold: 1.5, blur: 6 },
  },

  async create({ device, format, hdr, canvas, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'rack focus' });
    const viewUniforms = createUniformBuffer(device, ViewParams, 'rack focus views');
    const composeUniforms = createUniformBuffer(device, ComposeParams, 'rack focus compose');
    const drawViews = createFullscreenPipeline(device, {
      fragment: withChunks(viewsShader, { 'view-params.wgsl': ViewParams.wgsl }),
      entryPoint: 'views',
      format: ['rgba8unorm', 'rgba8unorm'],
    });
    const compose = createFullscreenPipeline(device, {
      fragment: withChunks(composeShader, { 'compose-params.wgsl': ComposeParams.wgsl }),
      entryPoint: 'compose',
      format: ['rgba16float', 'r32float'],
    });
    const upsample = createFullscreenPipeline(device, {
      fragment: withChunks(composeShader, { 'compose-params.wgsl': ComposeParams.wgsl }),
      entryPoint: 'upsample',
      format: tail.scene.format,
    });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    const target = (label: string, targetFormat: GPUTextureFormat) =>
      createRenderTarget(device, {
        label: `rack focus ${label}`,
        format: targetFormat,
        width: 1,
        height: 1,
      });
    const drawnA = target('view a', 'rgba8unorm');
    const drawnB = target('view b', 'rgba8unorm');
    const colour = target('colour', 'rgba16float');
    const depth = target('depth', 'r32float');
    const halfColour = target('half colour', 'rgba16float');
    const halfDepth = target('half depth', 'r32float');
    const halfBlurred = target('half blurred', 'rgba16float');
    // The method writes straight into the tail's scene when it is the format methods write.
    const output =
      tail.scene.format === 'rgba16float' ? undefined : target('method', 'rgba16float');

    // Two images dropped together replace the drawn views, in name order: the first is outgoing.
    // A page would hand its own over the same way: an ImageBitmap of each, uploaded once.
    let handed: [GPUTexture, GPUTexture] | undefined;
    const onDragOver = (event: DragEvent) => event.preventDefault();
    const onDrop = async (event: DragEvent) => {
      event.preventDefault();
      const files = [...(event.dataTransfer?.files ?? [])]
        .filter((f) => f.type.startsWith('image/'))
        .sort((x, y) => x.name.localeCompare(y.name));
      if (files.length < 2) return;
      const images = await Promise.all(files.slice(0, 2).map((f) => createImageBitmap(f)));
      handed?.forEach((texture) => texture.destroy());
      handed = [upload(device, images[0]!, 'view a'), upload(device, images[1]!, 'view b')];
    };
    canvas.addEventListener('dragover', onDragOver);
    canvas.addEventListener('drop', onDrop);

    // One instance of each method per resolution, made when first needed.
    const methods = new Map<string, DofMethod>();
    const methodFor = (id: Method, half: boolean) => {
      const key = `${id}${half ? '/2' : ''}`;
      let method = methods.get(key);
      if (!method) {
        method = DOF_METHODS[id](device);
        method.resize(half ? halfWidth() : width, half ? halfHeight() : height);
        methods.set(key, method);
      }
      return method;
    };
    const halfWidth = () => Math.max(1, Math.ceil(width / 2));
    const halfHeight = () => Math.max(1, Math.ceil(height / 2));
    let width = 1;
    let height = 1;
    let clock = 0;
    let viewsDirty = true;
    let shown = { progress: 0, radius: 0, method: 'sharp' as Method, half: false };

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
        drawnA.resize(w, h);
        drawnB.resize(w, h);
        colour.resize(w, h);
        depth.resize(w, h);
        output?.resize(w, h);
        halfColour.resize(halfWidth(), halfHeight());
        halfDepth.resize(halfWidth(), halfHeight());
        halfBlurred.resize(halfWidth(), halfHeight());
        for (const [key, method] of methods) {
          if (key.endsWith('/2')) method.resize(halfWidth(), halfHeight());
          else method.resize(w, h);
        }
        viewsDirty = true;
      },
      frame(time, encoder, frameTarget) {
        if (viewsDirty && !handed) {
          viewUniforms.set({ out_size: [width, height] });
          viewUniforms.upload();
          renderFullscreen(
            encoder,
            [drawnA.view, drawnB.view],
            drawViews,
            [
              device.createBindGroup({
                layout: drawViews.getBindGroupLayout(0),
                entries: [{ binding: 0, resource: { buffer: viewUniforms.buffer } }],
              }),
            ],
            { timestampWrites: profiler.pass('views') },
          );
          viewsDirty = false;
        }

        // A held frame is never mid-blur: it is the view a cut would land on.
        if (!time.still && params.auto) clock += time.delta;
        let progress: number;
        if (params.auto) {
          const loop = loopProgress(clock, params.hold, params.duration);
          progress = time.still ? loop.settled : loop.progress;
        } else {
          progress = time.still ? Math.round(params.progress) : params.progress;
        }
        const { blur, fade } = rackFocus(progress, params.crossfade);
        const radius = (blur * params.blur * height) / 100;

        // Settled, the frame is the view as it is: no blur pass at all. A wide blur is drawn at
        // half resolution.
        const id: Method =
          radius < 0.5
            ? 'sharp'
            : (METHODS as readonly string[]).includes(params.method)
              ? (params.method as Method)
              : 'hexagon';
        const half = radius >= HALF_RES_FROM;
        const w = half ? halfWidth() : width;
        const h = half ? halfHeight() : height;
        // The bilinear upsample widens the blur by about a full-resolution pixel: taking it back
        // off keeps the switch from brightening the frame (measured at 8 px: the mean level jumped
        // 1.2 of 255 without it, 0.2 with it, against 0.3 a frame from the rack itself).
        const r = half ? radius / 2 - 0.5 : radius;

        composeUniforms.set({
          out_size: [width, height],
          subsample: half ? 2 : 1,
          fade,
          threshold: params.threshold,
          gain: params.highlights,
          depth: PLANE,
        });
        composeUniforms.upload();
        const [viewA, viewB] = handed
          ? handed.map((texture) => texture.createView())
          : [drawnA.view, drawnB.view];
        const input = half ? [halfColour, halfDepth] : [colour, depth];
        renderFullscreen(
          encoder,
          [input[0]!.view, input[1]!.view],
          compose,
          [
            device.createBindGroup({
              layout: compose.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: { buffer: composeUniforms.buffer } },
                { binding: 1, resource: viewA! },
                { binding: 2, resource: viewB! },
                { binding: 3, resource: sampler },
              ],
            }),
          ],
          { timestampWrites: profiler.pass('compose') },
        );

        const settings = {
          lens: { focus: FOCUS, blurAtInfinity: (r * PLANE) / (PLANE - FOCUS) },
          aperture: {
            blades: 6,
            rotation: 0,
            curvature: 0,
            rim: 0,
            rings: 0,
            ringCount: 1,
            vignette: 0,
          },
        };
        const methodInput = { colour: input[0]!.view, depth: input[1]!.view, width: w, height: h };
        if (half) {
          methodFor(id, true).encode(encoder, methodInput, halfBlurred.view, settings, profiler);
          renderFullscreen(
            encoder,
            tail.scene.view,
            upsample,
            [
              device.createBindGroup({
                layout: upsample.getBindGroupLayout(0),
                entries: [
                  { binding: 0, resource: halfBlurred.view },
                  { binding: 1, resource: sampler },
                ],
              }),
            ],
            { timestampWrites: profiler.pass('upsample') },
          );
        } else {
          methodFor(id, false).encode(
            encoder,
            methodInput,
            output?.view ?? tail.scene.view,
            settings,
            profiler,
          );
          if (output) {
            encoder.copyTextureToTexture(
              { texture: output.texture },
              { texture: tail.scene.texture },
              [width, height],
            );
          }
        }
        tail.encode(encoder, frameTarget, time, params, profiler);
        shown = { progress, radius, method: id, half };
      },
      stats: () => ({
        progress: shown.progress.toFixed(2),
        'blur (px)': shown.radius.toFixed(1),
        method: `${methods.get(shown.method)?.name ?? shown.method}${shown.half ? ', half resolution' : ''}`,
        views: handed ? 'handed over' : 'drawn',
      }),
      destroy() {
        canvas.removeEventListener('dragover', onDragOver);
        canvas.removeEventListener('drop', onDrop);
        for (const method of methods.values()) method.destroy();
        handed?.forEach((texture) => texture.destroy());
        drawnA.destroy();
        drawnB.destroy();
        colour.destroy();
        depth.destroy();
        halfColour.destroy();
        halfDepth.destroy();
        halfBlurred.destroy();
        output?.destroy();
        viewUniforms.destroy();
        composeUniforms.destroy();
        tail.destroy();
      },
    };
  },
});

/** An image the page hands over, as a texture: the stable upload (story 6.1). */
function upload(device: GPUDevice, image: ImageBitmap, label: string): GPUTexture {
  const texture = device.createTexture({
    label,
    size: [image.width, image.height],
    format: 'rgba8unorm',
    usage: USAGE,
  });
  device.queue.copyExternalImageToTexture({ source: image }, { texture }, [
    image.width,
    image.height,
  ]);
  image.close();
  return texture;
}
