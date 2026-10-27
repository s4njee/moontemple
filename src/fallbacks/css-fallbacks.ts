// The CSS version of every Tier A effect (plan story 7.4), each made to look as much like the
// effect's poster as CSS reasonably can, or `null` where no honest CSS version exists. The costs
// and verdicts are measured in docs/studies/css-fallbacks.md; the side-by-side page is
// experiments/css-fallbacks.html.

import type { CssFallbackConfig } from './css-bokeh.ts';

export type { CssFallbackConfig } from './css-bokeh.ts';
export { FLASH_LIMITS, flashProblems, mountCssFallback, planCssFallback } from './css-bokeh.ts';

const AMBER = ['#c98a3a', '#dba04c', '#b0742c', '#e6b866', '#a05a22'] as const;

export const CSS_FALLBACKS: Readonly<Record<string, CssFallbackConfig | null>> = {
  'aperture-lab': null,

  'bokeh-drift': {
    seed: 31,
    background:
      'radial-gradient(circle at 50% 17%, #fff 0 5cqh, #d8d2ff 6.5cqh, #6a5ad088 10cqh, #3a2aa033 20cqh, transparent 40cqh), linear-gradient(#06041a, #030210 70%, #05031a)',
    layers: [
      {
        count: 120,
        placement: { kind: 'scatter', x: [-0.03, 1.03] },
        size: [4, 7],
        profile: 'disc',
        palette: ['#3d34d8', '#4a3fe6', '#5a42e0', '#6c48e8', '#3b49e0'],
        alpha: [0.55, 0.85],
        motion: { kind: 'travel', direction: 'up', duration: [38, 80] },
      },
      {
        count: 20,
        placement: { kind: 'scatter', x: [-0.03, 1.03] },
        size: [1.6, 3],
        profile: 'disc',
        palette: ['#5a48e8', '#8a5af0'],
        alpha: [0.35, 0.6],
        motion: { kind: 'travel', direction: 'up', duration: [90, 140] },
      },
    ],
    cannot:
      'No aperture or cat’s eye, no light kept as the discs blur, no HDR bloom on the bright light, no pointer parallax by depth; main-thread time grows with the disc count.',
    verdict: 'honest fallback',
  },

  'bokeh-loader': {
    seed: 7,
    background: '#000',
    layers: [
      {
        count: 34,
        placement: {
          kind: 'ring',
          centre: [0.5, 0.47],
          radius: 23,
          start: 282,
          sweep: 250,
          spacing: 'even',
        },
        size: [2.4, 3.2],
        profile: 'point',
        palette: ['#b8b8ff', '#ccd0ff'],
        alpha: [0.75, 1],
        layerMotion: { kind: 'spin', centre: [0.5, 0.47], duration: 9 },
      },
      {
        count: 9,
        placement: {
          kind: 'ring',
          centre: [0.5, 0.47],
          radius: 21,
          start: 168,
          sweep: 105,
          spacing: 'random',
        },
        size: [3.4, 7.4],
        profile: 'disc',
        palette: ['#8f80d8', '#a898e8', '#b4a8f0'],
        alpha: [0.55, 0.8],
        layerMotion: { kind: 'spin', centre: [0.5, 0.47], duration: 9 },
      },
    ],
    cannot:
      'An indeterminate spinner only: the orbs do not come into focus one by one with progress, and a gathered orb does not burn brighter as it shrinks; driving progress from script means a style change per step.',
    verdict: 'honest fallback',
  },

  'dust-in-light': {
    seed: 12,
    background:
      'radial-gradient(ellipse 60cqh 45cqh at 92% 0%, #8a7a5c55, transparent), linear-gradient(62deg, transparent 38%, #6e624a26 52%, #8a7c5c33 64%, #6e624a1c 76%, transparent 88%), #050505',
    layers: [
      {
        count: 180,
        placement: { kind: 'scatter' },
        size: [0.8, 1.8],
        sizeBias: 2,
        profile: 'point',
        palette: ['#fff2dc', '#f4e6c8', '#ffffff'],
        alpha: [0.45, 0.95],
        motion: { kind: 'sway', dx: 3, dy: 2.4, duration: [9, 18] },
        mask: 'linear-gradient(62deg, transparent 34%, #000 50%, #000 70%, transparent 86%)',
      },
      {
        count: 10,
        placement: { kind: 'scatter', x: [0.45, 1], y: [0, 0.6] },
        size: [1.6, 3.2],
        profile: 'glow',
        palette: ['#e8dcc0'],
        alpha: [0.18, 0.32],
        motion: { kind: 'sway', dx: 4, dy: 3, duration: [14, 24] },
        mask: 'linear-gradient(62deg, transparent 34%, #000 50%, #000 70%, transparent 86%)',
      },
    ],
    cannot:
      'No plane of focus through the beam (every mote is the same sharp point or the same soft disc), no swelling as a mote nears the lens, and the beam does not scatter light: it is a gradient.',
    verdict: 'honest fallback',
  },

  'fairy-lights': {
    seed: 5,
    background: '#020101',
    layers: [
      string(
        [-0.02, 0.04],
        [0.5, 0.36],
        [1.02, 0.22],
        52,
        [2.6, 3.2],
        'disc',
        ['#c07a32', '#cc8a40'],
        [0.75, 0.95],
      ),
      string(
        [-0.02, 0.3],
        [0.45, 0.5],
        [1.02, 0.36],
        30,
        [2.4, 3],
        'point',
        ['#ffd890', '#ffe2a8'],
        [0.8, 1],
      ),
      string(
        [-0.02, 0.5],
        [0.5, 0.66],
        [1.02, 0.46],
        34,
        [2.8, 3.4],
        'point',
        ['#ffcf80', '#f6c070'],
        [0.75, 1],
      ),
      string(
        [-0.02, 0.62],
        [0.55, 0.78],
        [1.02, 0.6],
        36,
        [3, 3.8],
        'point',
        ['#ffd890', '#ffc870'],
        [0.8, 1],
      ),
      string(
        [-0.02, 0.82],
        [0.5, 1.02],
        [1.02, 0.78],
        56,
        [2.8, 3.6],
        'disc',
        ['#c07a32', '#cc8a40', '#d49444'],
        [0.75, 0.95],
      ),
    ],
    cannot:
      'No depth: each string is one size of disc rather than discs that grow towards the lens, and the bulbs keep their light only as far as a gradient can; the twinkle is a CSS opacity dip, not the effect’s capped signal.',
    verdict: 'honest fallback',
  },

  fireflies: {
    seed: 21,
    background: 'linear-gradient(#000 0 60%, #020502)',
    layers: [
      {
        count: 55,
        placement: { kind: 'scatter' },
        size: [0.9, 2],
        profile: 'disc',
        palette: ['#9ab83a', '#88a830', '#b0c848'],
        alpha: [0.25, 0.5],
        motion: { kind: 'sway', dx: 5, dy: 4, duration: [8, 14] },
      },
      {
        count: 26,
        placement: { kind: 'scatter' },
        size: [0.8, 1.8],
        profile: 'point',
        palette: ['#e8f890', '#d8f070'],
        alpha: [0.7, 1],
        motion: { kind: 'sway', dx: 5, dy: 4, duration: [7, 13] },
        twinkle: { period: [2.6, 5.5], amplitude: 0.6 },
      },
      {
        count: 8,
        placement: { kind: 'scatter', x: [0.1, 0.9], y: [0.02, 0.75] },
        size: [3, 4.4],
        profile: 'disc',
        palette: ['#eef69a', '#e2f088'],
        alpha: [0.8, 0.95],
        motion: { kind: 'sway', dx: 6, dy: 5, duration: [9, 15] },
        twinkle: { period: [3.5, 6.5], amplitude: 0.5 },
      },
      {
        count: 6,
        placement: { kind: 'scatter', y: [0.2, 1] },
        size: [4.5, 7],
        profile: 'disc',
        palette: ['#3c5a1c', '#4a6a22'],
        alpha: [0.45, 0.6],
        motion: { kind: 'sway', dx: 6, dy: 4, duration: [12, 20] },
      },
    ],
    cannot:
      'No focus to move with the pointer: the sharp fireflies stay sharp and the soft ones soft, none swells as it drifts towards the lens, and each glow is a capped opacity dip rather than a firefly’s own rhythm.',
    verdict: 'honest fallback',
  },

  'flare-cursor': {
    seed: 3,
    background: 'linear-gradient(#0d0c18, #0a0a12)',
    layers: [
      {
        count: 5,
        placement: { kind: 'path', from: [0.56, 0.42], to: [0.3, 0.9], spacing: 'even' },
        size: [2.5, 8],
        profile: 'hex',
        palette: ['#5a3c9a', '#2c6a8a', '#8a5a34', '#6a3a7a'],
        alpha: [0.12, 0.28],
      },
    ],
    stars: [
      {
        at: [0.62, 0.32],
        length: 46,
        core: 7,
        rays: 6,
        angle: 22,
        colour: '#e8e2ff',
        alpha: 0.9,
        twinkle: { period: [3, 4], amplitude: 0.15 },
      },
    ],
    cannot:
      'It does not follow the pointer (that needs a listener moving a transform), and the ghosts do not swing round through the centre of the frame; no anamorphic streak or halation. A cursor flare that stands still is decoration.',
    verdict: 'leave it out',
  },

  'focus-cursor': {
    seed: 17,
    background: '#030201',
    layers: [
      {
        count: 110,
        placement: { kind: 'scatter', x: [-0.02, 1.02] },
        size: [3, 7],
        sizeBias: 1.4,
        profile: 'disc',
        palette: AMBER,
        alpha: [0.65, 0.95],
        motion: { kind: 'travel', direction: 'up', duration: [60, 120], skew: 3 },
      },
      {
        count: 40,
        placement: { kind: 'scatter', x: [0, 1] },
        size: [1, 2.4],
        profile: 'point',
        palette: ['#f0c070', '#e8b060'],
        alpha: [0.5, 0.9],
        motion: { kind: 'travel', direction: 'up', duration: [80, 140], skew: 2 },
      },
    ],
    cannot:
      'The focus does not follow the pointer: whatever lantern you point at stays as soft as the rest, and there is no rack between them. What is left is drifting amber discs.',
    verdict: 'poster is better',
  },

  'focus-pull': {
    seed: 23,
    background: 'linear-gradient(#05050c, #030307)',
    layers: [
      {
        count: 100,
        placement: { kind: 'scatter' },
        size: [2, 5.5],
        sizeBias: 1.6,
        profile: 'point',
        palette: ['#fff3dc', '#ffffff', '#d8d6ff', '#c4ccff', '#ffe6b8'],
        alpha: [0.8, 1],
        motion: { kind: 'sway', dx: 2, dy: 3, duration: [10, 18] },
        twinkle: { period: [3, 6], amplitude: 0.25 },
      },
      {
        count: 30,
        placement: { kind: 'scatter' },
        size: [2.2, 3.8],
        profile: 'disc',
        palette: ['#8a88b0', '#a09cc8', '#9a9090'],
        alpha: [0.25, 0.45],
        motion: { kind: 'sway', dx: 2, dy: 3, duration: [12, 22] },
      },
    ],
    cannot:
      'The lights do not swell and shrink with the scroll from the same focus distance as the sections; a scroll-driven CSS animation could scale them, but not keep their light as they grow. Behind a page that scrolls, a hundred animated discs also take main-thread time from the scroll.',
    verdict: 'poster is better',
  },

  'glint-hover': {
    seed: 9,
    background: 'linear-gradient(#0c0d16, #0a0b12)',
    layers: [],
    glintRest: 0.35,
    panels: [
      [0.03, 0.2],
      [0.355, 0.2],
      [0.68, 0.2],
      [0.03, 0.47],
      [0.355, 0.47],
      [0.68, 0.47],
    ].map(([x, y], i) => ({
      at: [x!, y!] as const,
      w: 0.3,
      h: 0.25,
      glint: {
        corner: i % 3 === 1 ? ('top-left' as const) : ('top-right' as const),
        length: 9,
        core: 1.6,
        rays: 4 as const,
        angle: 12,
        colour: '#f2f0ff' as const,
        twinkle: { period: [2.2, 3.4] as const, amplitude: 0.4 },
      },
    })),
    cannot:
      'A glint per card that brightens on :hover, not one on the corner nearest the pointer as it approaches; no reading of the page’s own element geometry, and the twinkle is an opacity dip.',
    verdict: 'honest fallback',
  },

  glitter: {
    seed: 41,
    background: 'radial-gradient(ellipse at 50% 70%, #1a1408, #070503 70%)',
    layers: [
      {
        count: 170,
        placement: { kind: 'scatter' },
        size: [1.2, 3.6],
        sizeBias: 1.5,
        profile: 'point',
        palette: ['#ffe8a8', '#f6d080', '#fff4d0'],
        alpha: [0.75, 1],
        twinkle: { period: [1.6, 3.6], amplitude: 0.6 },
      },
      {
        count: 45,
        placement: { kind: 'scatter', y: [0.2, 1] },
        size: [4, 7],
        profile: 'glow',
        palette: ['#f0c870', '#f6d890'],
        alpha: [0.75, 1],
        twinkle: { period: [2, 4], amplitude: 0.55 },
      },
    ],
    cannot:
      'Facets flash only when they mirror the light into the lens, so a moving light sends a ripple of sparks across the sheet; CSS has random, capped twinkles with no light, no ripple and no focus.',
    verdict: 'poster is better',
  },

  'ice-halo': {
    seed: 53,
    background: [
      'linear-gradient(transparent 74%, #0d0d0f 74%)',
      'radial-gradient(circle at 50% 42%, #fff 0 0.7cqh, #ffffff99 1.5cqh, #ffffff22 4cqh, transparent 9cqh)',
      'radial-gradient(circle at 50% 42%, #101117 0 28.8cqh, #4a3632 29.4cqh, #55525a 30cqh, #4a4c56 31.5cqh, #30323a 34cqh, #1e2028 40cqh, #12141a 48cqh, transparent 62cqh)',
      '#06070c',
    ].join(', '),
    layers: [
      {
        count: 90,
        placement: { kind: 'scatter', y: [0, 0.74] },
        size: [0.3, 0.6],
        profile: 'point',
        palette: ['#ffffff', '#dfe4ff'],
        alpha: [0.3, 0.7],
      },
      {
        // The moon dogs' tails, pointing away from the moon, and their bright heads on the ring.
        count: 2,
        placement: { kind: 'ring', centre: [0.5, 0.42], radius: 39, spacing: 'even' },
        size: [5, 5],
        aspect: 4,
        profile: 'glow',
        palette: ['#c8ccd8'],
        alpha: [0.5, 0.5],
      },
      {
        count: 2,
        placement: { kind: 'ring', centre: [0.5, 0.42], radius: 30.5, spacing: 'even' },
        size: [2.6, 2.6],
        profile: 'point',
        palette: ['#ffd8b0'],
        alpha: [0.9, 0.9],
      },
    ],
    cannot:
      'The ring is a gradient drawn at one radius, not light bent at the minimum deviation of ice prisms: its red inner edge and white fade are painted, and the moon dogs do not move out as the moon climbs. As a still it matches the effect, which hardly moves.',
    verdict: 'honest fallback',
  },

  'lamp-in-fog': {
    seed: 59,
    background: [
      // The post, the lamp's halo, the pool on the road, then the cone fading with distance.
      'linear-gradient(90deg, transparent calc(73.4% - 1px), #2a1f16 0 calc(73.4% + 2px), transparent 0) 0 11% / 100% 72% no-repeat',
      'radial-gradient(circle at 65% 12.5%, #fffbe8 0 1cqh, #ffd890 1.8cqh, #e8a04a66 4cqh, #a0602a22 10cqh, transparent 22cqh)',
      'radial-gradient(ellipse 62cqh 12cqh at 66% 89%, #c08040dd, #8a562a77 55%, transparent)',
      'radial-gradient(circle at 65% 12.5%, transparent 0, #0a070433 55cqh, #0a070499 95cqh)',
      'conic-gradient(from 0deg at 65% 12.5%, transparent 136deg, #b0703477 150deg, #c8843e99 180deg, #b0703477 210deg, transparent 224deg)',
      'radial-gradient(ellipse at 70% 60%, #2a1c10, #0c0805 70%)',
    ].join(', '),
    layers: [
      {
        count: 6,
        placement: { kind: 'scatter', x: [0.4, 0.95], y: [0.2, 0.85] },
        size: [30, 50],
        aspect: 1.8,
        profile: 'glow',
        palette: ['#c8843e', '#b8783a'],
        alpha: [0.12, 0.22],
        motion: { kind: 'sway', dx: 24, dy: 4, duration: [24, 40] },
        mask: 'conic-gradient(from 0deg at 65% 12.5%, transparent 136deg, #000 152deg, #000 208deg, transparent 224deg)',
      },
    ],
    cannot:
      'The halo and the cone are gradients drawn to look right, not single scattering worked out for each pixel: the cone does not brighten where you look along it, and the fog drifting through it is a few soft ellipses under a mask.',
    verdict: 'honest fallback',
  },

  'lens-light': null,
  'wire-loader': null,

  'lens-model': {
    seed: 29,
    background: '#020203',
    layers: [
      {
        count: 26,
        placement: { kind: 'scatter', x: [0, 0.55], y: [0.55, 1] },
        size: [3.5, 8],
        profile: 'disc',
        palette: ['#3a4a5a', '#5a4a38', '#3a3a48'],
        alpha: [0.3, 0.5],
      },
      {
        count: 30,
        placement: {
          kind: 'path',
          from: [0.5, 0.63],
          via: [0.25, 0.25],
          to: [0.06, 0.04],
          spacing: 'even',
          bunching: 1.4,
          sizeAlong: true,
        },
        size: [1.6, 6],
        profile: 'point',
        palette: ['#f0c070', '#e8b468'],
        alpha: [0.75, 1],
        twinkle: { period: [3, 5], amplitude: 0.15 },
      },
      {
        count: 30,
        placement: {
          kind: 'path',
          from: [0.5, 0.63],
          via: [0.72, 0.3],
          to: [0.9, 0.04],
          spacing: 'even',
          bunching: 1.4,
          sizeAlong: true,
        },
        size: [1.6, 6],
        profile: 'point',
        palette: ['#f0c070', '#e8b468'],
        alpha: [0.75, 1],
        twinkle: { period: [3, 5], amplitude: 0.15 },
      },
      {
        count: 22,
        placement: {
          kind: 'path',
          from: [0.48, 0.64],
          to: [0.18, 1.02],
          spacing: 'even',
          bunching: 1.3,
          sizeAlong: true,
        },
        size: [0.9, 2.6],
        profile: 'point',
        palette: ['#c8d4ff', '#e0e6ff'],
        alpha: [0.6, 0.95],
      },
    ],
    cannot:
      'The focus does not walk through the street, and the lamps do not turn into apertures at their own circles of confusion; switching off energy conservation, the effect’s lesson, has no CSS meaning.',
    verdict: 'poster is better',
  },

  'light-leak': {
    seed: 14,
    background:
      'radial-gradient(circle at 64% 52%, #fff6e0 0 1.8cqh, #f0b88088 3.5cqh, transparent 14cqh), linear-gradient(#34283f 0%, #6a4c64 22%, #b07c7c 40%, #d49a84 50%, #3a2c3c 53%, #5c4458 62%, #2a2030 78%, #120e16 100%)',
    layers: [
      {
        count: 4,
        placement: { kind: 'scatter', x: [-0.12, 0.02], y: [0.1, 0.9] },
        size: [70, 95],
        profile: 'glow',
        palette: ['#ff5a1e', '#ff8a2a', '#e83a1a'],
        alpha: [0.45, 0.65],
        motion: { kind: 'sway', dx: 8, dy: 14, duration: [16, 24] },
      },
      {
        count: 3,
        placement: { kind: 'scatter', x: [0.2, 0.8], y: [1.02, 1.12] },
        size: [55, 75],
        profile: 'glow',
        palette: ['#ffb040', '#ff9a30'],
        alpha: [0.35, 0.5],
        motion: { kind: 'sway', dx: 16, dy: 6, duration: [18, 28] },
      },
    ],
    cannot:
      'The leaks are gradients over the image rather than light added to it in linear HDR, and there is no flare sweeping through every few seconds with its streak and ghosts; dropping in a photo is just a background-image.',
    verdict: 'honest fallback',
  },

  'lunar-corona': {
    seed: 47,
    background:
      'radial-gradient(circle at 50% 44.4%, #fffdf6 0 6cqh, #fbf0dc 7cqh, #d8b48a 8cqh, #7a6a62 8.8cqh, #56628a 9.8cqh, #62689a 10.4cqh, #7a6a72 11.4cqh, #8a6a5a 12.4cqh, #4e4844 13.6cqh, #3a403e 15cqh, #2a2828 18cqh, #1c1a1c 26cqh, #141418 38cqh, #0e0e12 60cqh)',
    layers: [
      {
        count: 90,
        placement: { kind: 'scatter' },
        size: [0.3, 0.6],
        profile: 'point',
        palette: ['#ffffff', '#dfe4ff'],
        alpha: [0.2, 0.5],
      },
    ],
    cannot:
      'The rings are one hand-tuned gradient, not Airy patterns summed over the spectrum and the droplet sizes: they do not widen for small droplets or wash into a plain aureole for a mixed cloud, and nothing drifts. As a still it matches the effect for the cost of a gradient.',
    verdict: 'honest fallback',
  },

  // Provisional: written from the summary while the effect was still being built, before it could
  // be seen. Its poster has since appeared (a waterfall under the bow), which this does not draw.
  moonbow: {
    seed: 61,
    background: [
      'radial-gradient(circle at 50% 118%, #ffffff0c 0 72cqh, #ffffff1e 77cqh, #fff2e638 80cqh, #e6eeff2c 82.5cqh, transparent 85cqh, transparent 96cqh, #ffffff0e 99cqh, #ffffff06 102cqh, transparent 104cqh)',
      'linear-gradient(#04060a, #0a0d14 60%, #12161c)',
    ].join(', '),
    layers: [
      {
        count: 10,
        placement: { kind: 'scatter', y: [0.4, 1] },
        size: [25, 45],
        aspect: 1.6,
        profile: 'glow',
        palette: ['#9aa4b4', '#8a94a4'],
        alpha: [0.08, 0.16],
        motion: { kind: 'travel', direction: 'up', duration: [40, 70], skew: 6 },
      },
    ],
    cannot:
      'The bow is one pale gradient arc, not light traced through drops for every colour: no colours coming back with a long exposure, no bow that moves with the moon, and the spray is a few soft ellipses.',
    verdict: 'poster is better',
  },

  'moon-through-cloud': {
    seed: 43,
    background:
      'radial-gradient(circle at 62% 38%, #fff 0 7cqh, #f2f2f4 9cqh, #ffffff50 12cqh, #ffffff1c 24cqh, #ffffff08 45cqh, transparent 70cqh), #08090d',
    layers: [
      {
        count: 70,
        placement: { kind: 'scatter' },
        size: [0.3, 0.6],
        profile: 'point',
        palette: ['#ffffff', '#dfe4ff'],
        alpha: [0.25, 0.6],
      },
      {
        count: 14,
        placement: { kind: 'scatter', y: [0.05, 0.95] },
        size: [40, 70],
        aspect: 2,
        profile: 'glow',
        palette: ['#8c8c94', '#7a7a84', '#9a9aa2'],
        alpha: [0.3, 0.5],
        motion: { kind: 'travel', direction: 'right', duration: [90, 150] },
      },
    ],
    cannot:
      'The cloud is soft grey ellipses screened over a gradient moon: it is not lit by the moon, so there are no silver edges on the thin cloud nearest it and no light falling away where it thickens, and the aureole does not dim behind it.',
    verdict: 'poster is better',
  },

  'night-street': {
    seed: 19,
    background: 'linear-gradient(#060509, #0a0807 60%, #050404)',
    layers: [
      {
        count: 70,
        placement: { kind: 'scatter', y: [0, 0.75] },
        size: [8, 17],
        profile: 'disc',
        palette: ['#9c8c78', '#b08a58', '#806448', '#8c8c90'],
        alpha: [0.1, 0.24],
        motion: { kind: 'sway', dx: 2, dy: 1, duration: [10, 18] },
      },
      {
        count: 9,
        placement: { kind: 'scatter', y: [0.1, 0.7] },
        size: [6, 10],
        profile: 'disc',
        palette: ['#1e8a8a', '#c02c2c', '#a02a5a', '#2a9a7a'],
        alpha: [0.22, 0.38],
        motion: { kind: 'sway', dx: 2, dy: 1, duration: [12, 20] },
      },
      {
        count: 7,
        placement: { kind: 'scatter', x: [0.32, 0.52], y: [0.45, 0.6] },
        size: [6, 9],
        profile: 'disc',
        palette: ['#e8e8f0', '#f4f2ea'],
        alpha: [0.5, 0.7],
        motion: { kind: 'sway', dx: 10, dy: 0.5, duration: [8, 14] },
      },
      {
        count: 1,
        placement: { kind: 'scatter', x: [0.9, 0.9], y: [0.85, 0.85] },
        size: [6, 6],
        profile: 'disc',
        palette: ['#ff3a1a'],
        alpha: [0.95, 0.95],
      },
    ],
    cannot:
      'No pointer focus pull from near to far, no traffic moving in lanes (the headlights only sway), and no light kept as the discs blur; a looped video of the real effect does the plain version better.',
    verdict: 'honest fallback',
  },

  'rack-focus-transition': null,

  'snow-at-night': {
    seed: 37,
    background:
      'radial-gradient(circle at 27% 15%, #fff 0 4cqh, #ffe2a8 6cqh, #e09a48aa 12cqh, #b8702e55 32cqh, transparent 75cqh), linear-gradient(#4a2c0e, #351e08 55%, #1e1104)',
    layers: [
      {
        count: 120,
        placement: { kind: 'scatter', x: [-0.05, 1] },
        size: [0.5, 1.5],
        sizeBias: 1.8,
        profile: 'point',
        palette: ['#fff0d8', '#ffe2b0'],
        alpha: [0.5, 1],
        motion: { kind: 'travel', direction: 'down', duration: [14, 26], skew: 8 },
      },
      {
        count: 18,
        placement: { kind: 'scatter', x: [-0.05, 1] },
        size: [2, 3.6],
        profile: 'glow',
        palette: ['#ffe2b0'],
        alpha: [0.5, 0.8],
        motion: { kind: 'travel', direction: 'down', duration: [18, 30], skew: 10 },
      },
      {
        count: 8,
        placement: { kind: 'scatter', x: [-0.05, 1] },
        size: [8, 22],
        profile: 'disc',
        palette: ['#d89a48', '#c88a40'],
        alpha: [0.28, 0.45],
        motion: { kind: 'travel', direction: 'down', duration: [40, 60], skew: 14 },
      },
    ],
    cannot:
      'Flakes do not catch the lamp’s light by where they pass, and none is in focus at its own depth; the fog is a gradient and the big near discs are flat.',
    verdict: 'honest fallback',
  },
};

/** Why an effect has no CSS version, and where to look instead. */
export const NO_CSS_FALLBACK: Readonly<Record<string, { reason: string; see?: string }>> = {
  'aperture-lab': {
    reason:
      'The lab is the aperture: blade counts, f-numbers, the cat’s eye and the near row flipped through focus are its whole subject, and a CSS circle shows none of them. The contact sheet of apertures is the fallback.',
  },
  'wire-loader': {
    reason:
      'A CSS 3D cube of bordered faces can turn, but not an icosahedron, and the effect is in what CSS cannot do: hidden edges fading as the solid turns, light that stays even along every edge, corner flares and an HDR glow. A small looping video or the poster is the honest fallback.',
  },
  'lens-light': {
    reason:
      'Each piece is a lens phenomenon on its own control: spectral fringes on the discs, film halation, ghosts strung through the centre, an anamorphic streak. CSS could draw the star spikes and nothing else, which would misstate what the effect shows. The still with every effect on is the fallback.',
  },
  'rack-focus-transition': {
    reason:
      'Its CSS version is not a field of discs: `filter: blur()` and opacity on the two views, built and measured in story 6.8. It blurs without bokeh in the highlights, which is the point of the effect.',
    see: '/experiments/css-rack-focus.html',
  },
};

/** A string of bulbs hanging from `from` to `to` through `via`, swaying as one. */
function string(
  from: readonly [number, number],
  via: readonly [number, number],
  to: readonly [number, number],
  count: number,
  size: readonly [number, number],
  profile: 'disc' | 'point',
  palette: readonly `#${string}`[],
  alpha: readonly [number, number],
): CssFallbackConfig['layers'][number] {
  return {
    count,
    placement: { kind: 'path', from, via, to, spacing: 'even', spread: 0.3 },
    size,
    profile,
    palette,
    alpha,
    twinkle: { period: [2, 4.5], amplitude: 0.3 },
    layerMotion: { kind: 'sway', dx: 0.8, dy: 1.4, duration: 6 },
  };
}
