/*
 * Halation (story 2.5): film's red halo round bright light, moving light rather than adding it. See
 * halation.wgsl. Runs on the HDR scene before the tail:
 *
 *   const halation = createHalation(device, { format: tail.scene.format });
 *   halation.resize(width, height);
 *   halation.encode(encoder, tail.scene, { strength: 0.3, radius: 0.02 * height });
 */
import { createBlur } from '../passes/blur.ts';
import { createFullscreenPipeline, drawFullscreen } from '../fullscreen.ts';
import type { PassProfiler } from '../profiler.ts';
import { createRenderTarget, type TargetView } from '../targets.ts';
import shader from './halation.wgsl';

export interface HalationSettings {
  /** Share of the red channel's light that is spread, 0..1; green gets a third, blue a twentieth. */
  strength: number;
  /** Width of the halo, device pixels (the blur's sigma at full size). */
  radius: number;
  /** Per-channel share of `strength`. Default film's: (1, 0.35, 0.05). */
  tint?: readonly [number, number, number];
}

export interface Halation {
  resize(width: number, height: number): void;
  /** Moves part of `scene`'s light into a halo, in place. `scene` must be sampleable. */
  encode(
    encoder: GPUCommandEncoder,
    scene: TargetView,
    settings: HalationSettings,
    profiler?: PassProfiler,
  ): void;
  destroy(): void;
}

export function createHalation(device: GPUDevice, options: { format: GPUTextureFormat }): Halation {
  const { format } = options;
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  const down = createFullscreenPipeline(device, { fragment: shader, entryPoint: 'down', format });
  // out = src * 1 + dst * constant: the constant is 1 - spread per channel.
  const keep: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'constant', operation: 'add' };
  const composite = createFullscreenPipeline(device, {
    fragment: shader,
    entryPoint: 'composite',
    format,
    blend: { color: keep, alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' } },
  });
  const spread = device.createBuffer({
    label: 'halation spread',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const half = createRenderTarget(device, { label: 'halation half', format, width: 1, height: 1 });
  const halo = createRenderTarget(device, { label: 'halation halo', format, width: 1, height: 1 });
  const blur = createBlur(device, { label: 'halation', format, width: 1, height: 1 });

  return {
    resize(width, height) {
      const w = Math.max(1, Math.round(width / 2));
      const h = Math.max(1, Math.round(height / 2));
      half.resize(w, h);
      halo.resize(w, h);
      blur.resize(w, h);
    },
    encode(encoder, scene, settings, profiler) {
      const tint = settings.tint ?? [1, 0.35, 0.05];
      const s = tint.map((t) => Math.min(1, Math.max(0, settings.strength * t))) as [
        number,
        number,
        number,
      ];
      device.queue.writeBuffer(spread, 0, new Float32Array([s[0], s[1], s[2], 0]));

      const downPass = encoder.beginRenderPass({
        label: 'halation down',
        colorAttachments: [
          { view: half.view, loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' },
        ],
        timestampWrites: profiler?.pass('halation down'),
      });
      drawFullscreen(
        downPass,
        down,
        device.createBindGroup({
          layout: down.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: scene.view },
            { binding: 1, resource: sampler },
          ],
        }),
      );
      downPass.end();

      // The blur works at half size, so its sigma is half the halo's width.
      const sigma = Math.max(0.5, settings.radius / 2);
      blur.encode(encoder, half.view, halo.view, {
        radius: Math.min(64, Math.ceil(sigma * 3)),
        sigma,
      });

      const pass = encoder.beginRenderPass({
        label: 'halation composite',
        colorAttachments: [{ view: scene.view, loadOp: 'load', storeOp: 'store' }],
        timestampWrites: profiler?.pass('halation'),
      });
      pass.setBlendConstant([1 - s[0], 1 - s[1], 1 - s[2], 1]);
      drawFullscreen(
        pass,
        composite,
        device.createBindGroup({
          layout: composite.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: halo.view },
            { binding: 1, resource: sampler },
            { binding: 2, resource: { buffer: spread } },
          ],
        }),
      );
      pass.end();
    },
    destroy() {
      spread.destroy();
      half.destroy();
      halo.destroy();
      blur.destroy();
    },
  };
}
