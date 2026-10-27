import { APERTURE_PARAMS } from '../../gpu/optics/aperture.ts';
import { lcaBands, type LcaBands, type LcaSettings } from '../../gpu/optics/lca.ts';
import { cocRadius, focalLengthPx, lensFromCamera } from '../../gpu/optics/lens.ts';
import { createPointLayer } from '../../gpu/points.ts';
import { SpectralPointList } from '../../gpu/points-spectral.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { createRandom } from '../../gpu/random.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';

/*
 * Story 9.7's gallery piece: points of light at many depths through a lens with longitudinal
 * chromatic aberration (src/gpu/optics/lca.ts), each split into wavelengths on the shared point
 * layer (src/gpu/points-spectral.ts). See notes.md.
 */

/** An 85 mm lens on a full-frame sensor. */
const FOCAL_LENGTH = 85;
const VIEW_SCALE = 24 / FOCAL_LENGTH;
const NEAR = 1.5;
const FAR = 60;

/**
 * The lens's glass, and how many times its own paraxial aberration to draw. A fast lens's bokeh
 * fringing is far stronger than an achromat's secondary spectrum alone (spherochromatism adds to
 * it), with the same signs; the stand-in is the achromat's parabola without its violet curl
 * (`secondary` in lca.ts), ten times over.
 */
const LENSES: Record<string, LcaSettings> = {
  'fast lens': { lens: 'secondary', amount: 10 },
  achromat: { lens: 'achromat', amount: 1 },
  singlet: { lens: 'singlet', amount: 1 },
  'over-corrected singlet': { lens: 'singlet', amount: -1 },
};

interface Light {
  /** Metres: x right, y down from eye level, z ahead. */
  x: number;
  y: number;
  z: number;
  phase: number;
  /** 0 white, 1 the warmest. */
  warmth: number;
  level: number;
}

function buildLights(count: number): Light[] {
  const random = createRandom(97);
  return Array.from({ length: count }, () => {
    // Even in log depth, so each part of the field has lights to focus on.
    const z = NEAR * Math.pow(FAR / NEAR, random());
    const halfHeight = 0.5 * VIEW_SCALE * z;
    return {
      x: (random() * 2 - 1) * halfHeight * 1.9,
      y: (random() * 2 - 1) * halfHeight * 1.05,
      z,
      phase: random() * Math.PI * 2,
      warmth: random() ** 2,
      level: 0.5 + random(),
    };
  });
}

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    lights: { type: 'number', default: 200, min: 20, max: 800, step: 10 },
    fNumber: { type: 'number', default: 1.4, min: 1, max: 8, step: 0.1, label: 'f-number' },
    focus: { type: 'number', default: 2.4, min: 1.5, max: 30, step: 0.1, label: 'focus (m)' },
    rack: {
      type: 'number',
      default: 16,
      min: 0,
      max: 60,
      step: 1,
      label: 'focus rack (s a sweep, 0 holds)',
    },
    swing: { type: 'number', default: 0.55, min: 0, max: 1.6, step: 0.05, label: 'rack swing' },
    lens: { type: 'select', default: 'fast lens', options: Object.keys(LENSES), label: 'lens' },
    aberration: {
      type: 'number',
      default: 1,
      min: 0,
      max: 4,
      step: 0.05,
      label: 'aberration (× the lens)',
    },
    colour: {
      type: 'select',
      default: 'wavelengths',
      options: ['wavelengths', 'channels', 'none'],
      label: 'split light into',
    },
    wavelengths: { type: 'number', default: 8, min: 3, max: 16, step: 1 },
    warmth: { type: 'number', default: 0.3, min: 0, max: 1, step: 0.01, label: 'warm lights' },
    brightness: { type: 'number', default: 1, min: 0, max: 4, step: 0.05 },
    ...APERTURE_PARAMS,
    rim: { ...APERTURE_PARAMS.rim, default: 0.1 },
    vignette: { ...APERTURE_PARAMS.vignette, default: 0.15 },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.35 },
  },
  presets: {
    'fast lens': {},
    'three channels': { colour: 'channels' },
    singlet: { lens: 'singlet' },
    'red rim behind focus': { lens: 'over-corrected singlet', focus: 1.6, swing: 0.25 },
    'no aberration': { colour: 'none' },
    'f/2.8': { fNumber: 2.8, aberration: 2 },
    'held focus': { rack: 0, focus: 3 },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'spectral bokeh' });
    const layer = createPointLayer(device, { label: 'spectral bokeh', format: tail.scene.format });
    const list = new SpectralPointList([]);
    let lights: Light[] = [];
    let width = 1;
    let height = 1;
    let clock = 0;
    let focus = params.focus;

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        clock += time.delta;
        const count = Math.round(params.lights);
        if (lights.length !== count) lights = buildLights(count);

        // The focus racks slowly to and fro in log distance about its setting, so the rims swap
        // sides as lights pass through focus.
        const sweep = params.rack > 0 ? Math.sin((2 * Math.PI * clock) / params.rack) : 0;
        focus = params.focus * Math.exp(params.swing * sweep);
        const camera = {
          focalLength: FOCAL_LENGTH,
          fNumber: params.fNumber,
          focusDistance: focus,
          imageHeight: height,
        };
        const lens = lensFromCamera(camera);
        const glass = LENSES[params.lens] ?? LENSES['fast lens']!;
        const lca = { lens: glass.lens, amount: glass.amount * params.aberration };
        const bands: LcaBands =
          params.colour === 'none'
            ? 'none'
            : params.colour === 'channels'
              ? 'channels'
              : Math.round(params.wavelengths);
        list.bands = lcaBands(lens, FOCAL_LENGTH / 1000, lca, bands);
        list.clear();

        const f = focalLengthPx(camera);
        // A light's light at the lens falls off with its distance squared; one at 4 m makes a
        // disc about as bright as a bokeh-drift orb.
        const scale = 0.8 * Math.PI * (0.045 * height) ** 2 * params.brightness;
        for (const l of lights) {
          const y = l.y + 0.03 * Math.sin(clock * 0.5 + l.phase);
          const x = width / 2 + (l.x * f) / l.z;
          const radius = cocRadius(lens, l.z);
          const reach = Math.abs(radius) + 0.1 * height;
          if (x < -reach || x > width + reach) continue;
          const light = (scale * l.level) / (l.z * l.z);
          const w = params.warmth * l.warmth;
          list.push(
            x,
            height / 2 + (y * f) / l.z,
            radius,
            light,
            light * (1 - 0.3 * w),
            light * (1 - 0.6 * w),
          );
        }
        list.upload(layer);
        layer.encode(
          encoder,
          tail.scene.view,
          { width, height, aperture: params, clear: [0.0012, 0.0012, 0.0018, 1] },
          profiler,
        );
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({
        'focus (m)': focus.toFixed(2),
        lights: lights.length,
        discs: list.count,
      }),
      destroy() {
        layer.destroy();
        tail.destroy();
      },
    };
  },
});
