import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'glass-solid',
  title: 'Glass solid',
  epic: '9',
  tier: 'B',
  tags: ['glass', 'refraction', 'dispersion', 'spectral', 'caustics', 'night', 'hero', '3d'],
  summary:
    'A glass icosahedron turning slowly in front of a night horizon, traced per pixel and per wavelength: the horizon bends and splits into colours through the body, light reflects round inside until it finds a way out, the glass glows cyan and blue, and light gathered by its faces lies in bright patches towards the corners. Optionally a soap film on the faces, for a bubble.',
  scorecard: {
    compute: true,
    mobile: 'untested',
    flash: 'low',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the solid at rest; a short looping video for the turn.',
    useCases: [
      'A hero or section background for a product about light, optics or glass',
      'A logo mark rendered as a glass object',
      'Science and teaching pages on refraction and dispersion',
    ],
  },
};
