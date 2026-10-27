import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'dof-lab',
  title: 'Depth-of-field lab',
  epic: '3',
  tier: 'C',
  tags: ['building block', 'depth of field', 'comparison', 'reference'],
  summary:
    'One night shot, the depth-of-field methods a real-time renderer uses, and the truth they are scored against: the same shot traced through the whole lens, ray by ray, sharpening over a few seconds. Split, difference and sharp views; drag the split with the pointer.',
  scorecard: {
    compute: false,
    mobile: 'no',
    flash: 'low',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'Stills of each method beside the reference.',
    useCases: ['Choosing a depth-of-field method; a research tool, not an effect to ship'],
  },
};
