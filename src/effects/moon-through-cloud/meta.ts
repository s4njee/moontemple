import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'moon-through-cloud',
  title: 'Moon through cloud',
  epic: '5',
  tier: 'A',
  tags: ['moon', 'cloud', 'scattering', 'night', 'backdrop'],
  summary:
    'A bright moon through a long lens, behind thin cloud drifting across it: the glow of the aureole round it, the silver edges of the thin cloud nearest it, and the light falling away where the cloud thickens. The light source for the rest of the moonlight epic.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the moon half veiled; the drift needs the shader.',
    useCases: ['A calm night hero or section background', 'Anything about night, sleep or tides'],
  },
};
