import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'photo-focus',
  title: 'Photo focus',
  epic: '6',
  tier: 'B',
  tags: ['bokeh', 'depth of field', 'photo', 'pointer'],
  summary:
    'A photograph and its depth map, refocused after the fact: click anywhere and the lens racks to that distance, the rest falling away into real bokeh, with the brightest highlights opened back up into discs. Drop your own photo with a depth map beside it to try it on yours.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'The photograph as it is, sharp throughout.',
    useCases: [
      'Portfolio and product photos that answer a click',
      'Showing a depth map from an estimator, or a phone’s portrait mode, at work',
    ],
  },
};
