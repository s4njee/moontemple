import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'moonlit-water',
  title: 'Moonlit water',
  epic: '5',
  tier: 'B',
  tags: ['bokeh', 'glint', 'moon', 'water', 'hero', 'pointer'],
  summary:
    'The glitter path of a low moon on a moving sea, seen through a fast 85 mm lens focused close: every glint is a point of light at its own distance, so the path becomes a river of soft discs in the shape of the aperture. Move the pointer up to pull the focus out to sea and turn the discs back into sparkle.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the moon and its path of discs; a looped video does the plain version.',
    useCases: [
      'A night hero for travel, coastal, music and wellbeing sites',
      'A calm background behind a headline',
    ],
  },
};
