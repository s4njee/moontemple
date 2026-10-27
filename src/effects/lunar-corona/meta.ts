import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'lunar-corona',
  title: 'Lunar corona',
  epic: '5',
  tier: 'A',
  tags: ['moon', 'cloud', 'diffraction', 'spectral', 'night', 'backdrop'],
  summary:
    'The coloured rings round a moon in thin cloud: each water droplet diffracts the moonlight into an Airy pattern, red spreading widest, and the rings are those patterns summed over the spectrum and a spread of droplet sizes. Small droplets give big rings; an even cloud gives clear rings, a mixed one a plain aureole.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback:
      'A still of the moon and its rings; the colours come from the physics, not a gradient.',
    useCases: [
      'A calm night hero or section background',
      'Science, weather and astronomy pages that explain the corona',
    ],
  },
};
