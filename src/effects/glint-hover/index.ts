import { createGlareLayer, GLARE_FLOATS } from '../../gpu/glare/glare.ts';
import {
  OBSTACLE_SELECTOR,
  TARGET_SELECTOR,
  trackDomRects,
  type ObstacleRect,
} from '../../gpu/dom-rects.ts';
import { flickerIntensity } from '../../gpu/optics/flicker.ts';
import { createPointLayer, PointList } from '../../gpu/points.ts';
import { trackPointer } from '../../gpu/pointer.ts';
import { createHdrTail, OVERLAY_PARAMS, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';

/** At most this many elements glint at once. */
const MAX_GLINTS = 16;
/** Where there is no page (the bare canvas, the tests): a row of cards and a button. */
const STAND_INS: readonly ObstacleRect[] = [
  { x: 0.08, y: 0.28, width: 0.24, height: 0.44, radius: 0.03 },
  { x: 0.38, y: 0.28, width: 0.24, height: 0.44, radius: 0.03 },
  { x: 0.68, y: 0.28, width: 0.24, height: 0.44, radius: 0.03 },
  { x: 0.42, y: 0.8, width: 0.16, height: 0.08, radius: 0.04 },
];

const COLOURS: Record<string, readonly [number, number, number]> = {
  white: [1, 0.98, 0.95],
  gold: [1, 0.78, 0.4],
  ice: [0.75, 0.88, 1],
};

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    reach: {
      type: 'number',
      default: 0.12,
      min: 0.03,
      max: 0.4,
      step: 0.005,
      label: 'reach (image heights)',
    },
    brightness: { type: 'number', default: 1, min: 0, max: 4, step: 0.05 },
    spikeLength: {
      type: 'number',
      default: 0.025,
      min: 0.005,
      max: 0.1,
      step: 0.001,
      label: 'spike length',
    },
    twinkle: { type: 'number', default: 0.25, min: 0, max: 0.6, step: 0.01 },
    colour: { type: 'select', default: 'white', options: Object.keys(COLOURS) },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.5 },
    ...OVERLAY_PARAMS,
  },
  presets: {
    'white glint': {},
    gold: { colour: 'gold', brightness: 1.3 },
    'long spikes': { spikeLength: 0.06, reach: 0.18 },
    'still glints': { twinkle: 0 },
  },

  async create({ device, format, hdr, canvas, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'glint hover' });
    const points = createPointLayer(device, { label: 'glint hover', format: tail.scene.format });
    const glare = createGlareLayer(device, { label: 'glint hover', format: tail.scene.format });
    const pointer = trackPointer(canvas);
    const page = trackDomRects(canvas, { selector: `${OBSTACLE_SELECTOR}, ${TARGET_SELECTOR}` });
    const list = new PointList();
    const glints = new Float32Array(MAX_GLINTS * GLARE_FLOATS);
    let width = 1;
    let height = 1;
    let clock = 0;
    const at = { x: 0.5, y: 0.5 };

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        clock += time.delta;
        const aspect = width / height;
        const found = page.update(time.delta).rects;
        const rects = (found.length > 0 ? found : STAND_INS).slice(0, MAX_GLINTS);
        // The pointer, or with none a slow wander across the page so the glints move on their own.
        const aim = pointer.state.inside
          ? { x: pointer.state.x, y: pointer.state.y }
          : { x: 0.5 + 0.42 * Math.sin(clock * 0.31), y: 0.5 + 0.3 * Math.sin(clock * 0.47 + 1) };
        const ease = time.still ? 1 : 1 - Math.exp(-time.delta / 0.15);
        at.x += (aim.x - at.x) * ease;
        at.y += (aim.y - at.y) * ease;

        const colour = COLOURS[params.colour] ?? COLOURS.white!;
        const scale = 2.5 * Math.PI * (0.01 * height) ** 2 * params.brightness;
        const twinkle = { rate: 2, depth: params.twinkle, shimmer: 0.02, shimmerRate: 10 };
        list.clear();
        let n = 0;
        rects.forEach((rect, i) => {
          // The corner nearest the pointer, set in a little from a rounded corner's tip.
          const inset = (rect.radius ?? 0) * 0.29;
          const cx =
            at.x < rect.x + rect.width / 2
              ? rect.x + inset / aspect
              : rect.x + rect.width - inset / aspect;
          const cy =
            at.y < rect.y + rect.height / 2 ? rect.y + inset : rect.y + rect.height - inset;
          const d = Math.hypot((cx - at.x) * aspect, cy - at.y);
          const level = Math.exp(-((d / params.reach) ** 2)) * flickerIntensity(clock, i, twinkle);
          if (level < 0.02) return;
          const l = scale * level;
          const px = cx * width;
          const py = cy * height;
          // A glint is mostly its spikes: 30% of its light in the point, 70% along the rays.
          list.push(px, py, 0, 0.3 * colour[0] * l, 0.3 * colour[1] * l, 0.3 * colour[2] * l);
          glints.set(
            [px, py, 0, 0, colour[0] * l, colour[1] * l, colour[2] * l, 0],
            n * GLARE_FLOATS,
          );
          n++;
        });
        list.upload(points);
        points.encode(
          encoder,
          tail.scene.view,
          {
            width,
            height,
            aperture: {
              blades: 0,
              rotation: 0,
              curvature: 0,
              rim: 0,
              rings: 0,
              ringCount: 1,
              vignette: 0,
            },
            clear: [0, 0, 0, 0],
          },
          profiler,
        );
        glare.setLights(glints, n);
        // Four spikes, upright: the classic star of a cross-screen filter or a polished corner.
        glare.encode(
          encoder,
          tail.scene.view,
          {
            width,
            height,
            spikes: 4,
            rotation: 0,
            length: params.spikeLength * height,
            thickness: 0.7,
            spikeShare: 0.7,
          },
          profiler,
        );
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({ glints: list.count }),
      destroy() {
        page.destroy();
        pointer.destroy();
        points.destroy();
        glare.destroy();
        tail.destroy();
      },
    };
  },
});
