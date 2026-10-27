import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'snow-at-night',
  title: 'Snow at night',
  epic: '4',
  tier: 'A',
  tags: ['bokeh', 'weather', 'hero', 'seasonal'],
  summary:
    'Snow falling past a street lamp in a little fog, seen through a lens focused a few metres out: flakes near the lamp catch its light, far ones are specks, and the ones that pass close to the lens are huge faint discs drifting across the frame.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the lamp and the falling snow.',
    useCases: ['A winter hero or seasonal section', 'Weather, travel and outdoor brands'],
  },
};
