import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'dust-in-light',
  title: 'Dust in light',
  epic: '4',
  tier: 'A',
  tags: ['bokeh', 'ambient', 'volumetric', 'hero'],
  summary:
    'A shaft of sunlight slanting through a dark room towards the lens, and the dust drifting in it: motes light up only inside the beam, sharp where it crosses the plane of focus and soft discs where it comes close to the lens. The beam itself glows with the light the air scatters.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the beam and the dust.',
    useCases: ['A quiet, cinematic hero for editorial, architecture and interior sites'],
  },
};
