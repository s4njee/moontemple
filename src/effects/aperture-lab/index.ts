import type { ApertureSettings } from '../../gpu/optics/aperture.ts';
import { lensCamera } from '../../gpu/optics/camera.ts';
import { createPointLayer, PointList } from '../../gpu/points.ts';
import { trackPointer } from '../../gpu/pointer.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';

const PLAIN: ApertureSettings = {
  blades: 0,
  rotation: 0,
  curvature: 0,
  rim: 0,
  rings: 0,
  ringCount: 4,
  vignette: 0,
};

/** The apertures, left to right under the pointer. */
const APERTURES: readonly { name: string; aperture: ApertureSettings }[] = [
  { name: 'round', aperture: PLAIN },
  { name: 'five straight blades', aperture: { ...PLAIN, blades: 5, rotation: 18 } },
  { name: 'six straight blades', aperture: { ...PLAIN, blades: 6, rotation: 30 } },
  { name: 'seven curved blades', aperture: { ...PLAIN, blades: 7, curvature: 0.35 } },
  { name: 'nine rounded blades', aperture: { ...PLAIN, blades: 9, curvature: 0.6 } },
  { name: 'soap bubble (over-corrected)', aperture: { ...PLAIN, rim: 0.9 } },
  { name: 'soft edge (under-corrected)', aperture: { ...PLAIN, rim: -0.5 } },
  { name: 'onion rings (aspherical)', aperture: { ...PLAIN, rings: 0.25, ringCount: 5 } },
  { name: "cat's eye (vignetting)", aperture: { ...PLAIN, vignette: 0.9 } },
];

/** How long the demo shows each aperture with no pointer, seconds. */
const HOLD = 3;

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    aperture: {
      type: 'select',
      default: 'cycle',
      options: ['cycle', ...APERTURES.map((a) => a.name)],
      label: 'aperture (cycle: by time or pointer)',
    },
    fNumber: { type: 'number', default: 1.8, min: 1, max: 8, step: 0.1, label: 'f-number (85 mm)' },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.4 },
  },
  presets: {
    'every aperture': {},
    'five blades': { aperture: 'five straight blades' },
    'soap bubble': { aperture: 'soap bubble (over-corrected)' },
    "cat's eye": { aperture: "cat's eye (vignetting)" },
  },

  async create({ device, format, hdr, canvas, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'aperture lab' });
    const points = createPointLayer(device, { label: 'aperture lab', format: tail.scene.format });
    const pointer = trackPointer(canvas);
    const list = new PointList();
    let width = 1;
    let height = 1;
    let clock = 0;
    let shown = APERTURES[0]!;
    let fNumber = params.fNumber;

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        clock += time.delta;
        const fixed = APERTURES.find((a) => a.name === params.aperture);
        if (fixed) {
          shown = fixed;
          fNumber = params.fNumber;
        } else if (pointer.state.inside) {
          const x = Math.min(0.999, Math.max(0, pointer.state.x));
          shown = APERTURES[Math.floor(x * APERTURES.length)]!;
          fNumber = 1 + 4.6 * Math.min(1, Math.max(0, pointer.state.y));
        } else {
          shown = APERTURES[Math.floor(clock / HOLD) % APERTURES.length]!;
          fNumber = params.fNumber;
        }
        // Focused at 1 m: the grid at 40 m is all but a point at infinity, the near row at 0.6 m
        // is in front of the focus and drawn flipped.
        const camera = lensCamera({ focalLength: 85, fNumber, focus: 1, width, height });
        const far = 40;
        const near = 0.6;
        list.clear();
        const put = (u: number, v: number, z: number, light: number) => {
          const radius = camera.coc(z);
          const l = light * Math.PI * (0.05 * height) ** 2;
          list.push(u * width, v * height, radius, 0.95 * l, 0.9 * l, 0.82 * l);
        };
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 6; col++) put((col + 0.5) / 6, 0.14 + row * 0.22, far, 0.4);
        }
        for (let col = 0; col < 5; col++) put((col + 0.5) / 5, 0.86, near, 0.4);

        list.upload(points);
        points.encode(
          encoder,
          tail.scene.view,
          { width, height, aperture: shown.aperture, clear: [0.002, 0.002, 0.003, 1] },
          profiler,
        );
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({ aperture: shown.name, 'f-number': fNumber.toFixed(1) }),
      destroy() {
        pointer.destroy();
        points.destroy();
        tail.destroy();
      },
    };
  },
});
