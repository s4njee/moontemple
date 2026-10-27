import { addFlareGhosts } from '../../gpu/glare/flare.ts';
import { createGlareLayer, GLARE_FLOATS, spikesFor } from '../../gpu/glare/glare.ts';
import { APERTURE_PARAMS } from '../../gpu/optics/aperture.ts';
import { createPointLayer, PointList } from '../../gpu/points.ts';
import { trackPointer } from '../../gpu/pointer.ts';
import { createHalation } from '../../gpu/post/halation.ts';
import { createHdrTail, OVERLAY_PARAMS, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';

const WARMTH: Record<string, readonly [number, number, number]> = {
  daylight: [1, 0.97, 0.92],
  tungsten: [1, 0.8, 0.55],
  blue: [0.75, 0.85, 1],
};

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    brightness: { type: 'number', default: 1, min: 0, max: 4, step: 0.05 },
    ghosts: { type: 'number', default: 1.5, min: 0, max: 5, step: 0.05 },
    spikeShare: { type: 'number', default: 0.08, min: 0, max: 0.3, step: 0.005, label: 'spikes' },
    spikeLength: {
      type: 'number',
      default: 0.06,
      min: 0.01,
      max: 0.2,
      step: 0.002,
      label: 'spike length',
    },
    streak: {
      type: 'number',
      default: 0,
      min: 0,
      max: 0.3,
      step: 0.005,
      label: 'anamorphic streak',
    },
    halation: { type: 'number', default: 0.2, min: 0, max: 0.8, step: 0.01 },
    light: {
      type: 'select',
      default: 'daylight',
      options: Object.keys(WARMTH),
      label: 'light colour',
    },
    ...APERTURE_PARAMS,
    blades: { ...APERTURE_PARAMS.blades, default: 6 },
    curvature: { ...APERTURE_PARAMS.curvature, default: 0.1 },
    rotation: { ...APERTURE_PARAMS.rotation, default: 15 },
    vignette: { ...APERTURE_PARAMS.vignette, default: 0 },
    ...TAIL_PARAMS,
    ...OVERLAY_PARAMS,
  },
  presets: {
    'modern lens': {},
    anamorphic: { streak: 0.12, ghosts: 2.5, spikeShare: 0, blades: 0, light: 'blue' },
    'vintage zoom': {
      ghosts: 3,
      blades: 7,
      curvature: 0,
      halation: 0.45,
      light: 'tungsten',
      rings: 0.15,
    },
    'clean light': { ghosts: 0, spikeShare: 0.05, halation: 0 },
  },

  async create({ device, format, hdr, canvas, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'flare cursor' });
    const points = createPointLayer(device, { label: 'flare cursor', format: tail.scene.format });
    const glare = createGlareLayer(device, { label: 'flare cursor', format: tail.scene.format });
    const halation = createHalation(device, { format: tail.scene.format });
    const pointer = trackPointer(canvas);
    const list = new PointList();
    const source = new Float32Array(GLARE_FLOATS);
    let width = 1;
    let height = 1;
    let clock = 0;
    const at = { x: 0.7, y: 0.3 };

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
        halation.resize(w, h);
      },
      frame(time, encoder, target) {
        clock += time.delta;
        // The pointer, eased a little so the ghosts swing rather than jump; with none, the light
        // drifts round the upper half of the frame.
        const aim = pointer.state.inside
          ? { x: pointer.state.x, y: pointer.state.y }
          : {
              x: 0.5 + 0.32 * Math.sin(clock * 0.17),
              y: 0.32 + 0.12 * Math.sin(clock * 0.23 + 1.3),
            };
        const ease = time.still ? 1 : 1 - Math.exp(-time.delta / 0.12);
        at.x += (aim.x - at.x) * ease;
        at.y += (aim.y - at.y) * ease;

        const tint = WARMTH[params.light] ?? WARMTH.daylight!;
        const total = 30 * Math.PI * (0.012 * height) ** 2 * params.brightness;
        const light: [number, number, number] = [tint[0] * total, tint[1] * total, tint[2] * total];
        const x = at.x * width;
        const y = at.y * height;
        list.clear();
        // The light itself: a small hot disc.
        list.push(x, y, 0.006 * height, light[0], light[1], light[2]);
        if (params.ghosts > 0) addFlareGhosts(list, x, y, light, width, height, params.ghosts);
        list.upload(points);
        points.encode(
          encoder,
          tail.scene.view,
          { width, height, aperture: params, clear: [0, 0, 0, 0] },
          profiler,
        );

        source.set([x, y, 0, 0, light[0], light[1], light[2], 0]);
        glare.setLights(source, 1);
        glare.encode(
          encoder,
          tail.scene.view,
          {
            width,
            height,
            spikes: spikesFor(Math.round(params.blades)),
            rotation: (params.rotation * Math.PI) / 180 + Math.PI / 2,
            length: params.spikeLength * height,
            thickness: 0.7,
            spikeShare: params.spikeShare,
            streakShare: params.streak,
            streakLength: 0.3 * height,
          },
          profiler,
        );
        if (params.halation > 0) {
          halation.encode(
            encoder,
            tail.scene,
            { strength: params.halation, radius: 0.015 * height },
            profiler,
          );
        }
        tail.encode(encoder, target, time, params, profiler);
      },
      destroy() {
        pointer.destroy();
        points.destroy();
        glare.destroy();
        halation.destroy();
        tail.destroy();
      },
    };
  },
});
