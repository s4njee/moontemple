import { DOF_METHODS, type DofMethod, type DofMethodId } from '../../gpu/dof/index.ts';
import { createDofScene } from '../../gpu/dof/scene.ts';
import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { APERTURE_PARAMS } from '../../gpu/optics/aperture.ts';
import { lensFromCamera } from '../../gpu/optics/lens.ts';
import { trackPointer } from '../../gpu/pointer.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { withChunks } from '../../gpu/shader.ts';
import { createRenderTarget } from '../../gpu/targets.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';
import shader from './prepare.wgsl';

const Params = defineUniformStruct('Params', {
  out_size: 'vec2f',
  threshold: 'f32',
  gain: 'f32',
  near: 'f32',
  far: 'f32',
});

/** The methods worth refocusing a photo with: not the sharp pass-through, not the depthless band. */
const METHODS = (Object.keys(DOF_METHODS) as DofMethodId[]).filter(
  (id) => id !== 'sharp' && id !== 'tilt-shift',
);
/** The sample: the depth-of-field test shot, developed at this size. */
const SAMPLE_WIDTH = 1600;
const SAMPLE_HEIGHT = 1000;
/** The distances the sample's disparity map spans, metres: the road starts under the camera. */
const SAMPLE_NEAR = 0.8;
const SAMPLE_FAR = 60;
/**
 * Where the demo focuses before the first click, in the photo's 0..1 space: the subject card, the
 * neon sign, the lit block, the city. A dropped photo uses its depth map's spread instead.
 */
const SAMPLE_SPOTS: [number, number][] = [
  [0.544, 0.472],
  [0.703, 0.311],
  [0.297, 0.308],
  [0.5, 0.12],
];
const DEMO_HOLD = 4;
const USAGE =
  GPUTextureUsage.TEXTURE_BINDING |
  GPUTextureUsage.RENDER_ATTACHMENT |
  GPUTextureUsage.COPY_DST |
  GPUTextureUsage.COPY_SRC;

/** A depth map on the CPU, for finding the distance under a click. */
interface DepthMap {
  width: number;
  height: number;
  /** Disparity, 0 far to 1 near, one value a pixel. */
  values: Float32Array;
}

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    method: { type: 'select', default: 'gather', options: METHODS },
    fNumber: {
      type: 'number',
      default: 1.4,
      min: 1,
      max: 16,
      step: 0.1,
      label: 'f-number (85 mm)',
    },
    rack: { type: 'number', default: 0.3, min: 0.02, max: 2, step: 0.01, label: 'focus time (s)' },
    highlights: {
      type: 'number',
      default: 12,
      min: 1,
      max: 100,
      step: 1,
      label: 'highlight gain',
    },
    threshold: { type: 'number', default: 0.8, min: 0.5, max: 0.99, step: 0.01 },
    near: {
      type: 'number',
      default: SAMPLE_NEAR,
      min: 0.1,
      max: 20,
      step: 0.1,
      label: 'map near (m)',
    },
    far: { type: 'number', default: SAMPLE_FAR, min: 1, max: 1000, step: 1, label: 'map far (m)' },
    ...APERTURE_PARAMS,
    rim: { ...APERTURE_PARAMS.rim, default: 0 },
    vignette: { ...APERTURE_PARAMS.vignette, default: 0 },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.25 },
  },
  presets: {
    'f/1.4': {},
    'f/4': { fNumber: 4 },
    'clipped highlights': { highlights: 1 },
    'layered method': { method: 'layers' },
  },

  async create({ device, format, hdr, canvas, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'photo focus' });
    const pointer = trackPointer(canvas);
    const uniforms = createUniformBuffer(device, Params, 'photo focus');
    const source = withChunks(shader, { 'params.wgsl': Params.wgsl });
    const prepare = createFullscreenPipeline(device, {
      fragment: source,
      entryPoint: 'prepare',
      format: ['rgba16float', 'r32float'],
    });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    const colour = createRenderTarget(device, {
      label: 'photo colour',
      format: 'rgba16float',
      width: 1,
      height: 1,
    });
    const depth = createRenderTarget(device, {
      label: 'photo depth',
      format: 'r32float',
      width: 1,
      height: 1,
    });
    // The method writes straight into the tail's scene when it is the format methods write.
    const output =
      tail.scene.format === 'rgba16float'
        ? undefined
        : createRenderTarget(device, {
            label: 'photo method',
            format: 'rgba16float',
            width: 1,
            height: 1,
          });

    let photo!: GPUTexture;
    let disparity!: GPUTexture;
    let map: DepthMap = { width: 1, height: 1, values: new Float32Array(1) };
    let spots: [number, number][] = SAMPLE_SPOTS;
    let mapNear = SAMPLE_NEAR;
    let mapFar = SAMPLE_FAR;

    // The sample: the test shot through a pinhole, developed to an 8-bit photo and disparity map,
    // then read back for picking, exactly as a dropped photo would be.
    {
      const scene = createDofScene(device);
      scene.resize(SAMPLE_WIDTH, SAMPLE_HEIGHT);
      scene.set({
        lens: lensFromCamera({
          focalLength: 85,
          fNumber: 1.8,
          focusDistance: 2.5,
          imageHeight: SAMPLE_HEIGHT,
        }),
        aperture: {
          blades: 0,
          rotation: 0,
          curvature: 0,
          rim: 0,
          rings: 0,
          ringCount: 1,
          vignette: 0,
        },
        shot: 'night',
      });
      const develop = createFullscreenPipeline(device, {
        fragment: source,
        entryPoint: 'develop',
        format: ['rgba8unorm', 'rgba8unorm'],
      });
      photo = device.createTexture({
        label: 'photo',
        size: [SAMPLE_WIDTH, SAMPLE_HEIGHT],
        format: 'rgba8unorm',
        usage: USAGE,
      });
      disparity = device.createTexture({
        label: 'photo disparity',
        size: [SAMPLE_WIDTH, SAMPLE_HEIGHT],
        format: 'rgba8unorm',
        usage: USAGE,
      });
      uniforms.set({
        out_size: [SAMPLE_WIDTH, SAMPLE_HEIGHT],
        threshold: 1,
        gain: 1,
        near: SAMPLE_NEAR,
        far: SAMPLE_FAR,
      });
      uniforms.upload();
      const encoder = device.createCommandEncoder();
      scene.renderPinhole(encoder);
      renderFullscreen(encoder, [photo.createView(), disparity.createView()], develop, [
        device.createBindGroup({
          layout: develop.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: uniforms.buffer } },
            { binding: 1, resource: scene.colour.view },
            { binding: 2, resource: scene.depth.view },
          ],
        }),
      ]);
      device.queue.submit([encoder.finish()]);
      map = await readDisparity(device, disparity);
      scene.destroy();
    }

    // Dropping a photo and its depth map together replaces the sample. The map is the file whose
    // name says depth, disparity or map; failing that, the second.
    const onDragOver = (event: DragEvent) => event.preventDefault();
    const onDrop = async (event: DragEvent) => {
      event.preventDefault();
      const files = [...(event.dataTransfer?.files ?? [])].filter((f) =>
        f.type.startsWith('image/'),
      );
      if (files.length < 2) return;
      const isMap = (f: File) => /depth|disparity|map/i.test(f.name);
      const mapFile = files.find(isMap) ?? files[1]!;
      const photoFile = files.find((f) => f !== mapFile)!;
      const [photoImage, mapImage] = await Promise.all(
        [photoFile, mapFile].map((f) => createImageBitmap(f, { colorSpaceConversion: 'none' })),
      );
      photo.destroy();
      disparity.destroy();
      photo = upload(device, photoImage!, 'photo');
      disparity = upload(device, mapImage!, 'photo disparity');
      map = await readDisparity(device, disparity);
      spots = [];
      // A dropped photo has no known near and far: the sliders' values stand.
      mapNear = Number.NaN;
      mapFar = Number.NaN;
      aim = undefined;
      clicked = false;
    };
    canvas.addEventListener('dragover', onDragOver);
    canvas.addEventListener('drop', onDrop);

    const methods = new Map<string, DofMethod>();
    let width = 1;
    let height = 1;
    let clock = 0;
    let focus = 2.5;
    let aim: number | undefined;
    let clicked = false;
    let wasDown = false;

    /** Distance under a point of the canvas (0..1), metres, through the cover fit. */
    function depthAt(x: number, y: number): number {
      const scale = Math.max(width / map.width, height / map.height);
      const u = ((x - 0.5) * width) / (scale * map.width) + 0.5;
      const v = ((y - 0.5) * height) / (scale * map.height) + 0.5;
      return depthAtPhoto(u, v);
    }
    function depthAtPhoto(u: number, v: number): number {
      const px = Math.min(map.width - 1, Math.max(0, Math.floor(u * map.width)));
      const py = Math.min(map.height - 1, Math.max(0, Math.floor(v * map.height)));
      // The nearest thing within a few pixels: a click on a thin wire means the wire.
      let d = 0;
      for (let j = -2; j <= 2; j++) {
        for (let i = -2; i <= 2; i++) {
          const x = Math.min(map.width - 1, Math.max(0, px + i));
          const y = Math.min(map.height - 1, Math.max(0, py + j));
          d = Math.max(d, map.values[y * map.width + x]!);
        }
      }
      return 1 / (1 / far() + d * (1 / near() - 1 / far()));
    }
    const near = () => (Number.isNaN(mapNear) ? params.near : mapNear);
    const far = () => (Number.isNaN(mapFar) ? params.far : mapFar);
    /** Before the first click: the sample's spots, or a dropped map's near, middle and far. */
    function demoAim(index: number): number {
      if (spots.length > 0) {
        const [u, v] = spots[index % spots.length]!;
        return depthAtPhoto(u, v);
      }
      const sorted = Float32Array.from(map.values).sort();
      const quantile = [0.9, 0.5, 0.15][index % 3]!;
      const d = sorted[Math.floor(quantile * (sorted.length - 1))]!;
      return 1 / (1 / far() + d * (1 / near() - 1 / far()));
    }

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
        colour.resize(w, h);
        depth.resize(w, h);
        output?.resize(w, h);
        for (const method of methods.values()) method.resize(w, h);
      },
      frame(time, encoder, target) {
        clock += time.delta;
        const down = pointer.state.down && pointer.state.inside;
        if (down && !wasDown) {
          clicked = true;
          aim = depthAt(pointer.state.x, pointer.state.y);
        }
        wasDown = down;
        if (!clicked) aim = demoAim(time.still ? 0 : Math.floor(clock / DEMO_HOLD));
        aim ??= focus;
        // Eased in log distance, as a focus motor moves (see focus-cursor).
        const ease = time.still ? 1 : 1 - Math.exp(-time.delta / params.rack);
        focus = Math.exp(Math.log(focus) + (Math.log(aim) - Math.log(focus)) * ease);

        const id = (METHODS as readonly string[]).includes(params.method)
          ? params.method
          : 'gather';
        let method = methods.get(id);
        if (!method) {
          method = DOF_METHODS[id as DofMethodId](device);
          method.resize(width, height);
          methods.set(id, method);
        }

        uniforms.set({
          out_size: [width, height],
          threshold: params.threshold,
          gain: params.highlights,
          near: near(),
          far: far(),
        });
        uniforms.upload();
        renderFullscreen(
          encoder,
          [colour.view, depth.view],
          prepare,
          [
            device.createBindGroup({
              layout: prepare.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: { buffer: uniforms.buffer } },
                { binding: 1, resource: photo.createView() },
                { binding: 2, resource: disparity.createView() },
                { binding: 3, resource: sampler },
              ],
            }),
          ],
          { timestampWrites: profiler.pass('prepare') },
        );
        const lens = lensFromCamera({
          focalLength: 85,
          fNumber: params.fNumber,
          focusDistance: focus,
          imageHeight: height,
        });
        method.encode(
          encoder,
          { colour: colour.view, depth: depth.view, width, height },
          output?.view ?? tail.scene.view,
          { lens, aperture: params },
          profiler,
        );
        if (output) {
          encoder.copyTextureToTexture(
            { texture: output.texture },
            { texture: tail.scene.texture },
            [width, height],
          );
        }
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({
        method: methods.get(params.method)?.name ?? params.method,
        'focus (m)': focus.toFixed(2),
      }),
      destroy() {
        canvas.removeEventListener('dragover', onDragOver);
        canvas.removeEventListener('drop', onDrop);
        pointer.destroy();
        for (const method of methods.values()) method.destroy();
        photo.destroy();
        disparity.destroy();
        colour.destroy();
        depth.destroy();
        output?.destroy();
        uniforms.destroy();
        tail.destroy();
      },
    };
  },
});

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

/** The red channel of an `rgba8unorm` map, read back once for picking. */
async function readDisparity(device: GPUDevice, texture: GPUTexture): Promise<DepthMap> {
  const { width, height } = texture;
  const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
  const buffer = device.createBuffer({
    size: bytesPerRow * height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const encoder = device.createCommandEncoder();
  encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow }, [width, height]);
  device.queue.submit([encoder.finish()]);
  await buffer.mapAsync(GPUMapMode.READ);
  const bytes = new Uint8Array(buffer.getMappedRange());
  const values = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) values[y * width + x] = bytes[y * bytesPerRow + x * 4]! / 255;
  }
  buffer.unmap();
  buffer.destroy();
  return { width, height, values };
}
