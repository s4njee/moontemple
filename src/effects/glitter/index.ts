import { hueColour } from '../bokeh-drift/hue.ts';
import { APERTURE_PARAMS } from '../../gpu/optics/aperture.ts';
import { lensCamera } from '../../gpu/optics/camera.ts';
import { createPointLayer, PointList } from '../../gpu/points.ts';
import { trackPointer } from '../../gpu/pointer.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { createRandom } from '../../gpu/random.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';

type Vec3 = [number, number, number];

const normalise = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The sheet: through `CENTRE`, spanned by `ACROSS` and `AWAY` (receding up and into the view). */
const CENTRE: Vec3 = [0, 0.04, 1];
const ACROSS: Vec3 = [1, 0, 0];
const AWAY: Vec3 = normalise([0, -0.5, 0.866]);
/** The sheet's own normal, towards the lens and up. */
const FACING: Vec3 = normalise([0, -0.866, -0.5]);

const COLOURS: Record<string, (facet: Facet) => Vec3> = {
  gold: () => [1, 0.72, 0.32],
  silver: () => [0.88, 0.92, 1],
  holographic: (facet) => {
    const c = hueColour(facet.hue);
    const peak = Math.max(...c);
    return [c[0] / peak, c[1] / peak, c[2] / peak];
  },
};

interface Facet {
  at: Vec3;
  normal: Vec3;
  hue: number;
}

function buildFacets(count: number): Facet[] {
  const random = createRandom(131);
  // Tangent directions for tilting the normal.
  const t1 = ACROSS;
  const t2 = normalise([
    FACING[1] * ACROSS[2] - FACING[2] * ACROSS[1],
    FACING[2] * ACROSS[0] - FACING[0] * ACROSS[2],
    FACING[0] * ACROSS[1] - FACING[1] * ACROSS[0],
  ]);
  return Array.from({ length: count }, () => {
    const s = (random() - 0.5) * 2.2;
    const t = -0.55 + 2.4 * random();
    // Each facet is tilted from the sheet by a Gaussian angle of about 20 degrees.
    const a = Math.sqrt(-2 * Math.log(1 - random())) * 0.35;
    const phi = random() * 2 * Math.PI;
    const tilt = Math.sin(a);
    const normal = normalise([
      FACING[0] * Math.cos(a) + tilt * (Math.cos(phi) * t1[0] + Math.sin(phi) * t2[0]),
      FACING[1] * Math.cos(a) + tilt * (Math.cos(phi) * t1[1] + Math.sin(phi) * t2[1]),
      FACING[2] * Math.cos(a) + tilt * (Math.cos(phi) * t1[2] + Math.sin(phi) * t2[2]),
    ]);
    return {
      at: [
        CENTRE[0] + s * ACROSS[0] + t * AWAY[0],
        CENTRE[1] + s * ACROSS[1] + t * AWAY[1],
        CENTRE[2] + s * ACROSS[2] + t * AWAY[2],
      ],
      normal,
      hue: random(),
    };
  });
}

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    facets: { type: 'number', default: 24000, min: 500, max: 40000, step: 500 },
    sparkle: { type: 'number', default: 4, min: 0.5, max: 8, step: 0.1, label: 'glint width (°)' },
    sweep: { type: 'number', default: 1, min: 0, max: 3, step: 0.05, label: 'light speed' },
    focus: { type: 'number', default: 1.1, min: 0.5, max: 4, step: 0.01, label: 'focus (m)' },
    fNumber: {
      type: 'number',
      default: 1.8,
      min: 1,
      max: 16,
      step: 0.1,
      label: 'f-number (50 mm)',
    },
    brightness: { type: 'number', default: 1, min: 0, max: 4, step: 0.05 },
    colour: { type: 'select', default: 'gold', options: Object.keys(COLOURS) },
    ...APERTURE_PARAMS,
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.8 },
  },
  presets: {
    gold: {},
    silver: { colour: 'silver' },
    holographic: { colour: 'holographic', brightness: 1.3 },
    'all in focus': { fNumber: 11 },
    'hexagonal lens': { blades: 6, curvature: 0, rim: 0.05 },
  },

  async create({ device, format, hdr, canvas, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'glitter' });
    const points = createPointLayer(device, { label: 'glitter', format: tail.scene.format });
    const pointer = trackPointer(canvas);
    const list = new PointList();
    let facets: Facet[] = [];
    let width = 1;
    let height = 1;
    let clock = 0;
    let lightX = 0;

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        clock += time.delta * params.sweep;
        if (facets.length !== Math.round(params.facets))
          facets = buildFacets(Math.round(params.facets));
        // The light, above and a little behind the lens, sweeping slowly from side to side; the
        // pointer moves it instead. Eased, so a jump of the pointer is a sweep, not a flash.
        const aim = pointer.state.inside
          ? (pointer.state.x - 0.5) * 3
          : 1.3 * Math.sin(clock * 0.25);
        const ease = time.still ? 1 : 1 - Math.exp(-time.delta / 0.4);
        lightX += (aim - lightX) * ease;
        const light: Vec3 = [lightX, -1.4, 0.3];
        const camera = lensCamera({
          focalLength: 50,
          fNumber: params.fNumber,
          focus: params.focus,
          width,
          height,
        });
        const sigma = (params.sparkle * Math.PI) / 180;
        const scale = 2.5 * Math.PI * (0.02 * height) ** 2 * params.brightness;
        const colourOf = COLOURS[params.colour] ?? COLOURS.gold!;

        list.clear();
        for (const facet of facets) {
          const [x, y, z] = facet.at;
          // The facet glints when its normal is the half vector between the light and the lens.
          const toLight = normalise([light[0] - x, light[1] - y, light[2] - z]);
          const toEye = normalise([-x, -y, -z]);
          const half = normalise([
            toLight[0] + toEye[0],
            toLight[1] + toEye[1],
            toLight[2] + toEye[2],
          ]);
          const cos = Math.min(1, dot(facet.normal, half));
          if (cos < 0.9) continue;
          const angle = Math.acos(cos);
          const glint = Math.exp((-angle * angle) / (2 * sigma * sigma));
          if (glint < 0.01) continue;
          const [px, py] = camera.project(x, y, z);
          const radius = camera.coc(z);
          if (!camera.visible(px, py, radius)) continue;
          const l = (scale * glint) / (z * z);
          const c = colourOf(facet);
          list.push(px, py, radius, c[0] * l, c[1] * l, c[2] * l);
        }
        list.upload(points);
        points.encode(
          encoder,
          tail.scene.view,
          { width, height, aperture: params, clear: [0.004, 0.003, 0.0025, 1] },
          profiler,
        );
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({ facets: facets.length, glinting: list.count }),
      destroy() {
        pointer.destroy();
        points.destroy();
        tail.destroy();
      },
    };
  },
});
