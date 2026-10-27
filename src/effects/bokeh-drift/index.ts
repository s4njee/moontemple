import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { APERTURE_PARAMS } from '../../gpu/optics/aperture.ts';
import { cocRadius } from '../../gpu/optics/lens.ts';
import { createPointLayer, POINT_FLOATS } from '../../gpu/points.ts';
import { trackPointer } from '../../gpu/pointer.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { createRandom } from '../../gpu/random.ts';
import { withChunks } from '../../gpu/shader.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import shader from './haze.wgsl';
import { hueColour, type Rgb } from './hue.ts';
import { meta } from './meta.ts';

const Params = defineUniformStruct('Params', {
  ground: 'vec3f',
  aspect: 'f32',
  glow_colour: 'vec3f',
  haze: 'f32',
  light_pos: 'vec2f',
  light: 'f32',
  view_scale: 'f32',
});

/** Each palette runs between two colours; an orb takes a random point between them. */
const PALETTES: Record<string, { from: Rgb; to: Rgb; light: Rgb; ground: Rgb }> = {
  violet: {
    from: [0.1, 0.08, 1],
    to: [0.26, 0.09, 1],
    light: [0.8, 0.85, 1],
    ground: [0.0015, 0.001, 0.006],
  },
  city: {
    from: [1, 0.45, 0.12],
    to: [0.25, 0.55, 1],
    light: [1, 0.85, 0.6],
    ground: [0.003, 0.002, 0.004],
  },
  gold: {
    from: [1, 0.6, 0.15],
    to: [1, 0.3, 0.08],
    light: [1, 0.85, 0.55],
    ground: [0.004, 0.002, 0.001],
  },
};

/** The disc size every orb's light is scaled to, as a share of the image height. */
const REFERENCE_BLUR = 0.045;
/** Where the light sits, in uv, and how far away it is. */
const LIGHT_POS: [number, number] = [0.5, 0.17];
const LIGHT_DEPTH = 200;
/** The view the glow is worked out for: 2 tan(fov / 2) for a 50° vertical field of view. */
const VIEW_SCALE = 2 * Math.tan((25 * Math.PI) / 180);
/** How bright the glow is for a light of 1, and how much light the light's own disc carries. */
const GLOW = 0.1;
const LIGHT_DISC = 60;

interface Orb {
  /** Screen position in uv at depth `z`, before drift. */
  u: number;
  v: number;
  /** Metres. */
  z: number;
  /** Rise in image heights a second, at depth 1 m. */
  rise: number;
  phase: number;
  /** Share between the palette's two colours, 0..1. */
  hue: number;
  /** Light relative to the reference disc. */
  level: number;
}

function buildOrbs(count: number): Orb[] {
  const random = createRandom(31);
  return Array.from({ length: count }, () => ({
    // A little past each side, so the parallax never opens a gap at the edge.
    u: -0.05 + 1.1 * random(),
    v: random(),
    // More of them far than near, as a lit street behind the subject has.
    z: 1.5 * Math.pow(20, random()),
    rise: 0.015 + 0.03 * random(),
    phase: random() * Math.PI * 2,
    hue: random(),
    // A spread of brightness, a few much brighter than the rest.
    level: 0.09 * Math.exp(0.9 * (random() + random() + random() - 1.5)),
  }));
}

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    count: { type: 'number', default: 110, min: 20, max: 600, step: 10, label: 'orbs' },
    focus: { type: 'number', default: 0.5, min: 0.3, max: 20, step: 0.05, label: 'focus (m)' },
    blur: {
      type: 'number',
      default: 0.045,
      min: 0.005,
      max: 0.12,
      step: 0.001,
      label: 'blur at infinity',
    },
    speed: { type: 'number', default: 1, min: 0, max: 4, step: 0.05, label: 'drift' },
    parallax: { type: 'number', default: 0.3, min: 0, max: 1, step: 0.01 },
    brightness: { type: 'number', default: 1, min: 0, max: 4, step: 0.05, label: 'orbs' },
    light: { type: 'number', default: 1, min: 0, max: 3, step: 0.05, label: 'light above' },
    haze: {
      type: 'number',
      default: 1.2,
      min: 0,
      max: 4,
      step: 0.05,
      label: 'haze (optical depth)',
    },
    palette: { type: 'select', default: 'violet', options: [...Object.keys(PALETTES), 'rgb'] },
    cycle: {
      type: 'number',
      default: 60,
      min: 0,
      max: 240,
      step: 1,
      label: 'rgb: seconds a turn (0 holds)',
    },
    hue: { type: 'number', default: 0, min: 0, max: 1, step: 0.01, label: 'rgb: hue' },
    spread: { type: 'number', default: 0.12, min: 0, max: 0.5, step: 0.01, label: 'rgb: spread' },
    ...APERTURE_PARAMS,
    rim: { ...APERTURE_PARAMS.rim, default: 0.25 },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.8 },
  },
  presets: {
    'violet night': {},
    'city lights': { palette: 'city', count: 180, light: 0, blur: 0.035, brightness: 1.5 },
    'gold hexagons': { palette: 'gold', blades: 6, curvature: 0.1, rotation: 10, light: 0.6 },
    'soap bubbles': { rim: 0.9, count: 90, blur: 0.06 },
    'swirly lens': { vignette: 0.9, count: 200, blur: 0.03 },
    'pulled focus': { focus: 6, count: 160 },
    'rgb sweep': { palette: 'rgb' },
  },

  async create({ device, format, hdr, canvas, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'bokeh drift' });
    const points = createPointLayer(device, { label: 'bokeh drift', format: tail.scene.format });
    const uniforms = createUniformBuffer(device, Params, 'bokeh drift');
    const pipeline = createFullscreenPipeline(device, {
      fragment: withChunks(shader, { 'params.wgsl': Params.wgsl }),
      entryPoint: 'haze',
      format: tail.scene.format,
    });
    const group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniforms.buffer } }],
    });
    const pointer = trackPointer(canvas);
    let orbs: Orb[] = [];
    let data = new Float32Array(0);
    let width = 1;
    let height = 1;
    let clock = 0;
    // Real seconds for the colour sweep, so the drift speed does not hurry it.
    let colourClock = 0;
    // The pointer's offset from the centre, eased so the field settles rather than jumps.
    const look = { x: 0, y: 0 };

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        clock += time.delta * params.speed;
        colourClock += time.delta;
        const count = Math.round(params.count);
        if (orbs.length !== count) {
          orbs = buildOrbs(count);
          data = new Float32Array((count + 1) * POINT_FLOATS);
        }
        const aim = pointer.state.inside
          ? { x: pointer.state.x - 0.5, y: pointer.state.y - 0.5 }
          : { x: 0, y: 0 };
        const ease = time.still ? 1 : 1 - Math.exp(-time.delta * 3);
        look.x += (aim.x - look.x) * ease;
        look.y += (aim.y - look.y) * ease;

        // The rgb palette sweeps round the hue wheel, each orb a little ahead of or behind the rest.
        const sweep = params.palette === 'rgb';
        // A page can hold the sweep (`cycle` 0) and turn `hue` itself, to keep its own colours in step.
        const turn = (params.cycle > 0 ? colourClock / params.cycle : 0) + params.hue;
        const palette = sweep
          ? (() => {
              const now = hueColour(turn);
              return {
                from: now,
                to: now,
                light: [0.75 + 0.25 * now[0], 0.75 + 0.25 * now[1], 0.75 + 0.25 * now[2]] as Rgb,
                ground: [0.0015, 0.0015, 0.0025] as Rgb,
              };
            })()
          : (PALETTES[params.palette] ?? PALETTES.violet!);
        const lens = { focus: params.focus, blurAtInfinity: params.blur * height };
        // An orb's light is set against a disc of the reference size, so changing the focus or the
        // blur spreads the same light wider or narrower, as a lens does.
        const reference = Math.PI * (REFERENCE_BLUR * height) ** 2;
        const aspect = width / height;
        let n = 0;
        const put = (x: number, y: number, radius: number, colour: Rgb, light: number) => {
          data.set(
            [x, y, radius, 0, colour[0] * light, colour[1] * light, colour[2] * light, 0],
            n * POINT_FLOATS,
          );
          n++;
        };

        for (const orb of orbs) {
          const radius = cocRadius(lens, orb.z);
          const margin = (Math.abs(radius) + 2) / height;
          // Nearer orbs rise faster and sway wider, by perspective; each wraps round the frame.
          const span = 1 + 2 * margin;
          const rise = (orb.rise * clock) / orb.z;
          const v = ((((orb.v - rise + margin) % span) + span) % span) - margin;
          const sway = (0.012 / orb.z) * Math.sin(clock * 0.4 + orb.phase);
          const shift = (params.parallax * 0.08) / orb.z;
          const x = (orb.u + sway - look.x * shift) * width;
          const colour: Rgb = sweep
            ? hueColour(turn + (orb.hue - 0.5) * params.spread)
            : [
                palette.from[0] + (palette.to[0] - palette.from[0]) * orb.hue,
                palette.from[1] + (palette.to[1] - palette.from[1]) * orb.hue,
                palette.from[2] + (palette.to[2] - palette.from[2]) * orb.hue,
              ];
          put(
            x,
            (v - look.y * shift) * height,
            radius,
            colour,
            orb.level * params.brightness * reference,
          );
        }
        if (params.light > 0) {
          put(
            LIGHT_POS[0] * width,
            LIGHT_POS[1] * height,
            cocRadius(lens, LIGHT_DEPTH),
            palette.light,
            // What reaches the lens directly: the fog takes e^-tau of it on the way.
            LIGHT_DISC * params.light * reference * Math.exp(-params.haze),
          );
        }
        points.setPoints(data, n);

        uniforms.set({
          ground: palette.ground,
          aspect,
          glow_colour: palette.from,
          haze: params.haze,
          light_pos: LIGHT_POS,
          light: GLOW * params.light,
          view_scale: VIEW_SCALE,
        });
        uniforms.upload();
        renderFullscreen(encoder, tail.scene.view, pipeline, [group], {
          timestampWrites: profiler.pass('haze'),
        });
        points.encode(encoder, tail.scene.view, { width, height, aperture: params }, profiler);
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({ orbs: orbs.length }),
      destroy() {
        pointer.destroy();
        points.destroy();
        uniforms.destroy();
        tail.destroy();
      },
    };
  },
});
