import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'bokeh-drift',
  title: 'Bokeh drift',
  epic: '4',
  tier: 'A',
  tags: ['bokeh', 'hero', 'ambient', 'pointer'],
  summary:
    'Points of light far behind a lens focused close: a field of soft violet discs at many depths, drifting upwards under one bright light in haze. Each disc is the aperture at its own circle of confusion and keeps the light of the point it came from, so overlaps add up as they do in a photograph. The pointer shifts them by depth.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback:
      'A still of the orbs; a CSS version with radial gradients comes close (plan story 7.4).',
    useCases: [
      'A dark hero or section background that moves without asking for attention',
      'Night, music, nightlife and event sites',
    ],
  },
};
