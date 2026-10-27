import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { generateMipmaps, mipLevelCount } from '../../gpu/mipmap.ts';
import { packSolid } from '../../gpu/optics/glass.ts';
import { GLASSES } from '../../gpu/optics/spectral.ts';
import { trackPointer } from '../../gpu/pointer.ts';
import { withChunks } from '../../gpu/shader.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import shader from './badge.wgsl';
import { meta } from './meta.ts';
import { badgePlanes, outline, SHAPES, type BadgeShape } from './shape.ts';

/*
 * A glass badge over the page's image (story 10.7). See badge.wgsl. The solid's planes come from
 * shape.ts; the image is the page's, handed over the stable way (6.1): decoded to an ImageBitmap
 * and copied into a texture. Dropping a file is the gallery's way of handing one.
 */

const Params = defineUniformStruct('Params', {
  out_size: 'vec2f',
  centre: 'vec2f',
  rot0: 'vec4f',
  rot1: 'vec4f',
  rot2: 'vec4f',
  index: 'vec4f',
  absorb: 'vec4f',
  focal: 'f32',
  room: 'f32',
  exposure: 'f32',
});

const IMAGE_FORMAT: GPUTextureFormat = 'rgba8unorm-srgb';
const IMAGE_USAGE =
  GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST;
const SAMPLE: [number, number] = [1600, 1000];
/** How far the badge may lean towards the pointer, radians. */
const LEAN = 0.32;

/** Rows of a rotation: `pitch` about x, then `yaw` about y. */
type Row = [number, number, number, number];
function rotation(yaw: number, pitch: number): [Row, Row, Row] {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return [
    [cy, sy * sp, sy * cp, 0],
    [0, cp, -sp, 0],
    [-sy, cy * sp, cy * cp, 0],
  ];
}

export const effect = defineEffect({
  meta,
  params: {
    shape: { type: 'select', default: 'hexagon', options: SHAPES },
    glass: { type: 'select', default: 'flint', options: ['crown', 'flint', 'diamond'] },
    size: {
      type: 'number',
      default: 0.24,
      min: 0.08,
      max: 0.45,
      step: 0.01,
      label: 'size (share of height)',
    },
    thickness: {
      type: 'number',
      default: 0.35,
      min: 0.05,
      max: 1,
      step: 0.01,
      label: 'thickness (share of size)',
    },
    bevel: {
      type: 'number',
      default: 0.22,
      min: 0,
      max: 0.5,
      step: 0.01,
      label: 'bevel width (share of size)',
    },
    bevelAngle: {
      type: 'number',
      default: 42,
      min: 10,
      max: 70,
      step: 1,
      label: 'bevel angle (degrees)',
    },
    tint: { type: 'color', default: [0.92, 0.97, 1], label: 'glass colour' },
    room: {
      type: 'number',
      default: 0.6,
      min: 0,
      max: 2,
      step: 0.01,
      label: 'reflected room light',
    },
    exposure: { type: 'number', default: 1, min: 0.2, max: 2, step: 0.01 },
    follow: { type: 'boolean', default: true, label: 'lean towards the pointer' },
  },
  presets: {
    hexagon: {},
    'shield in crown': { shape: 'shield', glass: 'crown' },
    'diamond pill': { shape: 'pill', glass: 'diamond', size: 0.16, thickness: 0.6 },
    'thin octagon': { shape: 'octagon', thickness: 0.12, bevel: 0.12 },
    'blue glass': { tint: [0.55, 0.8, 1] },
  },

  async create({ device, format, canvas, params, profiler }) {
    const uniforms = createUniformBuffer(device, Params, 'glass badge');
    const solidBuffer = device.createBuffer({
      label: 'glass badge solid',
      size: 336,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const source = withChunks(shader, { 'params.wgsl': Params.wgsl });
    const badge = createFullscreenPipeline(device, {
      fragment: source,
      entryPoint: 'badge',
      format,
    });
    const sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
    });
    const pointer = trackPointer(canvas);

    // The sample page, drawn once into the kind of texture a dropped image gets.
    let image = device.createTexture({
      label: 'glass badge page',
      size: SAMPLE,
      format: IMAGE_FORMAT,
      usage: IMAGE_USAGE,
      mipLevelCount: mipLevelCount(...SAMPLE),
    });
    {
      const page = createFullscreenPipeline(device, {
        fragment: source,
        entryPoint: 'page',
        format: IMAGE_FORMAT,
      });
      const encoder = device.createCommandEncoder();
      renderFullscreen(encoder, image.createView({ baseMipLevel: 0, mipLevelCount: 1 }), page);
      generateMipmaps(device, image, encoder);
      device.queue.submit([encoder.finish()]);
    }
    const onDragOver = (event: DragEvent) => event.preventDefault();
    const onDrop = async (event: DragEvent) => {
      event.preventDefault();
      const file = [...(event.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (!file) return;
      const bitmap = await createImageBitmap(file);
      const texture = device.createTexture({
        label: 'glass badge image',
        size: [bitmap.width, bitmap.height],
        format: IMAGE_FORMAT,
        usage: IMAGE_USAGE,
        mipLevelCount: mipLevelCount(bitmap.width, bitmap.height),
      });
      device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, [
        bitmap.width,
        bitmap.height,
      ]);
      bitmap.close();
      generateMipmaps(device, texture);
      image.destroy();
      image = texture;
    };
    canvas.addEventListener?.('dragover', onDragOver);
    canvas.addEventListener?.('drop', onDrop);

    let width = 1;
    let height = 1;
    let clock = 0;
    let yaw = 0;
    let pitch = 0;
    let key = '';

    return {
      resize(w, h) {
        width = w;
        height = h;
        key = '';
      },
      frame(time, encoder, target) {
        if (!time.still) clock += time.delta;
        const size = params.size * height;
        // The planes change only with the shape and its sizes.
        const next = JSON.stringify([
          params.shape,
          size,
          params.thickness,
          params.bevel,
          params.bevelAngle,
        ]);
        if (next !== key) {
          key = next;
          const planes = badgePlanes(
            outline(params.shape as BadgeShape, size),
            params.thickness * size,
            params.bevel * size,
            (params.bevelAngle * Math.PI) / 180,
          );
          device.queue.writeBuffer(solidBuffer, 0, packSolid(planes));
        }
        // Lean towards the pointer, eased; on its own a slow sway; held level when still.
        let aimYaw = 0.12 * Math.sin(clock * 0.4);
        let aimPitch = 0.08 * Math.sin(clock * 0.31);
        if (params.follow && pointer.state.inside) {
          aimYaw = (pointer.state.x - 0.5) * 2 * LEAN;
          aimPitch = -(pointer.state.y - 0.5) * 2 * LEAN;
        }
        const ease = time.still ? 1 : 1 - Math.exp(-time.delta / 0.25);
        yaw += ((time.still ? 0.18 : aimYaw) - yaw) * ease;
        pitch += ((time.still ? 0.1 : aimPitch) - pitch) * ease;
        const [r0, r1, r2] = rotation(yaw, pitch);
        const n = GLASSES[params.glass as keyof typeof GLASSES] ?? GLASSES.flint;
        // Clear glass absorbs a little where its colour is not: per pixel of path.
        const absorb = params.tint.map((t) => -Math.log(Math.max(t, 1e-3)) / Math.max(size, 1));
        uniforms.set({
          out_size: [width, height],
          centre: [width / 2, height / 2],
          rot0: r0,
          rot1: r1,
          rot2: r2,
          index: [n(650), n(550), n(450), 0],
          absorb: [absorb[0]!, absorb[1]!, absorb[2]!, 0],
          focal: 2.5 * height,
          room: params.room,
          exposure: params.exposure,
        });
        uniforms.upload();
        renderFullscreen(
          encoder,
          target,
          badge,
          [
            device.createBindGroup({
              layout: badge.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: { buffer: uniforms.buffer } },
                { binding: 1, resource: { buffer: solidBuffer } },
                { binding: 2, resource: image.createView() },
                { binding: 3, resource: sampler },
              ],
            }),
          ],
          { timestampWrites: profiler.pass('glass badge') },
        );
      },
      destroy() {
        canvas.removeEventListener?.('dragover', onDragOver);
        canvas.removeEventListener?.('drop', onDrop);
        pointer.destroy();
        uniforms.destroy();
        solidBuffer.destroy();
        image.destroy();
      },
    };
  },
});
