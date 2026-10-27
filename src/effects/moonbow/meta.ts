import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'moonbow',
  title: 'Moonbow',
  epic: '5',
  tier: 'A',
  tags: ['moon', 'water', 'refraction', 'spectral', 'night', 'backdrop'],
  summary:
    'A rainbow by moonlight in the spray of a waterfall: the moon behind you, the bow 42° round the point opposite it, brighter inside, a faint second bow beyond a dark band. Traced through water drops for every colour, then shown as the eye sees it at night, nearly white; a long exposure brings the colours back.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the falls and the pale bow.',
    useCases: [
      'A night hero or section background for travel, outdoors and nature',
      'Science pages about rainbows and night vision',
    ],
  },
};
