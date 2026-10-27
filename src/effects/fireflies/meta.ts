import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'fireflies',
  title: 'Fireflies',
  epic: '4',
  tier: 'A',
  tags: ['bokeh', 'ambient', 'pointer', 'nature'],
  summary:
    'Fireflies over a meadow at dusk, wandering in depth and each glowing on its own slow rhythm, through a fast lens: the few near the plane of focus are sharp points, the rest soft discs that swell as they drift towards the lens. Move the pointer up and down to move the plane of focus through them.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the meadow with the fireflies glowing.',
    useCases: ['A calm evening hero for nature, outdoor and wellness sites'],
  },
};
