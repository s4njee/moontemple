import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'night-street',
  title: 'Night street',
  epic: '4',
  tier: 'A',
  tags: ['bokeh', 'hero', 'city', 'pointer'],
  summary:
    'A city street at night through a fast lens focused close: oncoming headlights and receding tail lights in two lanes, rows of sodium lamps, clusters of neon and slow traffic lights, every one a soft disc of its own colour. Move the pointer up and down to pull the focus from near to far.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the street; a looped video does the plain version well.',
    useCases: ['A night-time hero for city, travel, music and nightlife sites'],
  },
};
