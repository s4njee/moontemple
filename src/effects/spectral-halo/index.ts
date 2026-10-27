import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { createHalation } from '../../gpu/post/halation.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import {
  bloomLobes,
  createSpectralBloom,
  type SpectralBloomMode,
} from '../../gpu/post/spectral-bloom.ts';
import { withChunks } from '../../gpu/shader.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';
import shader from './shapes.wgsl';

const Params = defineUniformStruct('Params', {
  /** Centre (px) and radius (px). */
  ring: 'vec4f',
  /** Centre (px), circumradius (px) and turn (radians). */
  hexagon: 'vec4f',
  /** Centre (px), core radius (px) and the core's gain over a line. */
  star: 'vec4f',
  line_px: 'f32',
  brightness: 'f32',
});

/** What the `halo` control can show: the spectral bloom, its comparisons, or nothing. */
const HALOS = ['spectral', 'per-channel', 'halation', 'plain bloom', 'none'] as const;
const MODES: Record<string, SpectralBloomMode> = {
  spectral: 'spectral',
  'per-channel': 'channel',
  'plain bloom': 'plain',
};

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    halo: { type: 'select', default: 'spectral', options: HALOS },
    strength: { type: 'number', default: 0.5, min: 0, max: 0.9, step: 0.01, label: 'scatter' },
    radius: {
      type: 'number',
      default: 0.045,
      min: 0.005,
      max: 0.15,
      step: 0.001,
      label: 'red radius (x short side)',
    },
    spread: {
      type: 'number',
      default: 4,
      min: 1,
      max: 8,
      step: 0.05,
      label: 'spread (red / violet)',
    },
    balance: { type: 'number', default: 1, min: 0, max: 1, step: 0.01 },
    bands: { type: 'number', default: 16, min: 3, max: 32, step: 1 },
    brightness: {
      type: 'number',
      default: 30,
      min: 1,
      max: 80,
      step: 0.5,
      label: 'brightness (x paper white)',
    },
    turn: { type: 'number', default: 0.12, min: 0, max: 1, step: 0.01, label: 'turn (rad/s)' },
    ...TAIL_PARAMS,
    // The halo is the subject, so the tail's own (white) bloom starts off.
    bloom: { ...TAIL_PARAMS.bloom, default: 0 },
  },
  presets: {
    'spectral halo': {},
    'radius per channel': { halo: 'per-channel' },
    'film halation': { halo: 'halation' },
    'plain bloom': { halo: 'plain bloom' },
    'even scatter (blue inside)': { balance: 0 },
    'diffraction (spread 1.75)': { spread: 1.75 },
    'wide red': { spread: 6, radius: 0.08, strength: 0.6 },
    'no halo': { halo: 'none' },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'spectral halo' });
    const bloom = createSpectralBloom(device, {
      label: 'spectral halo',
      format: tail.scene.format,
    });
    const halation = createHalation(device, { format: tail.scene.format });
    const uniforms = createUniformBuffer(device, Params, 'spectral halo params');
    const pipeline = createFullscreenPipeline(device, {
      fragment: withChunks(shader, { 'params.wgsl': Params.wgsl }),
      entryPoint: 'shapes',
      format: tail.scene.format,
    });
    const group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniforms.buffer } }],
    });
    let width = 1;
    let height = 1;
    let turn = 0;

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
        bloom.resize(w, h);
        halation.resize(w, h);
      },
      frame(time, encoder, target) {
        // A held frame shows the hexagon at rest, a corner up.
        turn = time.still ? 0 : turn + time.delta * params.turn;
        // Sizes follow the shorter side, so a tall phone canvas gets the same look as a wide one.
        const short = Math.min(width, height);
        const unit = short / 540;
        // Three shapes in a row, or a column on a tall canvas.
        const wide = width >= height * 1.2;
        const size = wide
          ? Math.min(0.17 * height, 0.13 * width)
          : Math.min(0.13 * height, 0.3 * width);
        const at = (i: number): [number, number] =>
          wide ? [width * (0.2 + 0.3 * i), height / 2] : [width / 2, height * (0.2 + 0.3 * i)];
        uniforms.set({
          ring: [...at(0), size, 0],
          hexagon: [...at(2), size * 1.05, turn + Math.PI / 6],
          star: [...at(1), 2.5 * unit, 5],
          line_px: 1.5 * unit,
          brightness: params.brightness,
        });
        uniforms.upload();
        renderFullscreen(encoder, tail.scene.view, pipeline, [group], {
          timestampWrites: profiler.pass('shapes'),
        });

        const settings = {
          strength: params.strength,
          radius: params.radius * short,
          spread: params.spread,
          balance: params.balance,
          bands: params.bands,
        };
        const mode = MODES[params.halo];
        if (mode) {
          bloom.encode(encoder, tail.scene, { ...settings, mode }, profiler);
        } else if (params.halo === 'halation') {
          // 2.5's halation as it is, reaching as far in red as the per-channel bloom does.
          const red = bloomLobes({ ...settings, mode: 'channel' })[0]!.sigma;
          halation.encode(
            encoder,
            tail.scene,
            { strength: params.strength, radius: red },
            profiler,
          );
        }
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => {
        const anchors = MODES[params.halo] ? bloom.anchors() : [];
        return { anchors: anchors.length, levels: anchors.map((a) => a.level).join(' ') || '-' };
      },
      destroy() {
        uniforms.destroy();
        bloom.destroy();
        halation.destroy();
        tail.destroy();
      },
    };
  },
});
