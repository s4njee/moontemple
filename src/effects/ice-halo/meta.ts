import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'ice-halo',
  title: 'Ice halo',
  epic: '5',
  tier: 'A',
  tags: ['moon', 'cloud', 'refraction', 'spectral', 'night', 'winter', 'backdrop'],
  summary:
    'A ring of light 22° round the moon over a snowy field, and moon dogs either side of it: moonlight bent through the 60° prisms of hexagonal ice crystals in a thin veil of cirrostratus. Nothing is bent less than the minimum deviation, so the sky inside the ring is darker, its inner edge is sharp and red, and it fades white outwards.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the halo over the field; the ring is a single image.',
    useCases: [
      'A calm winter or night hero background',
      'Weather, astronomy and science pages about halos',
    ],
  },
};
