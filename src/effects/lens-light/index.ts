import { addFlareGhosts } from '../../gpu/glare/flare.ts';
import { createGlareLayer, GLARE_FLOATS, spikesFor } from '../../gpu/glare/glare.ts';
import { APERTURE_PARAMS } from '../../gpu/optics/aperture.ts';
import { lensCamera } from '../../gpu/optics/camera.ts';
import { createPointLayer, PointList } from '../../gpu/points.ts';
import { trackPointer } from '../../gpu/pointer.ts';
import { createHalation } from '../../gpu/post/halation.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';

type Rgb = readonly [number, number, number];

/** The other lights, metres: a few in focus at 4 m, the rest far off. */
const LIGHTS: readonly { at: readonly [number, number, number]; colour: Rgb; intensity: number }[] =
  [
    { at: [-0.9, -0.3, 4], colour: [1, 0.75, 0.45], intensity: 0.6 },
    { at: [0.7, 0.4, 4], colour: [0.8, 0.9, 1], intensity: 0.4 },
    { at: [-4, -1.5, 25], colour: [1, 0.55, 0.2], intensity: 12 },
    { at: [3.5, -0.8, 30], colour: [0.9, 0.95, 1], intensity: 14 },
    { at: [6, 1, 22], colour: [1, 0.3, 0.5], intensity: 8 },
    { at: [-7, 0.6, 35], colour: [0.4, 0.8, 1], intensity: 16 },
    { at: [1.5, -2.5, 40], colour: [1, 0.85, 0.6], intensity: 18 },
    { at: [-2.2, 1.6, 1.6], colour: [1, 0.7, 0.4], intensity: 0.12 },
  ];

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    focus: { type: 'number', default: 4, min: 0.5, max: 40, step: 0.05, label: 'focus (m)' },
    fNumber: { type: 'number', default: 2, min: 1, max: 16, step: 0.1, label: 'f-number (50 mm)' },
    axial: {
      type: 'number',
      default: 0.06,
      min: 0,
      max: 0.3,
      step: 0.005,
      label: 'colour fringes (axial)',
    },
    lateral: {
      type: 'number',
      default: 0.004,
      min: 0,
      max: 0.02,
      step: 0.0005,
      label: 'colour spread (lateral)',
    },
    halation: { type: 'number', default: 0.25, min: 0, max: 0.8, step: 0.01 },
    halationWidth: {
      type: 'number',
      default: 0.012,
      min: 0.002,
      max: 0.05,
      step: 0.001,
      label: 'halation width',
    },
    spikeShare: { type: 'number', default: 0.05, min: 0, max: 0.3, step: 0.005, label: 'spikes' },
    spikeLength: {
      type: 'number',
      default: 0.05,
      min: 0.005,
      max: 0.2,
      step: 0.001,
      label: 'spike length',
    },
    streak: {
      type: 'number',
      default: 0,
      min: 0,
      max: 0.2,
      step: 0.005,
      label: 'anamorphic streak',
    },
    flare: { type: 'number', default: 1, min: 0, max: 4, step: 0.05, label: 'flare ghosts' },
    brightness: { type: 'number', default: 1, min: 0, max: 4, step: 0.05, label: 'main light' },
    ...APERTURE_PARAMS,
    blades: { ...APERTURE_PARAMS.blades, default: 6 },
    curvature: { ...APERTURE_PARAMS.curvature, default: 0.1 },
    vignette: { ...APERTURE_PARAMS.vignette, default: 0 },
    ...TAIL_PARAMS,
  },
  presets: {
    'every artefact': {},
    'clean lens': { axial: 0, lateral: 0, halation: 0, spikeShare: 0, streak: 0, flare: 0 },
    anamorphic: { streak: 0.08, flare: 1.8, spikeShare: 0, blades: 0 },
    vintage: {
      axial: 0.16,
      lateral: 0.01,
      halation: 0.5,
      rings: 0.15,
      ringCount: 4,
      spikeShare: 0.02,
    },
    'star filter': { spikeShare: 0.18, spikeLength: 0.12, blades: 8, curvature: 0, flare: 0.5 },
  },

  async create({ device, format, hdr, canvas, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'lens light' });
    const points = createPointLayer(device, { label: 'lens light', format: tail.scene.format });
    const glare = createGlareLayer(device, { label: 'lens light', format: tail.scene.format });
    const halation = createHalation(device, { format: tail.scene.format });
    const pointer = trackPointer(canvas);
    const list = new PointList();
    const bright = new Float32Array(16 * GLARE_FLOATS);
    let width = 1;
    let height = 1;
    let clock = 0;
    const main = { x: 0.62, y: 0.3 };

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
        halation.resize(w, h);
      },
      frame(time, encoder, target) {
        clock += time.delta;
        // The main light, far off: with the pointer, or wandering slowly round the upper frame.
        const aim = pointer.state.inside
          ? { x: pointer.state.x, y: pointer.state.y }
          : { x: 0.5 + 0.3 * Math.sin(clock * 0.13), y: 0.32 + 0.14 * Math.sin(clock * 0.21 + 1) };
        const ease = time.still ? 1 : 1 - Math.exp(-time.delta / 0.25);
        main.x += (aim.x - main.x) * ease;
        main.y += (aim.y - main.y) * ease;

        const camera = lensCamera({
          focalLength: 50,
          fNumber: params.fNumber,
          focus: params.focus,
          width,
          height,
        });
        const scale = Math.PI * (0.03 * height) ** 2;
        list.clear();
        let nBright = 0;
        // Diffraction spikes are part of a sharp point's image: out of focus they spread away with
        // the disc, half gone by a 3 px blur.
        const glareFrom = (x: number, y: number, light: Rgb, radius: number) => {
          if (nBright >= 16) return;
          const sharp = 1 / (1 + (radius / 3) ** 2);
          bright.set(
            [x, y, 0, 0, light[0] * sharp, light[1] * sharp, light[2] * sharp, 0],
            nBright * GLARE_FLOATS,
          );
          nBright++;
        };
        for (const l of LIGHTS) {
          const [px, py] = camera.project(l.at[0], l.at[1], l.at[2]);
          const radius = camera.coc(l.at[2]);
          const total = (scale * l.intensity * 100) / (l.at[2] * l.at[2]);
          const light: Rgb = [l.colour[0] * total, l.colour[1] * total, l.colour[2] * total];
          list.push(px, py, radius, light[0], light[1], light[2]);
          if (total > scale * 1.5) glareFrom(px, py, light, radius);
        }
        // The main light: very bright and far, so a disc the size of a point at infinity.
        const mainTotal = 40 * scale * params.brightness;
        const mainLight: Rgb = [mainTotal, 0.95 * mainTotal, 0.85 * mainTotal];
        const mx = main.x * width;
        const my = main.y * height;
        list.push(mx, my, camera.lens.blurAtInfinity, mainLight[0], mainLight[1], mainLight[2]);
        glareFrom(mx, my, mainLight, camera.lens.blurAtInfinity);
        if (params.flare > 0) addFlareGhosts(list, mx, my, mainLight, width, height, params.flare);

        list.upload(points);
        points.encode(
          encoder,
          tail.scene.view,
          {
            width,
            height,
            aperture: params,
            clear: [0.002, 0.002, 0.003, 1],
            chroma: {
              axial: params.axial,
              lateral: params.lateral,
              blurAtInfinity: camera.lens.blurAtInfinity,
            },
          },
          profiler,
        );
        glare.setLights(bright, nBright);
        glare.encode(
          encoder,
          tail.scene.view,
          {
            width,
            height,
            spikes: spikesFor(Math.round(params.blades)),
            rotation: (params.rotation * Math.PI) / 180 + Math.PI / 2,
            length: params.spikeLength * height,
            thickness: 0.6,
            spikeShare: params.spikeShare,
            streakShare: params.streak,
            streakLength: 0.25 * height,
          },
          profiler,
        );
        if (params.halation > 0) {
          halation.encode(
            encoder,
            tail.scene,
            { strength: params.halation, radius: params.halationWidth * height },
            profiler,
          );
        }
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({ lights: list.count }),
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
