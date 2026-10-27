import type { AngularProfile } from './optics/profile.ts';

/*
 * Angular colour profiles on the GPU (Epic 5): one rgba32float texture, a profile a row, read by
 * `profile_at` in src/wgsl/profile.wgsl with textureLoad and a linear blend of its own (32-bit float
 * textures are not filterable without an optional feature). Rewritten only when an effect's
 * settings change the physics; the shader reads it every frame.
 */

export interface ProfileTexture {
  readonly texture: GPUTexture;
  readonly view: GPUTextureView;
  /** Uploads `profile` into `row`; its size must be the texture's width. */
  write(row: number, profile: AngularProfile): void;
  destroy(): void;
}

export function createProfileTexture(
  device: GPUDevice,
  options: { width: number; rows: number; label?: string },
): ProfileTexture {
  const texture = device.createTexture({
    label: options.label ?? 'angular profiles',
    size: [options.width, options.rows],
    format: 'rgba32float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  return {
    texture,
    view: texture.createView(),
    write(row, profile) {
      if (profile.size !== options.width) {
        throw new Error(`profile has ${profile.size} entries, the texture ${options.width}`);
      }
      device.queue.writeTexture(
        { texture, origin: [0, row] },
        profile.data as Float32Array<ArrayBuffer>,
        { bytesPerRow: options.width * 16 },
        [options.width, 1],
      );
    },
    destroy() {
      texture.destroy();
    },
  };
}
