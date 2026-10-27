import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { APERTURE_PARAMS } from '../../gpu/optics/aperture.ts';
import { lensCamera } from '../../gpu/optics/camera.ts';
import { createPointLayer, PointList } from '../../gpu/points.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { createRandom, noise1 } from '../../gpu/random.ts';
import { withChunks } from '../../gpu/shader.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import shader from './beam.wgsl';
import { meta } from './meta.ts';

const Params = defineUniformStruct('Params', {
  origin: 'vec3f',
  sigma: 'f32',
  direction: 'vec3f',
  haze: 'f32',
  colour: 'vec3f',
  forward: 'f32',
  ground: 'vec3f',
  aspect: 'f32',
  centre: 'vec2f',
  view_scale: 'f32',
});

type Vec3 = [number, number, number];
const normalise = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** The beam: through `ORIGIN`, coming down from the top left and towards the lens. */
const ORIGIN: Vec3 = [0, 0, 1.8];
const DIRECTION: Vec3 = normalise([0.6, 0.9, -0.5]);
const SUNLIGHT: Vec3 = [1, 0.86, 0.66];
const FORWARD = 0.55;

interface Mote {
  /** Along the beam, metres from its origin, and across it (two offsets). */
  along: number;
  across: [number, number];
  seed: number;
  size: number;
}

function buildMotes(count: number, sigma: number): Mote[] {
  const random = createRandom(173);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
  return Array.from({ length: count }, (_, i) => ({
    along: -2.6 + 5.2 * random(),
    // Spread a little wider than the beam, so some drift in and out of its edge.
    across: [gauss() * sigma * 1.6, gauss() * sigma * 1.6],
    seed: i,
    size: 0.4 + random() ** 4 * 3,
  }));
}

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    motes: { type: 'number', default: 2500, min: 200, max: 12000, step: 100 },
    width: {
      type: 'number',
      default: 0.22,
      min: 0.05,
      max: 0.6,
      step: 0.01,
      label: 'beam width (m)',
    },
    sun: { type: 'number', default: 1, min: 0, max: 3, step: 0.05, label: 'sunlight' },
    haze: { type: 'number', default: 1, min: 0, max: 4, step: 0.05, label: 'air in the beam' },
    drift: { type: 'number', default: 1, min: 0, max: 4, step: 0.05 },
    focus: { type: 'number', default: 1.8, min: 0.4, max: 6, step: 0.02, label: 'focus (m)' },
    fNumber: {
      type: 'number',
      default: 1.8,
      min: 1,
      max: 16,
      step: 0.1,
      label: 'f-number (50 mm)',
    },
    ...APERTURE_PARAMS,
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.6 },
  },
  presets: {
    'afternoon sun': {},
    'thick dust': { motes: 8000, haze: 2 },
    'narrow beam': { width: 0.1, sun: 1.6 },
    'deep focus': { fNumber: 11 },
    'focus near': { focus: 0.7, sun: 2 },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'dust in light' });
    const points = createPointLayer(device, { label: 'dust in light', format: tail.scene.format });
    const uniforms = createUniformBuffer(device, Params, 'dust in light');
    const pipeline = createFullscreenPipeline(device, {
      fragment: withChunks(shader, { 'params.wgsl': Params.wgsl }),
      entryPoint: 'beam',
      format: tail.scene.format,
    });
    const group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniforms.buffer } }],
    });
    const list = new PointList();
    let motes: Mote[] = [];
    let moteKey = '';
    let width = 1;
    let height = 1;
    let clock = 0;

    // Two directions across the beam, for placing motes round its axis.
    const side = normalise([DIRECTION[1], -DIRECTION[0], 0]);
    const up = normalise([
      DIRECTION[1] * side[2] - DIRECTION[2] * side[1],
      DIRECTION[2] * side[0] - DIRECTION[0] * side[2],
      DIRECTION[0] * side[1] - DIRECTION[1] * side[0],
    ]);

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        clock += time.delta * params.drift;
        const sigma = params.width;
        const key = `${Math.round(params.motes)}|${sigma}`;
        if (key !== moteKey) {
          moteKey = key;
          motes = buildMotes(Math.round(params.motes), sigma);
        }
        const centre: [number, number] = [0.5, 0.5];
        const camera = lensCamera({
          focalLength: 50,
          fNumber: params.fNumber,
          focus: params.focus,
          width,
          height,
          centre,
        });
        const scale = 0.03 * Math.PI * (0.03 * height) ** 2 * params.sun;
        const g2 = FORWARD * FORWARD;

        list.clear();
        for (const mote of motes) {
          // Drifting slowly in the air: a wander of a few centimetres each way and a slow sink.
          const wobble = (k: number) => 0.06 * noise1(clock * 0.15 + mote.seed * 1.7, k);
          const a = mote.across[0] + wobble(1);
          const b = mote.across[1] + wobble(2);
          const sink = ((((mote.along + 0.04 * clock + 2.6) % 5.2) + 5.2) % 5.2) - 2.6;
          const x = ORIGIN[0] + DIRECTION[0] * sink + side[0] * a + up[0] * b;
          const y = ORIGIN[1] + DIRECTION[1] * sink + side[1] * a + up[1] * b + wobble(3);
          const z = ORIGIN[2] + DIRECTION[2] * sink + side[2] * a + up[2] * b;
          if (z < 0.25) continue;
          // Lit only inside the beam; scattered towards the lens by the same phase as the air.
          const r2 = a * a + b * b;
          const lit = Math.exp(-r2 / (2 * sigma * sigma));
          if (lit < 0.01) continue;
          const toEye = normalise([-x, -y, -z]);
          const cos = DIRECTION[0] * toEye[0] + DIRECTION[1] * toEye[1] + DIRECTION[2] * toEye[2];
          const phase = (1 - g2) / (4 * Math.PI * Math.pow(1 + g2 - 2 * FORWARD * cos, 1.5));
          const [px, py] = camera.project(x, y, z);
          const radius = camera.coc(z);
          if (!camera.visible(px, py, radius)) continue;
          const l = (scale * mote.size * lit * phase * 4 * Math.PI) / (z * z);
          list.push(px, py, radius, SUNLIGHT[0] * l, SUNLIGHT[1] * l, SUNLIGHT[2] * l);
        }
        list.upload(points);

        uniforms.set({
          origin: ORIGIN,
          sigma,
          direction: DIRECTION,
          haze: 0.6 * params.haze * params.sun,
          colour: SUNLIGHT,
          forward: FORWARD,
          ground: [0.003, 0.0025, 0.002],
          aspect: width / height,
          centre,
          view_scale: camera.viewScale,
        });
        uniforms.upload();
        renderFullscreen(encoder, tail.scene.view, pipeline, [group], {
          timestampWrites: profiler.pass('beam'),
        });
        points.encode(encoder, tail.scene.view, { width, height, aperture: params }, profiler);
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({ motes: motes.length, lit: list.count }),
      destroy() {
        points.destroy();
        uniforms.destroy();
        tail.destroy();
      },
    };
  },
});
